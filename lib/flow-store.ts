import { EventEmitter } from "events"
import { ensureSchema, persistPacket, pruneOldTraffic } from "./postgres-store"
import { getRouterConfig } from "./router-config"
import type { PacketHeader } from "./types"

/**
 * In-memory rolling buffer for incoming flow/packet records.
 *
 * NOTE: This stores data in process memory. On a single dev server or a single
 * serverless instance this works for live streaming. In a multi-instance / serverless
 * production deployment, ingest and SSE connections may land on different instances,
 * so live data won't be shared. For production, back this with Upstash Redis
 * (pub/sub + a capped list) or a Postgres table. The public API of this module
 * (push / getRecent / subscribe) is designed so you can swap the implementation later.
 */

const MAX_BUFFER = 1000

interface GlobalFlowStore {
  buffer: PacketHeader[]
  emitter: EventEmitter
  lastIngestAt: number | null
  totalIngested: number
}

// Persist across hot-reloads / module re-evaluation in dev.
const globalForStore = globalThis as unknown as { __flowStore?: GlobalFlowStore }

function getStore(): GlobalFlowStore {
  if (!globalForStore.__flowStore) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(0) // many SSE clients
    globalForStore.__flowStore = {
      buffer: [],
      emitter,
      lastIngestAt: null,
      totalIngested: 0,
    }
  }
  return globalForStore.__flowStore
}

export function pushPackets(packets: PacketHeader[]): void {
  if (packets.length === 0) return
  const store = getStore()
  store.buffer = [...packets, ...store.buffer].slice(0, MAX_BUFFER)
  store.lastIngestAt = Date.now()
  store.totalIngested += packets.length
  for (const packet of packets) {
    store.emitter.emit("packet", packet)
    void persistPacket(packet).catch(() => {})
  }

  const { historyDays } = getRouterConfig()
  if (historyDays > 0) {
    void pruneOldTraffic(historyDays).catch(() => {})
  }
}

export function getRecentPackets(limit = 200): PacketHeader[] {
  return getStore().buffer.slice(0, limit)
}

export function getTrafficSummary() {
  const store = getStore()
  const deviceCounts = new Map<string, number>()
  const destinationCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  const protocolCounts = new Map<string, number>()
  let suspicious = 0

  for (const packet of store.buffer) {
    deviceCounts.set(packet.sourceIp, (deviceCounts.get(packet.sourceIp) ?? 0) + 1)
    const destinationKey = `${packet.destIp}:${packet.destPort}`
    destinationCounts.set(destinationKey, (destinationCounts.get(destinationKey) ?? 0) + 1)
    protocolCounts.set(packet.protocol, (protocolCounts.get(packet.protocol) ?? 0) + 1)
    if (packet.domain) {
      domainCounts.set(packet.domain, (domainCounts.get(packet.domain) ?? 0) + 1)
    }
    if (packet.isSuspicious) suspicious += 1
  }

  return {
    buffered: store.buffer.length,
    totalIngested: store.totalIngested,
    uniqueDevices: Array.from(deviceCounts.keys()),
    topDestinations: Array.from(destinationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    topDomains: Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    protocolDistribution: Array.from(protocolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    suspiciousCount: suspicious,
  }
}

export function getStoreStatus() {
  const store = getStore()
  return {
    buffered: store.buffer.length,
    totalIngested: store.totalIngested,
    lastIngestAt: store.lastIngestAt,
    receiving: store.lastIngestAt !== null && Date.now() - store.lastIngestAt < 10_000,
  }
}

export function subscribe(listener: (packet: PacketHeader) => void): () => void {
  const store = getStore()
  store.emitter.on("packet", listener)
  return () => store.emitter.off("packet", listener)
}

ensureSchema().catch(() => {})
