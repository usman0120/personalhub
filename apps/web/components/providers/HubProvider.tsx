"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import {
  DEFAULT_SETTINGS, SEED_RULES, SettingsSchema, type Settings, type UserDoc,
} from "@personalhub/shared";
import { firebaseAuth, firestore } from "@/lib/firebase/client";
import { ClientApiError, api } from "@/lib/api/client";
import { fromFs, toFs } from "@/lib/data/store";
import { purge, setUid, stores, tagStore, type TagDoc } from "@/lib/data/repos";
import { deleteConversation } from "@/lib/data/repos";

type Status = "loading" | "signedOut" | "rejected" | "ready";

interface HubContext {
  status: Status;
  user: User | null;
  profile: UserDoc | null;
  settings: Settings;
  rejectedMessage: string | null;
  signOutNow: () => Promise<void>;
}

const Ctx = createContext<HubContext | null>(null);
const OWNER_OK_KEY = "ph-owner-ok";

async function seedUser(user: User) {
  const db = firestore();
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return;
  await setDoc(userRef, {
    email: user.email,
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "Owner",
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
    settings: toFs(DEFAULT_SETTINGS),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const batch = writeBatch(db);
  for (const { id, ...rule } of SEED_RULES) {
    batch.set(doc(db, "users", user.uid, "rules", id), { ...rule, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

/** Client-side maintenance on app open: purge trash > 30 days, keep 50 latest conversations. */
function maintenance() {
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const name of ["items", "projects", "tasks", "accounts"] as const) {
    for (const d of stores[name].all()) {
      if (d.isDeleted && d.deletedAt && d.deletedAt < cutoff) void purge(name, d.id).catch(() => {});
    }
  }
  const convs = [...stores.conversations.all()].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const c of convs.slice(50)) void deleteConversation(c.id).catch(() => {});
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [rejectedMessage, setRejected] = useState<string | null>(null);

  useEffect(() => {
    const auth = firebaseAuth();
    let cleanup: Array<() => void> = [];
    const stop = () => {
      cleanup.forEach((f) => f());
      cleanup = [];
      Object.values(stores).forEach((s) => s.stop());
    };
    const unsubAuth = onAuthStateChanged(auth, async (u: User | null) => {
      stop();
      if (!u) {
        setUid(null);
        setUser(null);
        setProfile(null);
        setStatus((s) => (s === "rejected" ? s : "signedOut"));
        return;
      }
      // Owner check (server allow-list). Offline: trust a previous successful check for this uid.
      try {
        await api("/api/me");
        localStorage.setItem(OWNER_OK_KEY, u.uid);
      } catch (e) {
        const offline = e instanceof ClientApiError && e.code === "NETWORK";
        if (!(offline && localStorage.getItem(OWNER_OK_KEY) === u.uid)) {
          if (e instanceof ClientApiError && (e.code === "FORBIDDEN" || e.code === "UNAUTHENTICATED")) {
            setRejected(
              !u.emailVerified
                ? "Verify your email address first, then sign in again."
                : e.code === "FORBIDDEN"
                  ? "This PersonalHub belongs to someone else."
                  : "Your session could not be verified. Sign in again.",
            );
            setStatus("rejected");
            await signOut(auth);
            return;
          }
          if (!offline) {
            setRejected(`Could not verify your account: ${(e as Error).message}`);
            setStatus("rejected");
            await signOut(auth);
            return;
          }
        }
      }
      setUid(u.uid);
      setUser(u);
      try {
        await seedUser(u);
      } catch {
        /* offline first run: seeding retried next time */
      }
      const db = firestore();
      cleanup.push(
        onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) setProfile(fromFs<UserDoc>(snap.data({ serverTimestamps: "estimate" })));
          setStatus("ready");
        }, () => setStatus("ready")),
      );
      cleanup.push(
        onSnapshot(collection(db, "users", u.uid, "tags"), (snap) => {
          for (const ch of snap.docChanges()) {
            if (ch.type === "removed") tagStore.localRemove(ch.doc.id);
            else {
              const d = fromFs<Omit<TagDoc, "id" | "slug">>(ch.doc.data({ serverTimestamps: "estimate" }));
              tagStore.local(ch.doc.id, { ...d, slug: ch.doc.id });
            }
          }
          tagStore.loaded = true;
        }),
      );
      for (const [name, store] of Object.entries(stores)) void store.start(u.uid, `users/${u.uid}/${name}`);
      const t = setTimeout(maintenance, 8000);
      cleanup.push(() => clearTimeout(t));
      setStatus((s) => (s === "loading" || s === "signedOut" ? "loading" : s));
    });
    return () => {
      unsubAuth();
      stop();
    };
  }, []);

  const settings = useMemo<Settings>(() => {
    const raw = profile?.settings;
    if (!raw) return DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...raw, ai: { ...DEFAULT_SETTINGS.ai, ...raw.ai } };
    const parsed = SettingsSchema.safeParse(merged);
    return parsed.success ? parsed.data : (merged as Settings);
  }, [profile]);

  const value: HubContext = {
    status,
    user,
    profile,
    settings,
    rejectedMessage,
    signOutNow: async () => {
      setRejected(null);
      if (user) await Promise.all(Object.values(stores).map((s) => s.clear(user.uid)));
      localStorage.removeItem(OWNER_OK_KEY);
      await signOut(firebaseAuth());
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub(): HubContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHub outside HubProvider");
  return c;
}

export const useSettings = () => useHub().settings;
