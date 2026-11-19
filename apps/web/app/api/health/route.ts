import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, version: process.env.npm_package_version ?? "1.0.0", time: new Date().toISOString() });
}
