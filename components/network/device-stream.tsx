"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Wifi, TrendingUp, AlertCircle, Globe } from "lucide-react"
import type { PacketHeader } from "@/lib/types"

interface DeviceStats {
  ip: string
  mac?: string
  packets: number
  bytes: number
  protocols: Record<string, number>
  domains: string[]
  isSuspicious: boolean
  lastSeen: number
}

interface DeviceStreamProps {
  packets: PacketHeader[]
  ipFilter?: string
  macFilter?: string
}

export function DeviceStream({ packets, ipFilter = "", macFilter = "" }: DeviceStreamProps) {
  const deviceMap = new Map<string, DeviceStats>()

  for (const packet of packets) {
    const key = packet.sourceIp
    if (!deviceMap.has(key)) {
      deviceMap.set(key, {
        ip: packet.sourceIp,
        mac: packet.sourceMac,
        packets: 0,
        bytes: 0,
        protocols: {},
        domains: [],
        isSuspicious: false,
        lastSeen: 0,
      })
    }

    const device = deviceMap.get(key)!
    device.packets += 1
    device.bytes += packet.size
    device.protocols[packet.protocol] = (device.protocols[packet.protocol] ?? 0) + 1
    if (packet.domain && !device.domains.includes(packet.domain)) {
      device.domains.push(packet.domain)
    }
    device.isSuspicious = device.isSuspicious || packet.isSuspicious
    device.lastSeen = Math.max(device.lastSeen, packet.timestamp)
  }

  let devices = Array.from(deviceMap.values()).sort((a, b) => b.packets - a.packets)

  // Apply filters
  if (ipFilter.trim()) {
    devices = devices.filter((device) => device.ip.toLowerCase().includes(ipFilter.toLowerCase()))
  }
  if (macFilter.trim()) {
    devices = devices.filter(
      (device) => device.mac && device.mac.toLowerCase().includes(macFilter.toLowerCase())
    )
  }

  if (devices.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No device activity yet. Send traffic to /api/ingest to see live device streams.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {devices.map((device) => (
        <Card key={device.ip} className={device.isSuspicious ? "border-red-500/50" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-blue-500" />
                <div>
                  <CardTitle className="text-base">{device.ip}</CardTitle>
                  {device.mac && <p className="text-xs text-muted-foreground">MAC: {device.mac}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {device.isSuspicious && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Suspicious
                  </Badge>
                )}
                <Badge variant="secondary">{device.packets} packets</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Total bytes</span>
                <span className="text-lg font-semibold">{Math.round(device.bytes / 1024)} KB</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Protocols</span>
                <span className="text-lg font-semibold">{Object.keys(device.protocols).length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Domains</span>
                <span className="text-lg font-semibold">{device.domains.length}</span>
              </div>
            </div>

            {Object.keys(device.protocols).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(device.protocols).map(([protocol, count]) => (
                  <Badge key={protocol} variant="outline">
                    {protocol}: {count}
                  </Badge>
                ))}
              </div>
            )}

            {device.domains.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Top domains:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {device.domains.slice(0, 5).map((domain) => (
                    <Badge key={domain} variant="secondary" className="text-xs">
                      {domain}
                    </Badge>
                  ))}
                  {device.domains.length > 5 && (
                    <Badge variant="secondary" className="text-xs">
                      +{device.domains.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
