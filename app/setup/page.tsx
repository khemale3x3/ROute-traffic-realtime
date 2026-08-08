import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Server, Router, KeyRound, Radio, Database, Wifi, Network } from "lucide-react"

export const metadata = {
  title: "Setup — Network Traffic Analyzer",
  description: "Connect real packet capture (libpcap/Npcap) or NetFlow / sFlow / IPFIX traffic to the dashboard.",
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground font-mono leading-relaxed">
      {children}
    </pre>
  )
}

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number
  icon: typeof Server
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-lg font-mono">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary text-sm">
            {n}
          </span>
          <Icon className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</CardContent>
    </Card>
  )
}

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-mono font-normal">Setup &amp; Connection Guide</h1>
          <Button asChild variant="outline" size="sm" className="gap-2 bg-transparent">
            <Link href="/">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
          </Button>
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 text-sm text-muted-foreground leading-relaxed space-y-3">
            <p className="text-foreground font-medium">How real-time monitoring works here</p>
            <p>
              A browser/serverless web app cannot capture raw packets or receive UDP flow exports directly. An agent
              runs where the traffic is, then forwards normalized data to the dashboard. There are{" "}
              <span className="text-foreground">two supported paths</span> — pick whichever matches your environment.
            </p>
            <div>
              <p className="text-foreground font-medium flex items-center gap-2">
                <Wifi className="w-4 h-4" strokeWidth={1.5} /> A. Direct packet capture (libpcap / Npcap)
              </p>
              <p className="mt-1">
                Full per-packet detail. Best for a host, gateway, or Wi-Fi adapter that can see the raw frames. Streams
                straight to the dashboard over WebSocket — use the <span className="text-foreground">Live (WS)</span>{" "}
                source.
              </p>
              <Code>{`Wi-Fi/AP ─▶ libpcap/Npcap ─▶ Capture Agent ─▶ WebSocket (ws://host:9100) ─▶ Dashboard`}</Code>
            </div>
            <div>
              <p className="text-foreground font-medium flex items-center gap-2">
                <Network className="w-4 h-4" strokeWidth={1.5} /> B. Flow export (NetFlow / sFlow / IPFIX)
              </p>
              <p className="mt-1">
                Aggregated flow records from a router/switch. Best for high-volume links and remote/cloud dashboards.
                Forwarded over HTTPS to the ingest API — use <span className="text-foreground">Live (SSE)</span> or{" "}
                <span className="text-foreground">Live (Poll)</span>.
              </p>
              <Code>{`Router/Switch ──NetFlow/sFlow/IPFIX (UDP)──▶ Collector Agent ──HTTPS POST──▶ /api/ingest ──SSE──▶ Dashboard`}</Code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-mono">
              <Wifi className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
              Path A — Direct packet capture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <div className="space-y-2">
              <p className="text-foreground font-medium">A1. Get the traffic to a capture host</p>
              <p>
                Capture only sees packets that physically reach the interface. Choose one:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <span className="text-foreground">Run on the gateway</span> — capture on the Linux box / Raspberry Pi
                  that routes your Wi-Fi/LAN traffic (sees everything by design).
                </li>
                <li>
                  <span className="text-foreground">Switch port mirroring (SPAN)</span> — mirror the uplink port to the
                  capture host on a managed switch.
                </li>
                <li>
                  <span className="text-foreground">Wi-Fi monitor mode</span> — put a wireless adapter into monitor mode
                  to sniff the air directly (see A3).
                </li>
              </ul>
              <p>
                Consumer Wi-Fi routers usually can&apos;t run a sniffer themselves; if yours runs OpenWrt you can install{" "}
                <code className="font-mono text-foreground">tcpdump</code> and pipe it, otherwise use mirroring or a
                gateway host.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-foreground font-medium">A2. Install the capture driver</p>
              <Code>{`# Linux (Debian/Ubuntu)
sudo apt install libpcap-dev

# macOS — libpcap is preinstalled

# Windows — install Npcap from https://npcap.com
#   ✔ enable "WinPcap API-compatible mode" during install`}</Code>
            </div>

            <div className="space-y-2">
              <p className="text-foreground font-medium">A3. (Optional) Wi-Fi monitor mode</p>
              <Code>{`# Linux — capture 802.11 frames over the air
sudo ip link set wlan0 down
sudo iw dev wlan0 set type monitor
sudo ip link set wlan0 up
# then set CAPTURE_IFACE=wlan0`}</Code>
            </div>

            <div className="space-y-2">
              <p className="text-foreground font-medium">A4. Run the capture agent</p>
              <p>
                It lives in <code className="font-mono text-foreground">/collector</code>. Copy it to the capture host
                (Node.js 20+), then:
              </p>
              <Code>{`cd collector
cp .env.example .env
#  edit .env:
#    CAPTURE_IFACE=eth0     # or wlan0 / en0 / "Wi-Fi"
#    CAPTURE_FILTER=ip      # BPF filter (tcpdump syntax)
#    WS_PORT=9100
#    WS_TOKEN=<optional shared token>
npm install                 # builds the libpcap/Npcap binding + ws
sudo -E npm run capture     # raw capture needs root/admin`}</Code>
              <p>
                The agent decodes Ethernet → IPv4 → TCP/UDP and broadcasts each packet as JSON over its WebSocket
                server. On the dashboard, open <span className="text-foreground">Connection → Capture</span>, set the
                WebSocket URL to <code className="font-mono text-foreground">ws://&lt;capture-host&gt;:9100</code>{" "}
                (append <code className="font-mono text-foreground">?token=…</code> if you set{" "}
                <code className="font-mono text-foreground">WS_TOKEN</code>), then choose the{" "}
                <span className="text-foreground">Live (WS)</span> source.
              </p>
            </div>

            <div className="rounded-md border border-border p-3 text-xs space-y-1">
              <p className="text-foreground font-medium">Credentials &amp; service providers</p>
              <p>
                No third-party account or API key is required for capture — it reads your own interface locally. The
                only optional secret is <code className="font-mono text-foreground">WS_TOKEN</code>, a string you invent
                to gate WebSocket access. For an ISP/managed network you don&apos;t control, you can&apos;t capture
                their traffic; use flow export (Path B) on equipment you own instead.
              </p>
            </div>
          </CardContent>
        </Card>

        <h2 className="text-lg font-mono pt-2 flex items-center gap-2">
          <Network className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
          Path B — Flow export (NetFlow / sFlow / IPFIX)
        </h2>

        <Step n={1} icon={KeyRound} title="Set the ingest secret">
          <p>
            Generate a shared secret and add it to this project&apos;s environment variables as{" "}
            <code className="font-mono text-foreground">INGEST_API_KEY</code> (Project Settings &rarr; Vars). The ingest
            API rejects any request without a matching{" "}
            <code className="font-mono text-foreground">Authorization: Bearer</code> header once this is set.
          </p>
          <Code>{`openssl rand -base64 32`}</Code>
          <p className="flex items-center gap-2">
            <Badge variant="secondary">Required for production</Badge>
            <span>Without it, the ingest endpoint accepts unauthenticated data.</span>
          </p>
        </Step>

        <Step n={2} icon={Router} title="Configure your router's flow export">
          <p>Point your device&apos;s flow exporter at the host where the collector will run.</p>
          <p className="text-foreground font-medium">Cisco IOS (NetFlow v9) example</p>
          <Code>{`flow exporter ANALYZER
  destination <collector-host-ip>
  transport udp 2055
  template data timeout 60
flow monitor MON
  exporter ANALYZER
  record netflow ipv4 original-input
interface GigabitEthernet0/1
  ip flow monitor MON input
  ip flow monitor MON output`}</Code>
          <p className="text-foreground font-medium">MikroTik / RouterOS (IPFIX/NetFlow)</p>
          <Code>{`/ip traffic-flow set enabled=yes
/ip traffic-flow target add address=<collector-host-ip>:2055 version=9`}</Code>
          <p className="text-foreground font-medium">sFlow (switches)</p>
          <Code>{`# Export sFlow to <collector-host-ip>:6343, sampling 1:1000`}</Code>
        </Step>

        <Step n={3} icon={Server} title="Run the collector agent">
          <p>
            The agent lives in the <code className="font-mono text-foreground">/collector</code> folder of this project.
            Copy it to a machine on your network (it needs Node.js 20+), then:
          </p>
          <Code>{`cd collector
cp .env.example .env
#  edit .env:
#    INGEST_URL=https://<your-app>.vercel.app/api/ingest
#    INGEST_API_KEY=<the key from step 1>
#    FLOW_PROTOCOL=netflow   # or ipfix | sflow
#    FLOW_PORT=2055          # must match the router export port
npm install
npm start`}</Code>
          <p>
            The starter decodes NetFlow v5 out of the box. For NetFlow v9, IPFIX, or sFlow, install a dedicated parser
            (e.g. <code className="font-mono text-foreground">node-netflowv9</code> or{" "}
            <code className="font-mono text-foreground">sflow</code>) and map decoded fields to{" "}
            <code className="font-mono text-foreground">srcAddr, dstAddr, srcPort, dstPort, proto, octets, tcpFlags</code>
            — see the comments in <code className="font-mono text-foreground">collector.mjs</code>.
          </p>
        </Step>

        <Step n={4} icon={Radio} title="Switch the dashboard to live">
          <p>
            On the dashboard, open <span className="text-foreground">Connection</span> and pick a live source:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground">Live (SSE)</span> — recommended; pushes packets instantly via{" "}
              <code className="font-mono text-foreground">/api/stream</code>.
            </li>
            <li>
              <span className="text-foreground">Live (Poll)</span> — fetches{" "}
              <code className="font-mono text-foreground">/api/packets</code> every 1.5s; use where SSE is blocked.
            </li>
            <li>
              <span className="text-foreground">Mock</span> — synthetic demo data, no collector needed.
            </li>
          </ul>
          <p>Verify the pipeline end-to-end without a router using curl:</p>
          <Code>{`curl -X POST https://<your-app>.vercel.app/api/ingest \\
  -H "Authorization: Bearer $INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"sourceIp":"10.0.0.5","destIp":"8.8.8.8","destPort":443,"protocol":6,"bytes":1240,"tcpFlags":18}'`}</Code>
        </Step>

        <Step n={5} icon={KeyRound} title="Store router credentials safely">
          <p>
            Keep your router admin details in a local environment file or a secret manager instead of committing them to source.
            This project reads the values from <code className="font-mono text-foreground">.env.local</code> or your deployment
            secrets.
          </p>
          <Code>{`cp .env.example .env.local
# fill in the router values you actually own
ROUTER_HOST=192.168.1.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=super-secret
ROUTER_ADMIN_PORT=80
ROUTER_ADMIN_DOMAIN=router.local
ROUTER_MONITOR_MODE=false
TRAFFIC_HISTORY_DAYS=7

# Optional Postgres history
POSTGRES_ENABLED=true
POSTGRES_URL=postgres://user:pass@host:5432/routerdb
POSTGRES_TABLE=router_traffic
`}</Code>
          <p>
            You can keep the router IP, admin domain, password, and monitoring notes here. If you later want to add a
            router-management UI, read from this config layer instead of hard-coding values.
          </p>
        </Step>

        <Step n={6} icon={Database} title="Persistence and 7-day history">
          <p>
            The dashboard currently keeps a live in-memory rolling buffer (up to 1000 records). On a multi-instance
            serverless deployment, ingest and stream connections can land on different instances, so live data
            won&apos;t be shared and restarts clear the buffer.
          </p>
          <p>
            For your own lab/router test setup, enable PostgreSQL and the app will persist traffic rows, prune older
            records, and retain the last <span className="text-foreground">7 days</span> by default. The store API in{" "}
            <code className="font-mono text-foreground">lib/flow-store.ts</code> (
            <code className="font-mono text-foreground">pushPackets / getRecentPackets / subscribe</code>) is designed to
            be swapped without touching the routes or UI.
          </p>
        </Step>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-mono">Ingest payload reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              POST a single object, an array, or <code className="font-mono text-foreground">{"{ flows: [...] }"}</code>.
              All fields are optional except a source and destination IP. Accepted field names:
            </p>
            <Code>{`{
  "sourceIp" | "srcAddr":  "10.0.0.5",
  "destIp"   | "dstAddr":  "8.8.8.8",
  "sourcePort" | "srcPort": 51514,
  "destPort"   | "dstPort": 443,
  "protocol"   | "proto":   6,          // IP proto number or "TCP"/"UDP"/...
  "bytes" | "octets" | "size": 1240,
  "packets": 3,
  "tcpFlags": 18,                        // numeric bitmask or ["SYN","ACK"]
  "ttl": 64,
  "timestamp": 1700000000000,            // ms epoch (defaults to now)
  "geo": { "lat": 0, "lng": 0, "country": "US", "city": "Ashburn" }
}`}</Code>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
