import { NextResponse } from "next/server";

// Lightweight liveness probe for Docker/uptime checks. Intentionally reveals
// nothing about the app's internals or data.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
