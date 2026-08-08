"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PacketStream } from "@/components/network/packet-stream"
import { PacketSearch } from "@/components/network/packet-search"
import { DeviceStream } from "@/components/network/device-stream"
import { DeviceFilters } from "@/components/network/device-filters"
import { StatisticsChart } from "@/components/network/statistics-chart"
import { ProtocolFilters } from "@/components/network/protocol-filters"
import { ConnectionTracker } from "@/components/network/connection-tracker"
import { StatsOverview } from "@/components/network/stats-overview"
import { AdvancedStatsDashboard } from "@/components/network/advanced-stats-dashboard"
import { BandwidthMeter } from "@/components/network/bandwidth-meter"
import { TrafficMap } from "@/components/network/traffic-map"
import { TrafficHeatmap } from "@/components/network/traffic-heatmap"
import { ReplayControls } from "@/components/network/replay-controls"
import { usePacketStream } from "@/hooks/use-packet-stream"
import { useTrafficStats } from "@/hooks/use-traffic-stats"
import { usePacketReplay } from "@/hooks/use-packet-replay"
import { generateConnection } from "@/lib/packet-generator"
import type { Connection } from "@/lib/types"
import { Play, Pause, Trash2, Download, Activity, Film, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ThreatAlerts } from "@/components/network/threat-alerts"
import { useThreatDetection } from "@/hooks/use-threat-detection"
import { ConnectionConfig } from "@/components/network/connection-config"

export default function NetworkAnalyzerPage() {
  const {
    packets,
    allPackets,
    activeFilters,
    searchQuery,
    isPaused,
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
  } = usePacketStream(300)

  const stats = useTrafficStats(allPackets)
  const [connections, setConnections] = useState<Connection[]>([])
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("live")
  const [deviceIpFilter, setDeviceIpFilter] = useState("")
  const [deviceMacFilter, setDeviceMacFilter] = useState("")

  const replay = usePacketReplay(allPackets)
  const displayPackets = replay.isReplayMode ? replay.replayPackets : packets

  // Generate mock connections
  useEffect(() => {
    const interval = setInterval(() => {
      setConnections((prev) => {
        const newConnections = [...prev]

        // Add new connection occasionally
        if (Math.random() > 0.7 && newConnections.length < 15) {
          newConnections.push(generateConnection())
        }

        // Remove old connections
        return newConnections.filter((c) => Date.now() - c.lastActivity < 60000)
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const lastSuspiciousPacketRef = useRef<string | null>(null)

  useEffect(() => {
    const suspiciousPackets = packets.filter((p) => p.isSuspicious)
    if (suspiciousPackets.length > 0) {
      const latest = suspiciousPackets[0]
      const packetId = `${latest.timestamp}-${latest.sourceIp}-${latest.destIp}`

      // Only show toast if this is a new suspicious packet
      if (packetId !== lastSuspiciousPacketRef.current) {
        lastSuspiciousPacketRef.current = packetId
        toast({
          title: "Suspicious Activity Detected",
          description: `${latest.protocol} packet from ${latest.sourceIp}`,
          variant: "destructive",
        })
      }
    }
  }, [packets.length]) // Only trigger when packet count changes, not on every packet array change

  useEffect(() => {
    console.log("[v0] Active tab changed to:", activeTab)
  }, [activeTab])

  const handleExport = () => {
    const dataStr = JSON.stringify(allPackets, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `network-capture-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)

    toast({
      title: "Export Complete",
      description: `Exported ${allPackets.length} packets`,
    })
  }

  const maxBandwidth = 100000 // 100 KB/s for display

  const { alerts, dismissAlert, clearAllAlerts } = useThreatDetection(allPackets)

  return (
    <div className="min-h-screen text-foreground p-4 md:p-6 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl flex items-center gap-3 text-white font-normal font-mono">
              <Activity className="w-8 h-8 text-foreground" strokeWidth={1} />
              Network Traffic Analyzer
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-slate-400">Real-time packet monitoring and analysis</p>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    connectionStatus === "receiving"
                      ? "bg-green-500 animate-pulse"
                      : connectionStatus === "connected"
                        ? "bg-green-500"
                        : connectionStatus === "error"
                          ? "bg-red-500"
                          : "bg-slate-500"
                  }`}
                  aria-hidden="true"
                />
                {source === "mock"
                  ? "Mock data"
                  : source === "live-ws"
                    ? "Live (WS)"
                    : source === "live-sse"
                      ? "Live (SSE)"
                      : "Live (Poll)"}
                {" · "}
                {connectionStatus}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <ConnectionConfig
              source={source}
              connectionStatus={connectionStatus}
              wsUrl={wsUrl}
              onSourceChange={setSource}
              onWsUrlChange={setWsUrl}
            />
            {!replay.isReplayMode ? (
              <>
                <Button variant="outline" size="sm" onClick={togglePause} className="gap-2 bg-transparent text-white">
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
                <Button variant="outline" size="sm" onClick={clearPackets} className="gap-2 bg-transparent text-white">
                  <Trash2 className="w-4 h-4" />
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={replay.enterReplayMode}
                  className="gap-2 bg-transparent text-white"
                  disabled={allPackets.length === 0}
                >
                  <Film className="w-4 h-4" />
                  Replay
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={replay.exitReplayMode}
                className="gap-2 bg-transparent text-white"
              >
                <X className="w-4 h-4" />
                Exit Replay
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 bg-transparent text-white">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        <StatsOverview stats={stats} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 md:col-span-1 flex justify-center">
            <BandwidthMeter label="Download" value={stats.bytesPerSecond} max={maxBandwidth} color="stroke-blue-500" />
          </div>
          <div className="col-span-2 md:col-span-1 flex justify-center">
            <BandwidthMeter
              label="Upload"
              value={stats.bytesPerSecond * 0.4}
              max={maxBandwidth}
              color="stroke-green-500"
            />
          </div>
          <div className="col-span-2 md:col-span-2">
            <ProtocolFilters
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={clearFilters}
            />
          </div>
        </div>

        {replay.isReplayMode && (
          <ReplayControls
            isPlaying={replay.isPlaying}
            currentIndex={replay.currentIndex}
            totalPackets={allPackets.length}
            playbackSpeed={replay.playbackSpeed}
            onPlay={replay.play}
            onPause={replay.pause}
            onReset={replay.reset}
            onStepBackward={replay.stepBackward}
            onStepForward={replay.stepForward}
            onSpeedChange={replay.setPlaybackSpeed}
            onSeek={replay.seek}
          />
        )}

        {alerts.length > 0 && <ThreatAlerts alerts={alerts} onDismiss={dismissAlert} onClearAll={clearAllAlerts} />}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="live">Live Stream</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4">
            <PacketSearch value={searchQuery} onChange={setSearchQuery} />
            <DeviceFilters
              ipFilter={deviceIpFilter}
              macFilter={deviceMacFilter}
              onIpFilterChange={setDeviceIpFilter}
              onMacFilterChange={setDeviceMacFilter}
              onClearFilters={() => {
                setDeviceIpFilter("")
                setDeviceMacFilter("")
              }}
            />
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Connected Devices</h3>
                <DeviceStream
                  packets={displayPackets}
                  ipFilter={deviceIpFilter}
                  macFilter={deviceMacFilter}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Packet Stream</h3>
                <PacketStream packets={displayPackets} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <AdvancedStatsDashboard packets={allPackets} stats={stats} />
            <TrafficHeatmap packets={allPackets} />
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Per-Device Statistics</h3>
              <DeviceFilters
                ipFilter={deviceIpFilter}
                macFilter={deviceMacFilter}
                onIpFilterChange={setDeviceIpFilter}
                onMacFilterChange={setDeviceMacFilter}
                onClearFilters={() => {
                  setDeviceIpFilter("")
                  setDeviceMacFilter("")
                }}
              />
              <div className="mt-4">
                <DeviceStream packets={allPackets} ipFilter={deviceIpFilter} macFilter={deviceMacFilter} />
              </div>
            </div>
            <StatisticsChart packets={allPackets} />
          </TabsContent>

          <TabsContent value="connections" className="space-y-4">
            <ConnectionTracker connections={connections} />
          </TabsContent>

          <TabsContent value="map" className="space-y-4">
            <TrafficMap packets={allPackets} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
