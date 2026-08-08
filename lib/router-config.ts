import type { PacketHeader } from "./types"

export interface RouterConfig {
  host: string
  username: string
  password: string
  adminPort: number
  adminDomain: string
  monitorMode: boolean
  historyDays: number
}

export function getRouterConfig(): RouterConfig {
  return {
    host: process.env.ROUTER_HOST ?? "",
    username: process.env.ROUTER_USERNAME ?? "",
    password: process.env.ROUTER_PASSWORD ?? "",
    adminPort: Number(process.env.ROUTER_ADMIN_PORT ?? 80),
    adminDomain: process.env.ROUTER_ADMIN_DOMAIN ?? "",
    monitorMode: process.env.ROUTER_MONITOR_MODE === "true",
    historyDays: Number(process.env.TRAFFIC_HISTORY_DAYS ?? 7),
  }
}

export function buildRouterSummary(packet: PacketHeader) {
  return {
    id: packet.id,
    timestamp: packet.timestamp,
    sourceIp: packet.sourceIp,
    destIp: packet.destIp,
    destinationPort: packet.destPort,
    protocol: packet.protocol,
    size: packet.size,
    suspicious: packet.isSuspicious,
    country: packet.country,
    city: packet.city,
  }
}
