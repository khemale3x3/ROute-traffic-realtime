import { type NextRequest, NextResponse } from "next/server"
import { normalizeBatch, type RawFlowRecord } from "@/lib/flow-normalize"
import { pushPackets, getStoreStatus } from "@/lib/flow-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/ingest
 *
 * The collector agent (running on your network) POSTs batches of flow records here.
 *
 * Auth: send the shared secret as `Authorization: Bearer <INGEST_API_KEY>`.
 * Body: a single flow record object, or an array of them, or { flows: [...] }.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.INGEST_API_KEY
  // If no key is configured, ingest is open (useful for local testing only).
  if (!expected) return true
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : header
  return token === expected
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized. Set Authorization: Bearer <INGEST_API_KEY>." }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let records: RawFlowRecord[]
  if (Array.isArray(body)) {
    records = body as RawFlowRecord[]
  } else if (body && typeof body === "object" && Array.isArray((body as { flows?: unknown }).flows)) {
    records = (body as { flows: RawFlowRecord[] }).flows
  } else if (body && typeof body === "object") {
    records = [body as RawFlowRecord]
  } else {
    return NextResponse.json({ error: "Body must be a flow record, array, or { flows: [] }" }, { status: 400 })
  }

  const packets = normalizeBatch(records)
  pushPackets(packets)

  return NextResponse.json({
    ok: true,
    received: records.length,
    accepted: packets.length,
    status: getStoreStatus(),
  })
}

export async function GET() {
  // Health / status check for the collector and dashboard.
  return NextResponse.json({
    ok: true,
    authRequired: Boolean(process.env.INGEST_API_KEY),
    status: getStoreStatus(),
  })
}
