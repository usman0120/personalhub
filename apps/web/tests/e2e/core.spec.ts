import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Requires: emulators running, NEXT_PUBLIC_USE_EMULATORS=1, AI_MOCK=1, and the owner seeded with
// `node scripts/seed-emulator.mjs $E2E_EMAIL` (password from EMULATOR_PASSWORD or the script default).
const email = process.env.E2E_EMAIL ?? "owner@example.com";
const password = process.env.EMULATOR_PASSWORD ?? "devpassword123";

async function signIn(page: Page) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("textbox", { name: "Quick capture" })).toBeVisible({ timeout: 20_000 });
}

test("health endpoint", async ({ request }) => {
  const res = await request.get("/api/health");
  expect((await res.json()).ok).toBe(true);
});

test("quick add → inbox triage with keyboard", async ({ page }) => {
  await signIn(page);
  const box = page.getByRole("textbox", { name: "Quick capture" });
  await box.fill(`Remember e2e note ${Date.now()} #e2e`);
  await box.press("Enter");
  await box.fill("todo: e2e task tomorrow !1");
  await box.press("Enter");
  await page.goto("/inbox");
  if (test.info().project.name === "mobile") {
    // Mobile inbox is a one-at-a-time card stack: the active item's title is an editable field.
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(/Remember e2e note/);
  } else {
    await expect(page.getByText(/Remember e2e note/).first()).toBeVisible();
  }
  await page.keyboard.press("k");
  await expect(page.getByText("Item kept").or(page.getByText("Accepted and kept"))).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByText("e2e task").first()).toBeVisible();
});

test("accounts secret guard blocks passwords", async ({ page }) => {
  await signIn(page);
  await page.goto("/accounts?new=1");
  await page.getByLabel("Service").fill("Vercel");
  await page.getByLabel("Notes").fill("password: abc123");
  await expect(page.getByRole("alert")).toContainText("looks like a secret");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
});

for (const path of ["/", "/inbox", "/library", "/tasks", "/projects", "/accounts", "/settings/general"]) {
  test(`a11y: ${path}`, async ({ page }) => {
    await signIn(page);
    await page.goto(path);
    // Firestore keeps a live channel open, so "networkidle" never settles; wait for the page body.
    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 10_000 });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ") + " " + (n.any[0]?.message ?? "")).join(" | ")}`)).toEqual([]);
  });
}
