import { NextResponse } from "next/server"
import { getDeviceSummaries, getFilteredDevices } from "@/lib/postgres-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ipFilter = searchParams.get("ip")
  const macFilter = searchParams.get("mac")

  let devices
  if (ipFilter || macFilter) {
    devices = await getFilteredDevices(ipFilter || undefined, macFilter || undefined, 100)
  } else {
    devices = await getDeviceSummaries(100)
  }

  return NextResponse.json({ devices: devices ?? [] })
}
