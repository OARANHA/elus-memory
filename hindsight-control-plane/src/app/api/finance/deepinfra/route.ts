import { NextRequest, NextResponse } from "next/server";
import { ACCESS_KEY_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { readDeepInfraBilling, validPeriod } from "@/lib/deepinfra-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The route is fail-closed even if the global control-plane access key is unset.
// Never return provider keys, upstream headers or response error bodies.
export async function GET(request: NextRequest) {
  const accessKey = process.env.HINDSIGHT_CP_ACCESS_KEY;
  if (!accessKey || !await verifySessionToken(request.cookies.get(ACCESS_KEY_COOKIE)?.value, accessKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.DEEPINFRA_BILLING_API_TOKEN;
  if (!key) return NextResponse.json({ error: "DeepInfra billing not configured" }, { status: 503 });
  const period = request.nextUrl.searchParams.get("from") ?? "current";
  if (!validPeriod(period)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  try {
    const data = await readDeepInfraBilling(key, period);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "DeepInfra billing unavailable" }, { status: 502 });
  }
}
