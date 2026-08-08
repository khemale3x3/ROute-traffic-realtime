"use client"

import { useEffect, useCallback, useReducer, useRef, useState } from "react"
import { generatePacket } from "@/lib/packet-generator"
import { normalizeFlow } from "@/lib/flow-normalize"
import type { PacketHeader, Protocol } from "@/lib/types"

export type DataSource = "mock" | "live-sse" | "live-poll" | "live-ws"

const DEFAULT_WS_URL = "ws://localhost:9100"
const WS_URL_STORAGE_KEY = "network-analyzer-ws-url"
export type ConnectionStatus = "idle" | "connecting" | "connected" | "receiving" | "error"

interface PacketState {
  packets: PacketHeader[]
  filteredPackets: PacketHeader[]
  activeFilters: Set<Protocol>
  searchQuery: string
  isPaused: boolean
}

type PacketAction =
  | { type: "ADD_PACKET"; packet: PacketHeader }
  | { type: "ADD_BATCH"; packets: PacketHeader[] }
  | { type: "TOGGLE_FILTER"; protocol: Protocol }
  | { type: "CLEAR_FILTERS" }
  | { type: "SET_SEARCH"; query: string }
  | { type: "TOGGLE_PAUSE" }
  | { type: "CLEAR_PACKETS" }
  | { type: "LOAD_FILTERS"; filters: Set<Protocol> }

const MAX_PACKETS = 500
const STORAGE_KEY = "network-analyzer-filters"

function filterPackets(packets: PacketHeader[], filters: Set<Protocol>, searchQuery: string): PacketHeader[] {
  let filtered = packets

  if (filters.size > 0) {
    filtered = filtered.filter((p) => filters.has(p.protocol))
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.sourceIp.toLowerCase().includes(query) ||
        p.destIp.toLowerCase().includes(query) ||
        p.sourcePort.toString().includes(query) ||
        p.destPort.toString().includes(query) ||
        p.protocol.toLowerCase().includes(query),
    )
  }

  return filtered
}

function packetReducer(state: PacketState, action: PacketAction): PacketState {
  switch (action.type) {
    case "ADD_PACKET": {
      const newPackets = [action.packet, ...state.packets].slice(0, MAX_PACKETS)
      const filteredPackets = filterPackets(newPackets, state.activeFilters, state.searchQuery)
      return { ...state, packets: newPackets, filteredPackets }
    }
    case "ADD_BATCH": {
      if (action.packets.length === 0) return state
      const newPackets = [...action.packets, ...state.packets].slice(0, MAX_PACKETS)
      const filteredPackets = filterPackets(newPackets, state.activeFilters, state.searchQuery)
      return { ...state, packets: newPackets, filteredPackets }
    }
    case "TOGGLE_FILTER": {
      const newFilters = new Set(state.activeFilters)
      if (newFilters.has(action.protocol)) {
        newFilters.delete(action.protocol)
      } else {
        newFilters.add(action.protocol)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newFilters)))
      const filteredPackets = filterPackets(state.packets, newFilters, state.searchQuery)
      return { ...state, activeFilters: newFilters, filteredPackets }
    }
    case "CLEAR_FILTERS": {
      localStorage.removeItem(STORAGE_KEY)
      const filteredPackets = filterPackets(state.packets, new Set(), state.searchQuery)
      return { ...state, activeFilters: new Set(), filteredPackets }
    }
    case "SET_SEARCH": {
      const filteredPackets = filterPackets(state.packets, state.activeFilters, action.query)
      return { ...state, searchQuery: action.query, filteredPackets }
    }
    case "TOGGLE_PAUSE": {
      return { ...state, isPaused: !state.isPaused }
    }
    case "CLEAR_PACKETS": {
      return { ...state, packets: [], filteredPackets: [] }
    }
    case "LOAD_FILTERS": {
      const filteredPackets = filterPackets(state.packets, action.filters, state.searchQuery)
      return { ...state, activeFilters: action.filters, filteredPackets }
    }
    default:
      return state
  }
}

const SOURCE_STORAGE_KEY = "network-analyzer-source"

export function usePacketStream(intervalMs = 300) {
  const [state, dispatch] = useReducer(packetReducer, {
    packets: [],
    filteredPackets: [],
    activeFilters: new Set(),
    searchQuery: "",
    isPaused: false,
  })

  const [source, setSourceState] = useState<DataSource>("mock")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle")
  const [wsUrl, setWsUrlState] = useState<string>(DEFAULT_WS_URL)
  const lastPacketAt = useRef<number>(0)

  // Restore filters + preferred source from localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const filters = new Set<Protocol>(JSON.parse(saved))
        dispatch({ type: "LOAD_FILTERS", filters })
      }
      const savedSource = localStorage.getItem(SOURCE_STORAGE_KEY) as DataSource | null
      if (
        savedSource === "mock" ||
        savedSource === "live-sse" ||
        savedSource === "live-poll" ||
        savedSource === "live-ws"
      ) {
        setSourceState(savedSource)
      }
      const savedWsUrl = localStorage.getItem(WS_URL_STORAGE_KEY)
      if (savedWsUrl) setWsUrlState(savedWsUrl)
    } catch (error) {
      console.error("[v0] Failed to load settings:", error)
    }
  }, [])

  const setSource = useCallback((next: DataSource) => {
    setSourceState(next)
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const setWsUrl = useCallback((next: string) => {
    setWsUrlState(next)
    try {
      localStorage.setItem(WS_URL_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  // MOCK source: synthesize packets locally.
  useEffect(() => {
    if (source !== "mock" || state.isPaused) return
    setConnectionStatus("connected")
    const interval = setInterval(() => {
      dispatch({ type: "ADD_PACKET", packet: generatePacket() })
    }, intervalMs)
    return () => clearInterval(interval)
  }, [source, intervalMs, state.isPaused])

  // LIVE SSE source: subscribe to /api/stream.
  useEffect(() => {
    if (source !== "live-sse" || state.isPaused) return
    setConnectionStatus("connecting")

    const es = new EventSource("/api/stream")

    es.addEventListener("backfill", (e) => {
      try {
        const packets = JSON.parse((e as MessageEvent).data) as PacketHeader[]
        dispatch({ type: "ADD_BATCH", packets })
      } catch {
        // ignore
      }
    })

    es.addEventListener("packet", (e) => {
      try {
        const packet = JSON.parse((e as MessageEvent).data) as PacketHeader
        lastPacketAt.current = Date.now()
        setConnectionStatus("receiving")
        dispatch({ type: "ADD_PACKET", packet })
      } catch {
        // ignore
      }
    })

    es.onopen = () => setConnectionStatus("connected")
    es.onerror = () => setConnectionStatus("error")

    return () => es.close()
  }, [source, state.isPaused])

  // LIVE POLL source: fetch /api/packets on an interval.
  useEffect(() => {
    if (source !== "live-poll" || state.isPaused) return
    setConnectionStatus("connecting")
    const seen = new Set<string>()
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch("/api/packets?limit=200", { cache: "no-store" })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = (await res.json()) as { packets: PacketHeader[] }
        if (cancelled) return
        const fresh = data.packets.filter((p) => !seen.has(p.id))
        fresh.forEach((p) => seen.add(p.id))
        if (fresh.length > 0) {
          setConnectionStatus("receiving")
          dispatch({ type: "ADD_BATCH", packets: fresh })
        } else {
          setConnectionStatus("connected")
        }
      } catch {
        if (!cancelled) setConnectionStatus("error")
      }
    }

    poll()
    const interval = setInterval(poll, 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [source, state.isPaused])

  // LIVE WEBSOCKET source: connect directly to the capture agent's WS server
  // (libpcap/Npcap → backend → WebSocket). Best for LAN/local deployments where
  // the dashboard can reach the capture host directly.
  useEffect(() => {
    if (source !== "live-ws" || state.isPaused) return
    setConnectionStatus("connecting")

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl)
      } catch {
        setConnectionStatus("error")
        return
      }

      ws.onopen = () => setConnectionStatus("connected")

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string)
          const records = Array.isArray(data) ? data : data.flows ? data.flows : [data]
          const packets: PacketHeader[] = []
          for (const r of records) {
            // Accept already-normalized PacketHeaders or raw flow records.
            const packet = r.protocol && r.id && r.geolocation ? (r as PacketHeader) : normalizeFlow(r)
            if (packet) packets.push(packet)
          }
          if (packets.length > 0) {
            lastPacketAt.current = Date.now()
            setConnectionStatus("receiving")
            dispatch({ type: "ADD_BATCH", packets })
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onerror = () => setConnectionStatus("error")

      ws.onclose = () => {
        if (closed) return
        setConnectionStatus("error")
        // Auto-reconnect with a short backoff.
        reconnectTimer = setTimeout(connect, 2000)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [source, state.isPaused, wsUrl])

  const toggleFilter = useCallback((protocol: Protocol) => {
    dispatch({ type: "TOGGLE_FILTER", protocol })
  }, [])

  const clearFilters = useCallback(() => {
    dispatch({ type: "CLEAR_FILTERS" })
  }, [])

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH", query })
  }, [])

  const togglePause = useCallback(() => {
    dispatch({ type: "TOGGLE_PAUSE" })
  }, [])

  const clearPackets = useCallback(() => {
    dispatch({ type: "CLEAR_PACKETS" })
  }, [])

  return {
    packets: state.filteredPackets,
    allPackets: state.packets,
    activeFilters: state.activeFilters,
    searchQuery: state.searchQuery,
    isPaused: state.isPaused,
    source,
    connectionStatus,
    wsUrl,
    setSource,
    setWsUrl,
    toggleFilter,
    clearFilters,
    setSearchQuery,
    togglePause,
    clearPackets,
  }
}
