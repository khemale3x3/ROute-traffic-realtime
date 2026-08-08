import { NextResponse } from "next/server"
import { getRouterConfig } from "@/lib/router-config"
import { getRecentPackets, getTrafficSummary } from "@/lib/flow-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const config = getRouterConfig()
  return NextResponse.json({
    router: {
      host: config.host,
      adminPort: config.adminPort,
      adminDomain: config.adminDomain,
      monitorMode: config.monitorMode,
      historyDays: config.historyDays,
    },
    summary: getTrafficSummary(),
    recentPackets: getRecentPackets(100),
  })
}
