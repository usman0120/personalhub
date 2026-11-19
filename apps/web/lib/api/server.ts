import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import type { ErrorCode } from "@personalhub/shared";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_INPUT: 400, NOT_FOUND: 404, RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502, AI_NOT_CONFIGURED: 409, INTERNAL: 500,
};
export const fail = (code: ErrorCode, message: string, details?: unknown) =>
  new ApiError(code, message, STATUS[code], details);

export type AuthMode = "idToken" | "captureToken";
export interface AuthContext {
  uid: string;
  mode: AuthMode;
  scopes: string[];
  email?: string;
}

export const ownerEmails = () =>
  (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(`${process.env.CAPTURE_TOKEN_PEPPER ?? ""}${token}`).digest("hex");
}
export function generateCaptureToken(): string {
  return `ph_${randomBytes(32).toString("base64url")}`;
}

/** Verifies `Authorization: Bearer <Firebase ID token | ph_ capture token>`. */
export async function authenticate(req: Request, modes: AuthMode[], scope?: string): Promise<AuthContext> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw fail("UNAUTHENTICATED", "Missing bearer token");

  if (token.startsWith("ph_")) {
    if (!modes.includes("captureToken")) throw fail("UNAUTHENTICATED", "Capture tokens are not accepted here");
    const ref = adminDb().collection("captureTokens").doc(hashCaptureToken(token));
    const snap = await ref.get();
    const data = snap.data();
    if (!snap.exists || !data || data.revokedAt) throw fail("UNAUTHENTICATED", "Invalid or revoked token");
    const scopes: string[] = data.scopes ?? [];
    if (scope && !scopes.includes(scope)) throw fail("FORBIDDEN", "Token lacks the required scope");
    const last = (data.lastUsedAt as Timestamp | null)?.toMillis() ?? 0;
    if (Date.now() - last > 3_600_000) void ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
    return { uid: data.uid as string, mode: "captureToken", scopes };
  }

  if (!modes.includes("idToken")) throw fail("UNAUTHENTICATED", "ID tokens are not accepted here");
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw fail("UNAUTHENTICATED", "Invalid or expired session");
  }
  const email = decoded.email?.toLowerCase();
  if (!decoded.email_verified || !email || !ownerEmails().includes(email)) {
    throw fail("FORBIDDEN", "This PersonalHub belongs to someone else");
  }
  return { uid: decoded.uid, mode: "idToken", scopes: ["*"], email };
}

/** Fixed-window per-uid rate limit stored in `rateLimits/{uid}_{bucket}_{window}`. */
export async function rateLimit(uid: string, bucket: string, limit: number, windowSec = 60): Promise<void> {
  const windowId = Math.floor(Date.now() / (windowSec * 1000));
  const ref = adminDb().collection("rateLimits").doc(`${uid}_${bucket}_${windowId}`);
  const count = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.data()?.count as number) ?? 0) + 1;
    tx.set(ref, { count: next, windowStart: Timestamp.fromMillis(windowId * windowSec * 1000) });
    return next;
  });
  if (count > limit) {
    const retryAfter = windowSec - Math.floor((Date.now() / 1000) % windowSec);
    throw fail("RATE_LIMITED", `Too many requests. Try again in ${retryAfter}s`, { retryAfter });
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const allowed = [
    process.env.APP_ORIGIN,
    ...(process.env.EXTENSION_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).map((id) => `chrome-extension://${id}`),
  ].filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflight(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export const ok = <T>(req: Request, data: T, status = 200) =>
  NextResponse.json({ ok: true, data }, { status, headers: corsHeaders(req) });

export function errorResponse(req: Request, err: unknown) {
  const e = err instanceof ApiError ? err : null;
  if (!e) console.error(JSON.stringify({ level: "error", route: new URL(req.url).pathname, msg: (err as Error)?.message }));
  const code: ErrorCode = e?.code ?? "INTERNAL";
  const body = { ok: false, error: { code, message: e?.message ?? "Something went wrong", ...(e?.details ? { details: e.details } : {}) } };
  const headers: Record<string, string> = corsHeaders(req);
  const retry = (e?.details as { retryAfter?: number } | undefined)?.retryAfter;
  if (retry) headers["Retry-After"] = String(retry);
  return NextResponse.json(body, { status: e?.status ?? 500, headers });
}

const MAX_BODY = 1_000_000;
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = MAX_BODY): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw fail("INVALID_INPUT", "Request body too large");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new Error("too large");
    raw = JSON.parse(text || "{}");
  } catch {
    throw fail("INVALID_INPUT", "Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw fail("INVALID_INPUT", "Invalid input", parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })));
  return parsed.data;
}

type Handler = (req: NextRequest, ctx: AuthContext, params: Record<string, string>) => Promise<Response>;

/** Wraps a route: auth → general rate limit (60/min) → handler; all errors become the error envelope. */
export function route(modes: AuthMode[], handler: Handler, opts: { scope?: string; limit?: number } = {}) {
  return async (req: NextRequest, segment: { params: Promise<Record<string, string>> }) => {
    try {
      const auth = await authenticate(req, modes, opts.scope);
      await rateLimit(auth.uid, "all", opts.limit ?? 60);
      return await handler(req, auth, (await segment?.params) ?? {});
    } catch (err) {
      return errorResponse(req, err);
    }
  };
}

export const userRef = (uid: string) => adminDb().collection("users").doc(uid);
