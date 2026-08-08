/**
 * Real packet-capture agent.
 *
 *   Wi-Fi / AP / LAN
 *        │
 *        ▼
 *   libpcap (Linux/macOS) / Npcap (Windows)   ← raw frames off the wire
 *        │
 *        ▼
 *   this agent: decode Ethernet → IP → TCP/UDP
 *        │
 *        ▼
 *   WebSocket server (ws://0.0.0.0:WS_PORT)    ← dashboard connects here ("Live (WS)")
 *        │  (optionally also HTTPS POST → /api/ingest)
 *        ▼
 *   React dashboard
 *
 * Requirements:
 *   - libpcap dev headers (Linux: `apt install libpcap-dev`, macOS: preinstalled)
 *     or Npcap on Windows (https://npcap.com, enable WinPcap-compatible mode).
 *   - Run with root/admin (raw capture is privileged): `sudo node capture.mjs`.
 *
 * Install deps:  npm install        (installs `cap` and `ws`)
 * Configure:     copy .env.example → .env and edit
 * Run:           sudo -E node capture.mjs
 */

import { WebSocketServer } from "ws"
import Cap from "cap"

const {
  CAPTURE_IFACE = "",
  CAPTURE_FILTER = "ip",
  WS_PORT = "9100",
  WS_TOKEN = "",
  INGEST_URL = "",
  INGEST_API_KEY = "",
} = process.env

const { Cap: CapClass, decoders } = Cap
const PROTOCOL = decoders.PROTOCOL

// ---------------------------------------------------------------------------
// WebSocket server — the dashboard's "Live (WS)" source connects here.
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ port: Number(WS_PORT) })
const clients = new Set()

wss.on("connection", (ws, req) => {
  // Optional shared-token check: dashboard connects to ws://host:port?token=...
  if (WS_TOKEN) {
    const url = new URL(req.url ?? "", "http://localhost")
    if (url.searchParams.get("token") !== WS_TOKEN) {
      ws.close(1008, "invalid token")
      return
    }
  }
  clients.add(ws)
  ws.on("close", () => clients.delete(ws))
  ws.on("error", () => clients.delete(ws))
})

function broadcast(record) {
  const payload = JSON.stringify(record)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  }
}

// Optional: also forward to the cloud ingest API for SSE/poll consumers.
let ingestQueue = []
async function flushIngest() {
  if (!INGEST_URL || ingestQueue.length === 0) return
  const batch = ingestQueue
  ingestQueue = []
  try {
    await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INGEST_API_KEY ? { Authorization: `Bearer ${INGEST_API_KEY}` } : {}),
      },
      body: JSON.stringify({ flows: batch }),
    })
  } catch (err) {
    console.error("[capture] ingest forward failed:", err.message)
  }
}
if (INGEST_URL) setInterval(flushIngest, 1000)

// ---------------------------------------------------------------------------
// Packet capture.
// ---------------------------------------------------------------------------
const c = new CapClass()
const device = CAPTURE_IFACE || CapClass.findDevice() // first device if unset
const bufSize = 10 * 1024 * 1024
const buffer = Buffer.alloc(65535)

console.log(`[capture] interface: ${device}`)
console.log(`[capture] filter:    ${CAPTURE_FILTER}`)
console.log(`[capture] websocket: ws://0.0.0.0:${WS_PORT}${WS_TOKEN ? " (token required)" : ""}`)
if (INGEST_URL) console.log(`[capture] also forwarding to ${INGEST_URL}`)

const linkType = c.open(device, CAPTURE_FILTER, bufSize, buffer)
c.setMinBytes && c.setMinBytes(0)

c.on("packet", (nbytes) => {
  try {
    if (linkType !== "ETHERNET") return
    const eth = decoders.Ethernet(buffer)
    if (eth.info.type !== PROTOCOL.ETHERNET.IPV4) return

    const ip = decoders.IPV4(buffer, eth.offset)
    const record = {
      srcAddr: ip.info.srcaddr,
      dstAddr: ip.info.dstaddr,
      proto: ip.info.protocol, // numeric IP proto (6=TCP, 17=UDP, 1=ICMP)
      octets: ip.info.totallen,
      ttl: ip.info.ttl,
      timestamp: Date.now(),
    }

    if (ip.info.protocol === PROTOCOL.IP.TCP) {
      const tcp = decoders.TCP(buffer, ip.offset)
      record.srcPort = tcp.info.srcport
      record.dstPort = tcp.info.dstport
      // Build a numeric TCP flag bitmask the normalizer understands.
      const f = tcp.info.flags
      record.tcpFlags = f
    } else if (ip.info.protocol === PROTOCOL.IP.UDP) {
      const udp = decoders.UDP(buffer, ip.offset)
      record.srcPort = udp.info.srcport
      record.dstPort = udp.info.dstport
    }

    broadcast(record)
    if (INGEST_URL) ingestQueue.push(record)
  } catch (err) {
    // ignore malformed/non-IP frames
  }
})

process.on("SIGINT", () => {
  console.log("\n[capture] shutting down")
  wss.close()
  process.exit(0)
})
