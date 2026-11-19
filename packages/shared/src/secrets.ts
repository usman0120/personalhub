export type SecretMatch = { label: string };

const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "password", re: /\b(password|passwd|pass|pwd)\s*[:=]/i },
  { label: "one-time or backup code", re: /\b(code|otp|backup|recovery)\b[^\n\d]{0,20}\b\d{6,8}\b/i },
  { label: "one-time or backup code", re: /\b\d{6,8}\b[^\n\d]{0,20}\b(code|otp|backup)\b/i },
  { label: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "API key (sk-)", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]+/ },
  { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "TOTP seed", re: /\b[A-Z2-7]{16,}={0,6}\b/ },
];

const SEED_WORD = /^[a-z]{3,8}$/;

function looksLikeSeedPhrase(text: string): boolean {
  for (const line of text.split(/\n/)) {
    const words = line.trim().split(/\s+/);
    if ((words.length === 12 || words.length === 24) && words.every((w) => SEED_WORD.test(w))) return true;
  }
  return false;
}

/** Finds secret-looking content. Accounts block save on any match; item notes only warn. */
export function findSecrets(text: string | null | undefined): SecretMatch[] {
  if (!text) return [];
  const found = new Map<string, SecretMatch>();
  for (const { label, re } of PATTERNS) if (re.test(text)) found.set(label, { label });
  if (looksLikeSeedPhrase(text)) found.set("seed phrase", { label: "seed phrase" });
  return [...found.values()];
}

export function hasSecret(...texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => findSecrets(t).length > 0);
}
