"use client";

import type { ApiResult, ErrorCode } from "@personalhub/shared";
import { firebaseAuth } from "@/lib/firebase/client";

export class ClientApiError extends Error {
  constructor(public code: ErrorCode | "NETWORK", message: string, public retryAfter?: number) {
    super(message);
  }
}

export async function authHeader(): Promise<Record<string, string>> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new ClientApiError("UNAUTHENTICATED", "Not signed in");
  return { authorization: `Bearer ${await user.getIdToken()}` };
}

/** Calls a route handler with the Firebase ID token and unwraps the `{ ok, data }` envelope. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body || init.form ? "POST" : "GET"),
      headers: { ...(await authHeader()), ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    });
  } catch {
    throw new ClientApiError("NETWORK", "You appear to be offline");
  }
  let json: ApiResult<T>;
  try {
    json = await res.json();
  } catch {
    throw new ClientApiError("INTERNAL", `Unexpected response (${res.status})`);
  }
  if (!json.ok) {
    const retry = (json.error.details as { retryAfter?: number } | undefined)?.retryAfter;
    throw new ClientApiError(json.error.code, json.error.message, retry);
  }
  return json.data;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
