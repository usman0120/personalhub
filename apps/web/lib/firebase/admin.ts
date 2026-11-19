import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;
let db: Firestore | undefined;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]!);
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-personalhub";
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
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
