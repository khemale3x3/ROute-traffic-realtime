import { type NextRequest, NextResponse } from "next/server"
import { getRecentPackets, getStoreStatus } from "@/lib/flow-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/packets?limit=200
 *
 * Polling fallback for environments where SSE is not desirable. Returns the
 * most recent buffered packets plus ingest status.
 */
export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit")
  const limit = Math.min(Math.max(Number(limitParam) || 200, 1), 1000)

  return NextResponse.json({
    packets: getRecentPackets(limit),
    status: getStoreStatus(),
  })
}
