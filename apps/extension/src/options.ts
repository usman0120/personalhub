import { getSettings, saveSettings, taxonomy, validHubUrl } from "./lib/api";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hubUrl = $<HTMLInputElement>("hubUrl");
const token = $<HTMLInputElement>("token");
const area = $<HTMLSelectElement>("area");
const autoAi = $<HTMLInputElement>("autoAi");
const msg = $("msg");

const say = (t: string, tone: "ok" | "err" | "" = "") => {
  msg.textContent = t;
  msg.className = `msg ${tone}`;
};

async function loadAreas(selected: string | null) {
  try {
    const t = await taxonomy(true);
    area.replaceChildren(
      Object.assign(document.createElement("option"), { value: "", textContent: "None (let rules decide)" }),
      ...t.areas.map((a) => Object.assign(document.createElement("option"), { value: a.id, textContent: a.name, selected: a.id === selected })),
    );
    return true;
  } catch (e) {
    say((e as Error).message, "err");
    return false;
  }
}

async function init() {
  const s = await getSettings();
  hubUrl.value = s.hubUrl;
  token.value = s.token;
  autoAi.checked = s.autoAi;
  if (s.token) await loadAreas(s.defaultAreaId);
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = hubUrl.value.trim().replace(/\/$/, "");
  if (!validHubUrl(url)) return say("Hub URL must start with https://", "err");
  if (token.value && !token.value.startsWith("ph_")) return say("Capture tokens start with ph_", "err");
  await saveSettings({ hubUrl: url, token: token.value.trim(), defaultAreaId: area.value || null, autoAi: autoAi.checked });
  await chrome.storage.local.remove("taxonomy");
  say("Saved.", "ok");
});

$("test").addEventListener("click", async () => {
  await saveSettings({ hubUrl: hubUrl.value.trim().replace(/\/$/, ""), token: token.value.trim() });
  say("Testing…");
  if (await loadAreas(area.value || null)) say("Connected ✓", "ok");
});

void init();
