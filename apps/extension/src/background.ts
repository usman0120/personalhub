import { captureOrQueue, flashBadge, flushQueue, getSettings, isRestricted, readPage, suggest } from "./lib/api";

const MENUS = [
  { id: "save-page", title: "Save page to PersonalHub", contexts: ["page"] },
  { id: "save-link", title: "Save link", contexts: ["link"] },
  { id: "save-selection", title: "Save selection as note", contexts: ["selection"] },
  { id: "save-image", title: "Save image link", contexts: ["image"] },
] as const;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create({ id: m.id, title: m.title, contexts: [...m.contexts] as [chrome.contextMenus.ContextType, ...chrome.contextMenus.ContextType[]] });
  });
  void flushQueue();
});
chrome.runtime.onStartup.addListener(() => void flushQueue());

async function save(input: Parameters<typeof captureOrQueue>[0]) {
  try {
    const { defaultAreaId, autoAi } = await getSettings();
    const r = await captureOrQueue({ areaId: defaultAreaId ?? undefined, runAi: autoAi, ...input });
    await flashBadge(r.queued ? "!" : "✓");
    if (r.result && autoAi && !r.result.duplicateOf) void suggest(r.result.itemId).catch(() => {});
  } catch {
    await flashBadge("!");
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const pageUrl = info.pageUrl ?? tab?.url;
  switch (info.menuItemId) {
    case "save-page":
      if (!isRestricted(pageUrl) || pageUrl?.startsWith("http")) void save({ source: "extension", url: pageUrl, title: tab?.title, faviconUrl: tab?.favIconUrl });
      break;
    case "save-link":
      void save({ source: "extension", url: info.linkUrl, title: info.selectionText || undefined });
      break;
    case "save-selection":
      void save({ source: "extension", kind: "note", text: info.selectionText ?? "", note: pageUrl ? `Source: ${tab?.title ?? ""} ${pageUrl}`.trim() : undefined, title: (info.selectionText ?? "").slice(0, 80) });
      break;
    case "save-image":
      void save({ source: "extension", url: info.srcUrl, title: `Image from ${tab?.title ?? "page"}`, note: pageUrl ? `Found on ${pageUrl}` : undefined });
      break;
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "quick-save") return;
  const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!active?.url || !/^https?:/.test(active.url)) return void flashBadge("!");
  const page = active.id ? await readPage(active.id, active.url) : { selection: "", description: "" };
  await save({ source: "extension", url: active.url, title: active.title, faviconUrl: active.favIconUrl, selection: page.selection || undefined, description: page.description || undefined });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "flush") void flushQueue().then(reply);
  return true;
});
