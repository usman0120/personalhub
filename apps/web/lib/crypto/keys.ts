import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/** Key for a version: KEY_ENCRYPTION_SECRET for the current version, KEY_ENCRYPTION_SECRET_V{n} for older ones. */
function keyFor(version: number): Buffer {
  const current = Number(process.env.KEY_ENCRYPTION_VERSION ?? 1);
  const raw = version === current ? process.env.KEY_ENCRYPTION_SECRET : process.env[`KEY_ENCRYPTION_SECRET_V${version}`];
  if (!raw) throw new Error("Encryption key is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (base64)");
  return key;
}

export const currentKeyVersion = () => Number(process.env.KEY_ENCRYPTION_VERSION ?? 1);

/** AES-256-GCM with a random 12-byte IV per encryption. */
export function encryptSecret(plaintext: string, version = currentKeyVersion()): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(version), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: version,
  };
}

/** Throws if the ciphertext or tag was tampered with. */
export function decryptSecret(s: EncryptedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", keyFor(s.keyVersion), Buffer.from(s.iv, "base64"));
  decipher.setAuthTag(Buffer.from(s.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(s.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export const needsRotation = (s: EncryptedSecret) => s.keyVersion !== currentKeyVersion();
