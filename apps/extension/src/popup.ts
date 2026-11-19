import { cleanTags, type CaptureInput } from "@personalhub/shared";
import { ApiError, captureOrQueue, flushQueue, getSettings, isRestricted, queueSize, readPage, suggest, taxonomy, undoCapture } from "./lib/api";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  title: $<HTMLInputElement>("title"), url: $("url"), favicon: $<HTMLImageElement>("favicon"), selection: $("selection"),
  areas: $("areas"), tags: $<HTMLInputElement>("tags"), tagList: $("tagList"), note: $<HTMLTextAreaElement>("note"),
  ai: $<HTMLInputElement>("ai"), msg: $("msg"), save: $<HTMLButtonElement>("save"), form: $("form"), done: $("done"),
  doneTitle: $("doneTitle"), doneSub: $("doneSub"), openItem: $<HTMLAnchorElement>("openItem"), undo: $<HTMLAnchorElement>("undo"),
  footer: $("footer"), queue: $("queue"), more: $("more"), menu: $("menu"),
};

let tab: chrome.tabs.Tab | undefined;
let kind: "link" | "idea" | "note" = "link";
let areaId: string | null = null;
let page = { selection: "", description: "" };
let hubUrl = "";

const say = (text: string, tone: "ok" | "err" | "warn" | "" = "") => {
  els.msg.textContent = text;
  els.msg.className = `msg ${tone}`;
};

function renderAreas(areas: Array<{ id: string; name: string; color: string }>) {
  els.areas.replaceChildren(
    ...areas.map((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(a.id === areaId));
      const dot = document.createElement("i");
      dot.style.background = a.color;
      b.append(dot, document.createTextNode(a.name));
      b.onclick = () => {
        areaId = areaId === a.id ? null : a.id;
        for (const c of els.areas.children) c.setAttribute("aria-checked", "false");
        b.setAttribute("aria-checked", String(areaId === a.id));
      };
      return b;
    }),
  );
}

async function updateQueue() {
  const n = await queueSize();
  els.queue.textContent = n ? `${n} queued` : "";
}

async function init() {
  const settings = await getSettings();
  hubUrl = settings.hubUrl.replace(/\/$/, "");
  areaId = settings.defaultAreaId;
  els.ai.checked = settings.autoAi;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  els.title.value = tab?.title ?? "";
  els.url.textContent = tab?.url ?? "";
  if (tab?.favIconUrl && /^https?:/.test(tab.favIconUrl)) {
    els.favicon.src = tab.favIconUrl;
    els.favicon.hidden = false;
  }
  if (!settings.token) {
    say("Add your capture token in Options to start saving.", "warn");
    els.save.textContent = "Open Options";
    els.save.onclick = () => chrome.runtime.openOptionsPage();
    return;
  }
  if (tab?.id) page = await readPage(tab.id, tab.url);
  if (page.selection) {
    els.selection.textContent = page.selection;
    els.selection.hidden = false;
  }
  if (isRestricted(tab?.url)) say("This page can't be read; only its URL will be saved.", "warn");
  void flushQueue().then(updateQueue);
  try {
    const t = await taxonomy();
    areaId ??= t.defaultAreaId;
    renderAreas(t.areas);
    els.tagList.replaceChildren(...t.tags.slice(0, 100).map((x) => Object.assign(document.createElement("option"), { value: x.slug })));
  } catch (e) {
    say(e instanceof ApiError && e.offline ? "Offline — saves will be queued." : (e as Error).message, "warn");
  }
  els.title.focus();
  els.title.select();
}

async function save() {
  if (!tab?.url) return;
  els.save.disabled = true;
  say("Saving…");
  const input: CaptureInput = {
    source: "extension",
    kind,
    title: els.title.value.trim() || undefined,
    ...(kind === "link" || /^https?:/.test(tab.url) ? { url: /^https?:/.test(tab.url) ? tab.url : undefined } : {}),
    ...(!/^https?:/.test(tab.url) ? { text: `${els.title.value} ${tab.url}` } : {}),
    selection: page.selection || undefined,
    description: page.description || undefined,
    note: els.note.value.trim() || undefined,
    areaId: areaId ?? undefined,
    tags: cleanTags(els.tags.value.split(/[,\s]+/)),
    faviconUrl: tab.favIconUrl && /^https?:/.test(tab.favIconUrl) ? tab.favIconUrl : undefined,
    runAi: els.ai.checked,
  };
  try {
    const r = await captureOrQueue(input);
    els.form.hidden = true;
    els.footer.hidden = true;
    els.done.hidden = false;
    if (r.queued) {
      els.doneTitle.textContent = "Queued";
      els.doneSub.textContent = "You're offline. It will be sent automatically.";
      els.openItem.hidden = els.undo.hidden = $("undoSep").hidden = true;
    } else if (r.result) {
      const { itemId, duplicateOf } = r.result;
      els.doneTitle.textContent = duplicateOf ? "Already saved" : "Saved ✓";
      els.doneSub.textContent = duplicateOf ? "Your note was added to the existing item." : "It's in your Inbox.";
      els.openItem.onclick = (e) => {
        e.preventDefault();
        void chrome.tabs.create({ url: `${hubUrl}/item/${itemId}` });
      };
      if (duplicateOf) els.undo.hidden = $("undoSep").hidden = true;
      els.undo.onclick = async (e) => {
        e.preventDefault();
        try {
          await undoCapture(itemId);
          els.doneTitle.textContent = "Removed";
          els.doneSub.textContent = "";
          els.undo.hidden = $("undoSep").hidden = els.openItem.hidden = true;
        } catch (err) {
          els.doneSub.textContent = (err as Error).message;
        }
      };
      if (els.ai.checked && !duplicateOf) void suggest(itemId).catch(() => {});
      setTimeout(() => window.close(), 4000);
    }
  } catch (e) {
    say((e as Error).message, "err");
    els.save.disabled = false;
  }
}

async function saveAllTabs() {
  els.menu.hidden = true;
  const granted = await chrome.permissions.request({ permissions: ["tabs"] });
  if (!granted) return say("Permission needed to read all tabs.", "warn");
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((t) => !t.pinned && t.url && /^https?:/.test(t.url)).slice(0, 50);
  if (!tabs.length) return say("No tabs to save.", "warn");
  if (!confirm(`Save ${tabs.length} tabs to your Inbox?`)) return;
  const tag = `session-${new Date().toISOString().slice(0, 10)}`;
  let ok = 0;
  let queued = 0;
  for (const [i, t] of tabs.entries()) {
    say(`Saving ${i + 1}/${tabs.length}…`);
    try {
      const r = await captureOrQueue({ source: "extension", url: t.url, title: t.title, tags: [tag], faviconUrl: t.favIconUrl });
      if (r.queued) queued++;
      else ok++;
    } catch {
      /* skip */
    }
  }
  say(`Saved ${ok} tabs${queued ? `, ${queued} queued` : ""} · #${tag}`, "ok");
  void updateQueue();
}

document.querySelectorAll<HTMLButtonElement>(".seg button").forEach((b) => {
  b.onclick = () => {
    kind = b.dataset.kind as typeof kind;
    document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  };
});
els.save.onclick = () => void save();
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement) && !els.save.disabled && !els.form.hidden) {
    e.preventDefault();
    void save();
  }
  if (e.key === "Escape") els.menu.hidden = true;
});
els.more.onclick = () => (els.menu.hidden = !els.menu.hidden);
$("saveAll").onclick = () => void saveAllTabs();
$("openHub").onclick = () => void chrome.tabs.create({ url: hubUrl });
$("openOptions").onclick = () => chrome.runtime.openOptionsPage();

void init().then(updateQueue);
