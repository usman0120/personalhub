import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;
let db: Firestore | undefined;

/** Env UIs often keep the quotes from a pasted .env line; strip one matching pair. */
export const unquote = (v?: string) => v?.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim() || undefined;

/** Accepts the key with real newlines, literal "\n" sequences, or wrapped in quotes. */
export function normalizePrivateKey(v?: string): string | undefined {
  const key = unquote(v)?.replace(/\\n/g, "\n").replace(/\r/g, "");
  return key ? (key.endsWith("\n") ? key : `${key}\n`) : undefined;
}

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]!);
  const projectId = unquote(process.env.FIREBASE_ADMIN_PROJECT_ID) || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-personalhub";
  const clientEmail = unquote(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8180";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9199";
    app = initializeApp({ projectId });
  } else if (clientEmail && privateKey) {
    app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  } else {
    throw new Error("Firebase Admin credentials are not configured");
  }
  return app;
}

/** Admin SDK status for /api/health: names which env var is missing or malformed, never its value. */
export function adminStatus(): string {
  try {
    adminApp();
    return "ok";
  } catch {
    const missing = ["FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY"].filter((k) => !unquote(process.env[k]));
    if (missing.length) return `missing ${missing.join(", ")}`;
    const key = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY)!;
    if (!key.startsWith("-----BEGIN PRIVATE KEY-----\n")) return "FIREBASE_ADMIN_PRIVATE_KEY must start with -----BEGIN PRIVATE KEY----- followed by \\n";
    if (!key.includes("\n-----END PRIVATE KEY-----")) return "FIREBASE_ADMIN_PRIVATE_KEY is truncated (no END line)";
    return "FIREBASE_ADMIN_PRIVATE_KEY does not parse; re-copy private_key from the JSON file";
  }
}

export function adminDb(): Firestore {
  if (!db) {
    db = getFirestore(adminApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

export const adminAuth = () => getAuth(adminApp());

/** Recursively converts admin Timestamps to epoch millis. */
export function fromAdmin<T>(value: unknown): T {
  if (value instanceof Timestamp) return value.toMillis() as T;
  if (Array.isArray(value)) return value.map((v) => fromAdmin(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromAdmin(v);
    return out as T;
  }
  return value as T;
}
