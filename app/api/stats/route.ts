import { NextResponse } from "next/server"
import { getAggregatedStats } from "@/lib/postgres-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const stats = await getAggregatedStats()
  return NextResponse.json({ stats: stats ?? { protocols: [], domains: [], routers: [] } })
}
