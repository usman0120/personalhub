/** kebab-case slug used for tag ids: "Free Tier!" → "free-tier". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Dedupes and slugifies a list of tags, preserving order. */
export function cleanTags(tags: Iterable<string>, max = 20): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const s = slugify(t);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Short id suitable for client-side ids (action ids, area ids). */
export function shortId(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
