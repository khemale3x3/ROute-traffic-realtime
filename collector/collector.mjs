#!/usr/bin/env node
/**
 * Network Traffic Analyzer — Flow Collector Agent
 * ------------------------------------------------
 * Runs on a host INSIDE your network. Listens for NetFlow v5/v9, IPFIX, or
 * sFlow datagrams exported by your router/switch/firewall over UDP, normalizes
 * each flow record to JSON, and forwards batches to the dashboard's ingest API
 * over HTTPS.
 *
 * Why this exists: routers export flow data over UDP, and a web app on Vercel
 * cannot receive UDP. This agent bridges the gap.
 *
 * Usage:
 *   1. cp .env.example .env  and fill in INGEST_URL + INGEST_API_KEY
 *   2. npm install
 *   3. npm start
 *
 * Config (env vars):
 *   INGEST_URL        e.g. https://your-app.vercel.app/api/ingest   (required)
 *   INGEST_API_KEY    shared secret, must match the project's INGEST_API_KEY
 *   FLOW_PROTOCOL     netflow | ipfix | sflow      (default: netflow)
 *   FLOW_PORT         UDP listen port              (default: 2055; sflow: 6343)
 *   BATCH_MS          how often to flush to ingest (default: 1000 ms)
 */

import dgram from "node:dgram"
import process from "node:process"

const INGEST_URL = process.env.INGEST_URL
const INGEST_API_KEY = process.env.INGEST_API_KEY || ""
const FLOW_PROTOCOL = (process.env.FLOW_PROTOCOL || "netflow").toLowerCase()
const FLOW_PORT = Number(process.env.FLOW_PORT || (FLOW_PROTOCOL === "sflow" ? 6343 : 2055))
const BATCH_MS = Number(process.env.BATCH_MS || 1000)

if (!INGEST_URL) {
  console.error("ERROR: INGEST_URL is required. See .env.example.")
  process.exit(1)
}

let queue = []

function enqueue(record) {
  queue.push(record)
}

async function flush() {
  if (queue.length === 0) return
  const flows = queue
  queue = []
  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INGEST_API_KEY ? { Authorization: `Bearer ${INGEST_API_KEY}` } : {}),
      },
      body: JSON.stringify({ flows }),
    })
    if (!res.ok) {
      console.error(`Ingest responded ${res.status}: ${await res.text()}`)
    } else {
      const json = await res.json()
      console.log(`Forwarded ${flows.length} flows (accepted ${json.accepted}).`)
    }
  } catch (err) {
    console.error("Failed to reach ingest endpoint:", err.message)
    // Re-queue so we don't lose data on a transient network blip (bounded).
    if (queue.length < 5000) queue = flows.concat(queue)
  }
}

setInterval(flush, BATCH_MS)

/* ------------------------------------------------------------------ */
/* Minimal NetFlow v5 parser (fixed 48-byte records, no template state) */
/* ------------------------------------------------------------------ */
function parseNetflowV5(msg) {
  const count = msg.readUInt16BE(2)
  const records = []
  const HEADER = 24
  const REC = 48
  for (let i = 0; i < count; i++) {
    const o = HEADER + i * REC
    if (o + REC > msg.length) break
    records.push({
      srcAddr: `${msg[o]}.${msg[o + 1]}.${msg[o + 2]}.${msg[o + 3]}`,
      dstAddr: `${msg[o + 4]}.${msg[o + 5]}.${msg[o + 6]}.${msg[o + 7]}`,
      packets: msg.readUInt32BE(o + 16),
      octets: msg.readUInt32BE(o + 20),
      srcPort: msg.readUInt16BE(o + 32),
      dstPort: msg.readUInt16BE(o + 34),
      tcpFlags: msg[o + 37],
      proto: msg[o + 38],
    })
  }
  return records
}

/*
 * NetFlow v9, IPFIX, and sFlow are template-based / TLV-based binary protocols.
 * Parsing them fully is non-trivial. For production, install a dedicated parser:
 *
 *   NetFlow v9 / IPFIX:  npm i node-netflowv9   (or "ipfix")
 *   sFlow:               npm i sflow
 *
 * Then translate each decoded record into the same shape used above
 * (srcAddr, dstAddr, srcPort, dstPort, proto, octets, tcpFlags, packets)
 * and call enqueue(record). The dashboard's normalizer accepts these fields.
 */

const socket = dgram.createSocket("udp4")

socket.on("message", (msg) => {
  try {
    if (FLOW_PROTOCOL === "netflow") {
      const version = msg.readUInt16BE(0)
      if (version === 5) {
        for (const r of parseNetflowV5(msg)) enqueue(r)
      } else {
        console.warn(
          `Received NetFlow v${version}. Only v5 is decoded by this starter. ` +
            `Install node-netflowv9 for v9/IPFIX (see comments in collector.mjs).`,
        )
      }
    } else {
      console.warn(
        `FLOW_PROTOCOL="${FLOW_PROTOCOL}" needs a dedicated parser. ` +
          `See the comments in collector.mjs for the recommended package.`,
      )
    }
  } catch (err) {
    console.error("Parse error:", err.message)
  }
})

socket.on("listening", () => {
  const a = socket.address()
  console.log(`Flow collector listening for ${FLOW_PROTOCOL.toUpperCase()} on udp://${a.address}:${a.port}`)
  console.log(`Forwarding to ${INGEST_URL} every ${BATCH_MS}ms${INGEST_API_KEY ? " (authenticated)" : " (no key set)"}`)
  console.log("Point your router's flow export at this host and port.")
})

socket.on("error", (err) => {
  console.error("Socket error:", err.message)
  socket.close()
  process.exit(1)
})

socket.bind(FLOW_PORT)
