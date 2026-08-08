import type { PacketHeader, Protocol, Geolocation } from "./types"

/**
 * Raw flow record as forwarded by the collector agent. The collector parses
 * NetFlow v5/v9, IPFIX, or sFlow UDP datagrams and emits these JSON objects.
 * Most fields are optional so partial exports still ingest cleanly.
 */
export interface RawFlowRecord {
  sourceIp?: string
  sourceMac?: string
  destIp?: string
  srcAddr?: string
  dstAddr?: string
  sourcePort?: number
  destPort?: number
  srcPort?: number
  dstPort?: number
  protocol?: string | number
  proto?: string | number
  bytes?: number
  octets?: number
  size?: number
  bytesUp?: number
  bytesDown?: number
  packets?: number
  tcpFlags?: number | string[]
  flags?: string[]
  ttl?: number
  timestamp?: number
  routerId?: string
  apId?: string
  geo?: Partial<Geolocation> & { city?: string }
  country?: string
  city?: string
  domain?: string
  host?: string
  hostname?: string
  dnsName?: string
}

const IP_PROTO_MAP: Record<number, Protocol> = {
  1: "ICMP",
  6: "TCP",
  17: "UDP",
}

const PORT_PROTO_MAP: Record<number, Protocol> = {
  20: "FTP",
  21: "FTP",
  22: "SSH",
  53: "DNS",
  80: "HTTP",
  443: "HTTPS",
  8080: "HTTP",
  8443: "HTTPS",
}

const VALID_PROTOCOLS: Protocol[] = ["TCP", "UDP", "HTTP", "HTTPS", "DNS", "ICMP", "SSH", "FTP"]

const TCP_FLAG_BITS: { bit: number; name: string }[] = [
  { bit: 0x01, name: "FIN" },
  { bit: 0x02, name: "SYN" },
  { bit: 0x04, name: "RST" },
  { bit: 0x08, name: "PSH" },
  { bit: 0x10, name: "ACK" },
  { bit: 0x20, name: "URG" },
]

function decodeTcpFlags(flags: number | string[] | undefined): string[] {
  if (!flags) return []
  if (Array.isArray(flags)) return flags
  return TCP_FLAG_BITS.filter((f) => (flags & f.bit) !== 0).map((f) => f.name)
}

function resolveProtocol(record: RawFlowRecord): Protocol {
  const raw = record.protocol ?? record.proto
  // Numeric IP protocol number (e.g. 6 = TCP)
  if (typeof raw === "number") {
    const base = IP_PROTO_MAP[raw]
    if (base) {
      // Refine TCP/UDP into app-layer protocol by well-known port
      const port = record.destPort ?? record.dstPort ?? record.sourcePort ?? record.srcPort
      if ((base === "TCP" || base === "UDP") && port && PORT_PROTO_MAP[port]) {
        return PORT_PROTO_MAP[port]
      }
      return base
    }
  }
  if (typeof raw === "string") {
    const upper = raw.toUpperCase()
    if (VALID_PROTOCOLS.includes(upper as Protocol)) return upper as Protocol
  }
  // Fall back to port-based detection, then TCP.
  const port = record.destPort ?? record.dstPort ?? record.sourcePort ?? record.srcPort
  if (port && PORT_PROTO_MAP[port]) return PORT_PROTO_MAP[port]
  return "TCP"
}

function isPrivate(ip: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip)
}

function isSuspiciousFlow(record: RawFlowRecord, protocol: Protocol, destPort: number): boolean {
  // Lightweight heuristics — the full engine lives in lib/threat-detection.ts
  const size = record.bytes ?? record.octets ?? record.size ?? 0
  if (size > 1_000_000) return true // very large single flow
  const suspiciousPorts = [23, 445, 3389, 1433, 4444, 31337]
  if (suspiciousPorts.includes(destPort)) return true
  return false
}

let counter = 0

export function normalizeFlow(record: RawFlowRecord): PacketHeader | null {
  const sourceIp = record.sourceIp ?? record.srcAddr
  const destIp = record.destIp ?? record.dstAddr
  if (!sourceIp || !destIp) return null

  const sourcePort = record.sourcePort ?? record.srcPort ?? 0
  const destPort = record.destPort ?? record.dstPort ?? 0
  const protocol = resolveProtocol(record)
  const size = record.bytes ?? record.octets ?? record.size ?? 0

  const geo: Geolocation = {
    lat: record.geo?.lat ?? 0,
    lng: record.geo?.lng ?? 0,
    country: record.geo?.country ?? record.country ?? "Unknown",
  }

  return {
    id: `${Date.now().toString(36)}-${(counter++).toString(36)}`,
    timestamp: record.timestamp ?? Date.now(),
    sourceIp,
    sourceMac: record.sourceMac,
    destIp,
    sourcePort,
    destPort,
    protocol,
    size,
    bytesUp: record.bytesUp,
    bytesDown: record.bytesDown,
    packetCount: record.packets,
    routerId: record.routerId,
    apId: record.apId,
    flags: decodeTcpFlags(record.tcpFlags ?? record.flags),
    ttl: record.ttl ?? 64,
    isSuspicious: isSuspiciousFlow(record, protocol, destPort),
    geolocation: geo,
    country: geo.country,
    city: record.geo?.city ?? record.city ?? (isPrivate(sourceIp) ? "Local Network" : "Unknown"),
    domain: record.domain ?? record.host ?? record.hostname ?? record.dnsName,
  }
}

export function normalizeBatch(records: RawFlowRecord[]): PacketHeader[] {
  const out: PacketHeader[] = []
  for (const r of records) {
    const p = normalizeFlow(r)
    if (p) out.push(p)
  }
  return out
}
