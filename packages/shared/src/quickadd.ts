import * as chrono from "chrono-node";
import { extractFirstUrl, isHttpUrl } from "./url";
import { slugify } from "./text";

export type QuickAddType = "link" | "task" | "idea" | "note";

export interface ParsedTask {
  title: string;
  due: number | null;
  dueHasTime: boolean;
  priority: 1 | 2 | 3;
  projectToken: string | null;
  tags: string[];
  areaToken: string | null;
}

export interface QuickAddResult {
  type: QuickAddType;
  /** Text with prefixes and tokens removed. */
  title: string;
  text: string;
  url: string | null;
  tags: string[];
  areaToken: string | null;
  task: ParsedTask | null;
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;
const AREA_RE = /(^|\s)@([\p{L}\p{N}_-]{1,40})/gu;
const PRIORITY_RE = /(^|\s)!([123])(?=\s|$)/;

function collect(re: RegExp, text: string): { tokens: string[]; rest: string } {
  const tokens: string[] = [];
  const rest = text.replace(re, (_m, lead: string, tok: string) => {
    tokens.push(tok);
    return lead;
  });
  return { tokens, rest };
}

const squash = (s: string) => s.replace(/\s{2,}/g, " ").trim();

/**
 * Parses natural-language task text: "submit proposal fri 5pm !1 #PersonalHub @study".
 * `#token` is the project (first one), `@token` the area, `!1..3` the priority (1 = high).
 */
export function parseTask(input: string, now: Date = new Date()): ParsedTask {
  let text = input.trim();
  let priority: 1 | 2 | 3 = 2;
  const pm = PRIORITY_RE.exec(text);
  if (pm) {
    priority = Number(pm[2]) as 1 | 2 | 3;
    text = text.replace(PRIORITY_RE, "$1");
  }
  const tagRes = collect(TAG_RE, text);
  const areaRes = collect(AREA_RE, tagRes.rest);
  text = areaRes.rest;

  let due: number | null = null;
  let dueHasTime = false;
  const results = chrono.parse(text, now, { forwardDate: true });
  const r = results[0];
  if (r) {
    const date = r.start.date();
    dueHasTime = r.start.isCertain("hour");
    if (!dueHasTime) date.setHours(23, 59, 0, 0);
    due = date.getTime();
    text = text.slice(0, r.index) + text.slice(r.index + r.text.length);
  }
  const title = squash(text) || squash(input);
  return {
    title,
    due,
    dueHasTime,
    priority,
    projectToken: tagRes.tokens[0] ?? null,
    tags: [],
    areaToken: areaRes.tokens[0] ?? null,
  };
}

/** Quick capture parser: URL → link; `[]`/`todo:` → task; `idea:` → idea; else note. */
export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  if (lower.startsWith("[]") || lower.startsWith("[ ]") || lower.startsWith("todo:")) {
    const body = raw.replace(/^(\[\s?\]|todo:)\s*/i, "");
    const task = parseTask(body, now);
    return { type: "task", title: task.title, text: body, url: null, tags: [], areaToken: task.areaToken, task };
  }

  let type: QuickAddType = "note";
  let body = raw;
  if (lower.startsWith("idea:")) {
    type = "idea";
    body = raw.slice(5).trim();
  }

  const tagRes = collect(TAG_RE, body);
  const areaRes = collect(AREA_RE, tagRes.rest);
  const rest = squash(areaRes.rest);
  const tags = [...new Set(tagRes.tokens.map(slugify).filter(Boolean))];

  const url = isHttpUrl(rest) ? rest : extractFirstUrl(rest);
  if (url && type === "note") type = "link";

  let title = rest;
  if (url) title = squash(rest.replace(url, ""));
  const firstLine = title.split("\n")[0] ?? "";
  return {
    type,
    title: firstLine.slice(0, 300),
    text: rest,
    url,
    tags,
    areaToken: areaRes.tokens[0] ?? null,
    task: null,
  };
}
