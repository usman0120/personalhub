import { NextResponse } from "next/server";
import { adminStatus } from "@/lib/firebase/admin";
import { ownerEmails } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, version: process.env.npm_package_version ?? "1.0.0", time: new Date().toISOString(),
    // Booleans/counts only: enough to spot a misconfigured deploy without exposing values.
    config: { admin: adminStatus(), owners: ownerEmails().length } });
}
