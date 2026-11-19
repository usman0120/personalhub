import "server-only";
import { createHash, createHmac } from "node:crypto";

/** Storage adapter. `none` stores no binaries; `r2` presigns S3-compatible URLs (SigV4, no SDK). */
export const storageDriver = () => (process.env.STORAGE_DRIVER === "r2" ? "r2" : "none");

export function r2Configured(): boolean {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const sha = (data: string) => createHash("sha256").update(data).digest("hex");
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function presign(method: "GET" | "PUT" | "DELETE", key: string, expiresSec: number, now = new Date()): string {
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const path = `/${process.env.R2_BUCKET}/${key.split("/").map(enc).join("/")}`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${process.env.R2_ACCESS_KEY_ID}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k]!)}`).join("&");
  const canonical = [method, path, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const kDate = hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, date);
  const kSigning = hmac(hmac(hmac(kDate, region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  return `https://${host}${path}?${qs}&X-Amz-Signature=${signature}`;
}
