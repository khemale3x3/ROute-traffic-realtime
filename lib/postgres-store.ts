import { Pool } from "pg"
import type { PacketHeader } from "./types"

const enabled = process.env.POSTGRES_ENABLED === "true"
const tableName = process.env.POSTGRES_TABLE ?? "router_traffic"

let pool: Pool | null = null

function getPool() {
  if (!enabled) return null
  if (!pool) {
    pool = new Pool({ connectionString: process.env.POSTGRES_URL })
  }
  return pool
}

export async function ensureSchema() {
  const p = getPool()
  if (!p) return

  // Create main traffic table
  await p.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      source_ip TEXT NOT NULL,
      source_mac TEXT,
      dest_ip TEXT NOT NULL,
      source_port INTEGER NOT NULL,
      dest_port INTEGER NOT NULL,
      protocol TEXT NOT NULL,
      size BIGINT NOT NULL,
      bytes_up BIGINT,
      bytes_down BIGINT,
      packet_count INTEGER,
      router_id TEXT,
      ap_id TEXT,
      flags TEXT[] NOT NULL,
      ttl INTEGER NOT NULL,
      suspicious BOOLEAN NOT NULL DEFAULT FALSE,
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      domain TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Create devices table for device tracking
  await p.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      source_ip TEXT NOT NULL UNIQUE,
      source_mac TEXT,
      first_seen BIGINT NOT NULL,
      last_seen BIGINT NOT NULL,
      packet_count INTEGER NOT NULL DEFAULT 0,
      is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Create indexes for efficient querying
  await p.query(`
    CREATE INDEX IF NOT EXISTS ${tableName}_timestamp_idx ON ${tableName}(timestamp)
  `)
  await p.query(`
    CREATE INDEX IF NOT EXISTS ${tableName}_source_ip_idx ON ${tableName}(source_ip)
  `)
  await p.query(`
    CREATE INDEX IF NOT EXISTS ${tableName}_source_mac_idx ON ${tableName}(source_mac)
  `)
  await p.query(`
    CREATE INDEX IF NOT EXISTS devices_source_ip_idx ON devices(source_ip)
  `)
  await p.query(`
    CREATE INDEX IF NOT EXISTS devices_source_mac_idx ON devices(source_mac)
  `)
}

export async function persistPacket(packet: PacketHeader) {
  const p = getPool()
  if (!p) return

  await p.query(
    `
      INSERT INTO ${tableName} (
        id, timestamp, source_ip, source_mac, dest_ip, source_port, dest_port, protocol, size, bytes_up, bytes_down, packet_count, router_id, ap_id, flags, ttl, suspicious, country, city, domain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      packet.id,
      packet.timestamp,
      packet.sourceIp,
      packet.sourceMac ?? null,
      packet.destIp,
      packet.sourcePort,
      packet.destPort,
      packet.protocol,
      packet.size,
      packet.bytesUp ?? null,
      packet.bytesDown ?? null,
      packet.packetCount ?? null,
      packet.routerId ?? null,
      packet.apId ?? null,
      packet.flags,
      packet.ttl,
      packet.isSuspicious,
      packet.country,
      packet.city,
      packet.domain ?? null,
    ],
  )

  // Also persist device information
  await persistDeviceInfo(packet)
}

export async function persistDeviceInfo(packet: PacketHeader) {
  const p = getPool()
  if (!p) return

  const deviceId = `${packet.sourceIp}-${packet.sourceMac ?? "unknown"}`

  await p.query(
    `
      INSERT INTO devices (id, source_ip, source_mac, first_seen, last_seen, packet_count, is_suspicious)
      VALUES ($1, $2, $3, $4, $5, 1, $6)
      ON CONFLICT (source_ip) DO UPDATE SET
        last_seen = GREATEST(devices.last_seen, $5),
        packet_count = devices.packet_count + 1,
        is_suspicious = devices.is_suspicious OR $6,
        source_mac = COALESCE(devices.source_mac, $3),
        updated_at = NOW()
    `,
    [deviceId, packet.sourceIp, packet.sourceMac ?? null, packet.timestamp, packet.timestamp, packet.isSuspicious],
  )
}

export async function pruneOldTraffic(historyDays: number) {
  const p = getPool()
  if (!p) return

  const cutoff = Date.now() - historyDays * 24 * 60 * 60 * 1000
  await p.query(`DELETE FROM ${tableName} WHERE timestamp < $1`, [cutoff])
}

export async function getDeviceSummaries(limit = 100) {
  const p = getPool()
  if (!p) return null

  const result = await p.query(
    `
      SELECT source_ip, source_mac, COUNT(*) AS packet_count, MAX(timestamp) AS last_seen
      FROM ${tableName}
      GROUP BY source_ip, source_mac
      ORDER BY packet_count DESC
      LIMIT $1
    `,
    [limit],
  )
  return result.rows
}

export async function getFilteredDevices(ipFilter?: string, macFilter?: string, limit = 100) {
  const p = getPool()
  if (!p) return null

  let query = `
    SELECT source_ip, source_mac, COUNT(*) AS packet_count, MAX(timestamp) AS last_seen
    FROM ${tableName}
    WHERE 1=1
  `
  const params: any[] = []

  if (ipFilter && ipFilter.trim()) {
    query += ` AND source_ip ILIKE $${params.length + 1}`
    params.push(`%${ipFilter}%`)
  }

  if (macFilter && macFilter.trim()) {
    query += ` AND source_mac ILIKE $${params.length + 1}`
    params.push(`%${macFilter}%`)
  }

  query += ` GROUP BY source_ip, source_mac ORDER BY packet_count DESC LIMIT $${params.length + 1}`
  params.push(limit)

  const result = await p.query(query, params)
  return result.rows
}

export async function getAggregatedStats() {
  const p = getPool()
  if (!p) return null

  const [protocols, domains, routers] = await Promise.all([
    p.query(`SELECT protocol, COUNT(*) AS count FROM ${tableName} GROUP BY protocol ORDER BY count DESC LIMIT 10`),
    p.query(`SELECT domain, COUNT(*) AS count FROM ${tableName} WHERE domain IS NOT NULL GROUP BY domain ORDER BY count DESC LIMIT 10`),
    p.query(`SELECT router_id, COUNT(*) AS count FROM ${tableName} WHERE router_id IS NOT NULL GROUP BY router_id ORDER BY count DESC LIMIT 10`),
  ])

  return {
    protocols: protocols.rows,
    domains: domains.rows,
    routers: routers.rows,
  }
}
