import type { NextRequest } from "next/server"
import { subscribe, getRecentPackets } from "@/lib/flow-store"
import type { PacketHeader } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/stream
 *
 * Server-Sent Events endpoint. The dashboard connects here to receive live
 * packets as they are ingested. Sends an initial backfill of recent packets,
 * then streams each new packet, plus periodic heartbeats to keep the
 * connection alive through proxies.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller already closed.
        }
      }

      // Backfill so the client isn't empty on connect.
      const recent = getRecentPackets(100)
      send("backfill", recent)

      const onPacket = (packet: PacketHeader) => send("packet", packet)
      const unsubscribe = subscribe(onPacket)

      const heartbeat = setInterval(() => send("ping", { t: Date.now() }), 15_000)

      const close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      req.signal.addEventListener("abort", close)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
