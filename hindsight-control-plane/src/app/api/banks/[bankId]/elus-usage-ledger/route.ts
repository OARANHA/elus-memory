import { NextResponse } from "next/server";
import { dataplaneBankUrl, getDataplaneHeaders } from "@/lib/hindsight-client";

/** Proxy only allowlisted UTC bounds; tenant authorization remains in Hindsight. */
export async function GET(request: Request, { params }: { params: Promise<{ bankId: string }> }) {
  try {
    const { bankId } = await params;
    if (!bankId) return NextResponse.json({ error: "bank_id required" }, { status: 400 });
    const query = new URL(request.url).searchParams;
    const start = query.get("start_date");
    const end = query.get("end_date");
    if (!start || !end || !/Z$/.test(start) || !/Z$/.test(end) ||
        Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
      return NextResponse.json({ error: "Valid UTC bounds required" }, { status: 400 });
    }
    const bounds = new URLSearchParams({ start_date: start, end_date: end });
    const response = await fetch(dataplaneBankUrl(bankId, `/elus-usage-ledger?${bounds}`), {
      method: "GET", headers: getDataplaneHeaders(), cache: "no-store",
    });
    const data = await response.json().catch(() => ({ error: "Ledger unavailable" }));
    return NextResponse.json(response.ok ? data : { error: "Ledger unavailable" }, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "Ledger unavailable" }, { status: 502 });
  }
}
