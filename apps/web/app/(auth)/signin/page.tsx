"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup,
} from "firebase/auth";
import { Lock } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase/client";
import { useHub } from "@/components/providers/HubProvider";
import { Button, Input, Label, Separator } from "@/components/ui/primitives";

const FRIENDLY: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/user-not-found": "No account with that email.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/too-many-requests": "Too many attempts. Try again later.",
  "auth/email-already-in-use": "That email already has an account. Sign in instead.",
  "auth/weak-password": "Use at least 8 characters.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/network-request-failed": "Network error. Check your connection.",
};

export default function SignInPage() {
  const { status, rejectedMessage } = useHub();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (status === "ready") router.replace("/");
  }, [status, router]);
  useEffect(() => {
    if (rejectedMessage) setMsg({ type: "error", text: rejectedMessage });
  }, [rejectedMessage]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setMsg({ type: "error", text: FRIENDLY[code] ?? (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run("email", async () => {
      const auth = firebaseAuth();
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(cred.user);
        setMsg({ type: "info", text: "Check your inbox to verify your email, then sign in." });
        await auth.signOut();
        setMode("signin");
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
    });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">P</span>
          <div>
            <h1 className="text-base font-semibold">PersonalHub</h1>
            <p className="text-xs text-muted-foreground">Capture now, organise later.</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <Button
            variant="outline"
            className="w-full"
            loading={busy === "google"}
            onClick={() => void run("google", () => signInWithPopup(firebaseAuth(), new GoogleAuthProvider()))}
          >
            {busy !== "google" ? (
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
                <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8z" />
                <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" />
              </svg>
            ) : null}
            Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Label htmlFor="email">
              Email
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Label>
            <Label htmlFor="password">
              Password
              <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Label>
            {msg ? (
              <p role={msg.type === "error" ? "alert" : "status"} className={msg.type === "error" ? "text-[13px] text-destructive" : "text-[13px] text-muted-foreground"}>
                {msg.text}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="w-full" loading={busy === "email"}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
            <button className="hover:text-foreground" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "First time? Create account" : "Have an account? Sign in"}
            </button>
            {mode === "signin" ? (
              <button
                className="hover:text-foreground"
                onClick={() => email ? void run("reset", async () => { await sendPasswordResetEmail(firebaseAuth(), email); setMsg({ type: "info", text: "Password reset email sent." }); }) : setMsg({ type: "error", text: "Enter your email first." })}
              >
                Forgot password?
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" /> Owner-only app. Other accounts are signed out.
        </p>
      </div>
    </main>
  );
}
