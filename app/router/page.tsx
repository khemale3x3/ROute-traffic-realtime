import Link from "next/link"
import { ArrowLeft, Database, History, Router as RouterIcon, ShieldAlert, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

async function getTrafficData() {
  const res = await fetch("/api/traffic", { cache: "no-store" })
  if (!res.ok) return null
  return res.json()
}

export default async function RouterPage() {
  const data = await getTrafficData()

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono">Router traffic summary</h1>
            <p className="text-sm text-muted-foreground">Local router monitoring, history retention, and traffic reports.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2 bg-transparent">
            <Link href="/">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
          </Button>
        </div>

        {!data ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No traffic data yet. Start the app and send traffic to /api/ingest to populate this view.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Router</CardTitle>
                  <RouterIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{data.router?.host || "Not configured"}</div>
                  <p className="text-xs text-muted-foreground">Admin domain: {data.router?.adminDomain || "—"}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">History</CardTitle>
                  <History className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{data.router?.historyDays ?? 7} days</div>
                  <p className="text-xs text-muted-foreground">Retention window for traffic rows.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Live buffer</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{data.summary?.buffered ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Recent packets kept in memory.</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wifi className="h-4 w-4" /> Unique devices seen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {data.summary?.uniqueDevices?.length ? (
                    data.summary.uniqueDevices.map((device: string) => <div key={device}>{device}</div>)
                  ) : (
                    <p className="text-muted-foreground">No device activity yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="h-4 w-4" /> Suspicious / notable traffic
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>Suspicious count: {data.summary?.suspiciousCount ?? 0}</div>
                  <div>Top domains: {data.summary?.topDomains?.slice(0, 5).map((item: { name: string }) => item.name).join(", ") || "—"}</div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
