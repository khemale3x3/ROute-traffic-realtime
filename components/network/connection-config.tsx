"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import type { DataSource, ConnectionStatus } from "@/hooks/use-packet-stream"
import { Settings, Copy, Check, ExternalLink, Radio, FlaskConical, RefreshCw, Wifi } from "lucide-react"

interface ConnectionConfigProps {
  source: DataSource
  connectionStatus: ConnectionStatus
  wsUrl: string
  onSourceChange: (source: DataSource) => void
  onWsUrlChange: (url: string) => void
}

interface IngestStatus {
  ok: boolean
  authRequired: boolean
  status: {
    buffered: number
    totalIngested: number
    lastIngestAt: number | null
    receiving: boolean
  }
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast({ title: "Copied", description: label })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: "Copy failed", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`} className="shrink-0">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}

const SOURCE_OPTIONS: { value: DataSource; label: string; desc: string; icon: typeof Radio }[] = [
  { value: "mock", label: "Mock", desc: "Synthetic demo packets", icon: FlaskConical },
  { value: "live-ws", label: "Live (WS)", desc: "Direct from capture agent", icon: Wifi },
  { value: "live-sse", label: "Live (SSE)", desc: "Stream via ingest API", icon: Radio },
  { value: "live-poll", label: "Live (Poll)", desc: "Polls every 1.5s", icon: RefreshCw },
]

export function ConnectionConfig({
  source,
  connectionStatus,
  wsUrl,
  onSourceChange,
  onWsUrlChange,
}: ConnectionConfigProps) {
  const [origin, setOrigin] = useState("")
  const [ingest, setIngest] = useState<IngestStatus | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/ingest", { cache: "no-store" })
      setIngest(await res.json())
    } catch {
      setIngest(null)
    }
  }

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const ingestUrl = `${origin}/api/ingest`

  const collectorEnv = `# Run on a host inside your network that can receive the router's flow export
INGEST_URL=${ingestUrl}
INGEST_API_KEY=<paste the same key you set in the v0 project>
# Protocol your router exports: netflow | ipfix | sflow
FLOW_PROTOCOL=netflow
# UDP port the collector listens on (must match the router's destination port)
FLOW_PORT=2055`

  const captureEnv = `# Run on a host that sees the Wi-Fi/LAN traffic (gateway, mirror port, or
# a Wi-Fi adapter in monitor mode). Requires libpcap (Linux/macOS) or Npcap (Windows).
CAPTURE_IFACE=eth0          # interface to sniff (e.g. en0, wlan0, "Wi-Fi")
CAPTURE_FILTER=ip           # BPF filter, e.g. "tcp or udp", "not port 22"
WS_PORT=9100                # WebSocket port the dashboard connects to
WS_TOKEN=                   # optional shared token; dashboard appends ?token=...
# Optionally also forward to the cloud ingest API:
INGEST_URL=
INGEST_API_KEY=`

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Settings className="w-4 h-4" />
          Connection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Data Source &amp; Connection</DialogTitle>
          <DialogDescription>
            Choose where traffic data comes from and configure your NetFlow / sFlow / IPFIX collector.
          </DialogDescription>
        </DialogHeader>

        {/* Source selector */}
        <div className="space-y-2">
          <Label className="text-sm">Active data source</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SOURCE_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = source === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => onSourceChange(opt.value)}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground leading-tight">{opt.desc}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Status:</span>
            <Badge variant={connectionStatus === "receiving" ? "default" : "secondary"}>{connectionStatus}</Badge>
            {ingest && (
              <span>
                {ingest.status.buffered} buffered &middot; {ingest.status.totalIngested} ingested
                {ingest.status.lastIngestAt
                  ? ` · last ${new Date(ingest.status.lastIngestAt).toLocaleTimeString()}`
                  : " · no data yet"}
              </span>
            )}
          </div>
        </div>

        <Tabs defaultValue={source === "live-ws" ? "capture" : "endpoint"} className="mt-2">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="endpoint">Endpoint</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="router">Router</TabsTrigger>
          </TabsList>

          <TabsContent value="capture" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Direct packet capture path: <code className="font-mono">Wi-Fi/AP → libpcap/Npcap → capture agent →
              WebSocket → dashboard</code>. Run the capture agent on a host that sees the traffic, then point the
              dashboard at its WebSocket server.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">WebSocket URL (capture agent)</Label>
              <Input
                value={wsUrl}
                onChange={(e) => onWsUrlChange(e.target.value)}
                placeholder="ws://localhost:9100"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Select <span className="text-foreground">Live (WS)</span> above to connect. Reconnects automatically.
              </p>
            </div>
            <CopyField label="Capture agent .env" value={captureEnv} />
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="text-foreground font-medium">Install the packet-capture driver</p>
              <p>
                Linux/macOS: <code className="font-mono">libpcap</code> (usually preinstalled; else{" "}
                <code className="font-mono">apt install libpcap-dev</code>)
              </p>
              <p>
                Windows: install <code className="font-mono">Npcap</code> from npcap.com (enable WinPcap-compatible
                mode)
              </p>
              <p>Capture needs root/admin: run with sudo or grant cap_net_raw.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-2 bg-transparent">
              <Link href="/setup">
                <ExternalLink className="w-4 h-4" />
                Full setup documentation
              </Link>
            </Button>
          </TabsContent>

          <TabsContent value="endpoint" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Your collector agent forwards parsed flow records to this HTTPS endpoint as JSON.
            </p>
            <CopyField label="Ingest URL (POST)" value={ingestUrl} />
            <CopyField label="SSE stream (used by this dashboard)" value={`${origin}/api/stream`} />
            <CopyField label="Polling endpoint" value={`${origin}/api/packets?limit=200`} />
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              Test ingest from a terminal:
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-foreground">
                {`curl -X POST ${ingestUrl} \\
  -H "Authorization: Bearer $INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"sourceIp":"10.0.0.5","destIp":"8.8.8.8","destPort":443,"protocol":6,"bytes":1240}'`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="credentials" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Ingest is protected by a shared secret. Set <code className="font-mono">INGEST_API_KEY</code> in your
              project environment variables (Project Settings &rarr; Vars), then give the collector the same value.
            </p>
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Auth required</span>
                <Badge variant={ingest?.authRequired ? "default" : "destructive"}>
                  {ingest?.authRequired ? "Yes — key is set" : "No — key not set (open)"}
                </Badge>
              </div>
              {!ingest?.authRequired && (
                <p className="text-xs text-muted-foreground">
                  No <code className="font-mono">INGEST_API_KEY</code> is configured, so the ingest endpoint accepts
                  unauthenticated data. Set one before exposing this publicly.
                </p>
              )}
            </div>
            <CopyField label="Generate a key (run locally)" value="openssl rand -base64 32" />
            <p className="text-xs text-muted-foreground">
              The collector sends it as an HTTP header: <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>
            </p>
          </TabsContent>

          <TabsContent value="router" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Routers export flow data over UDP, which a web app cannot receive directly. Run the lightweight collector
              agent on a host inside your network, point your router&apos;s flow export at it, and it forwards normalized
              JSON to the ingest URL.
            </p>
            <CopyField label="Collector .env" value={collectorEnv} />
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="text-foreground font-medium">Typical router config</p>
              <p>
                NetFlow v9 / IPFIX &rarr; export to{" "}
                <code className="font-mono">&lt;collector-host-ip&gt;:2055</code>
              </p>
              <p>
                sFlow &rarr; export to <code className="font-mono">&lt;collector-host-ip&gt;:6343</code>
              </p>
              <p>Sampling rate 1:1 for low traffic, 1:1000 for high-volume links.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-2 bg-transparent">
              <Link href="/setup">
                <ExternalLink className="w-4 h-4" />
                Full setup documentation
              </Link>
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
