"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Toast with a 5 s Undo action for destructive or bulk actions. */
export function undoToast(message: string, undo: () => unknown) {
  toast(message, { duration: 5000, action: { label: "Undo", onClick: () => void undo() } });
}

export const toastError = (e: unknown, fallback = "Something went wrong") =>
  toast.error(e instanceof Error ? e.message : fallback);

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

/** "3h ago", "yesterday", "in 2 days" */
export function relativeTime(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "";
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000], ["month", 2_592_000_000], ["week", 604_800_000], ["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000],
  ];
  for (const [unit, size] of units) if (abs >= size) return rtf!.format(Math.round(diff / size), unit);
  return "just now";
}

export function shortDate(ms: number | null | undefined, withTime = false): string {
  if (!ms) return "";
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}

/** Current time; use in event handlers. Render code should use useNow(). */
export const nowMs = () => Date.now();

/** Re-renders every `intervalMs` so relative dates and overdue states stay fresh. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const DAY = 86_400_000;

/** Convert between epoch ms and <input type="date"> values. */
export const toDateInput = (ms: number | null | undefined) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromDateInput = (v: string, endOfDay = false) => {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, m! - 1, d!, endOfDay ? 23 : 0, endOfDay ? 59 : 0).getTime();
};

export const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
