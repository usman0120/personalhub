import type { Platform } from "./schemas/entities";
import { getDomain } from "./url";

const MAP: Array<[RegExp, Platform]> = [
  [/(^|\.)instagram\.com$|^instagr\.am$/, "instagram"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "linkedin"],
  [/(^|\.)facebook\.com$|^fb\.watch$|^fb\.me$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
  [/^x\.com$|(^|\.)twitter\.com$|^t\.co$/, "x"],
  [/(^|\.)github\.com$|(^|\.)github\.io$|^gist\.github\.com$/, "github"],
  [/(^|\.)reddit\.com$|^redd\.it$/, "reddit"],
  [/(^|\.)medium\.com$/, "medium"],
];

/** Detects the platform from a URL. Returns "web" for any other http(s) URL and "other" when there is no URL. */
export function detectPlatform(url: string | null | undefined): Platform {
  const domain = getDomain(url);
  if (!domain) return "other";
  for (const [re, p] of MAP) if (re.test(domain)) return p;
  return "web";
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  web: "Web",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  github: "GitHub",
  reddit: "Reddit",
  medium: "Medium",
  other: "Other",
};
