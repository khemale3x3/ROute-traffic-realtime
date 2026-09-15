# Router traffic monitoring setup

This project now supports a local router-monitoring workflow for your own network:

- store router admin credentials in environment variables
- keep a short history window (default 7 days)
- collect traffic summaries and recent packets
- optionally persist traffic rows into PostgreSQL
- expose a JSON endpoint for router monitoring reports

## 1. Configure your router settings

Copy the example environment file and fill in your local router values:

```bash
cp .env.example .env.local
```

Example values:

```env
ROUTER_HOST=192.168.1.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=super-secret
ROUTER_ADMIN_PORT=80
ROUTER_ADMIN_DOMAIN=router.local
ROUTER_MONITOR_MODE=false
TRAFFIC_HISTORY_DAYS=7
```

Keep these values in a local file or your deployment secret store. Do not commit them to your repository.

## 2. Optional PostgreSQL storage

If you want to save traffic details beyond the in-memory buffer, enable PostgreSQL:

```env
POSTGRES_ENABLED=true
POSTGRES_URL=postgres://user:pass@host:5432/routerdb
POSTGRES_TABLE=router_traffic
```

The app will create the table automatically and keep it pruned to the configured history window.

## 3. How to test locally

1. Install dependencies:

```bash
pnpm install
```

2. Run the app:

```bash
pnpm dev
```

3. Send a sample ingest record:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"sourceIp":"192.168.1.25","destIp":"8.8.8.8","destPort":443,"protocol":"HTTPS","bytes":1240,"tcpFlags":["ACK"],"timestamp":1700000000000,"domain":"example.com"}'
```

4. Check the summary endpoint:

```bash
curl http://localhost:3000/api/traffic
```

## 4. What you can capture

The current flow supports:

- connected device IPs
- destination IP / port pairs
- protocol distribution
- suspicious traffic alerts
- top destination domains (when a domain is supplied)
- recent packet history
- optional persistence into PostgreSQL for reports and historical queries

## 5. Where to extend next

For a more complete router admin dashboard, add:

- a device inventory page with hostnames and MAC addresses
- a history page for the last 7 days
- a top-sites report from DNS/domain data
- a per-device traffic breakdown view
- admin-only router credential storage UI with encryption

## 6. Suggested PostgreSQL queries

```sql
SELECT * FROM router_traffic ORDER BY timestamp DESC LIMIT 50;

SELECT protocol, COUNT(*) AS count
FROM router_traffic
GROUP BY protocol
ORDER BY count DESC;
```

# Network Intelligence Setup and Data Model

This document is the final setup guide for the router traffic monitoring system.
It covers:

- what data to capture
- what can be extracted from router-only data
- what requires advanced DNS/flow/DPI tooling
- recommended architecture
- PostgreSQL schema and table columns
- API endpoints and storage guidance
- where to store credentials
- how to use the system for future analysis

---

## 1. What this system tracks

### Router-only data (possible)

These items can usually come from the router or from flow export / DHCP logs:

- Connected devices
  - MAC address
  - IPv4 / IPv6 address
  - device name / hostname
  - vendor fingerprint
- Bandwidth per device
- Session time
  - connect time
  - disconnect time
  - duration
- Total traffic
  - upload bytes
  - download bytes
- DHCP activity
  - lease events
  - assigned addresses
- DNS queries (if router or DNS service logs them)
- Top domains visited
  - if DNS logging is enabled
  - if flow records include host/domain metadata

### Not directly from router

The router cannot reliably provide:

- exact mobile/desktop apps used (WhatsApp, YouTube, etc.)
- screen time like iOS/Android
- tool usage inside apps
- HTTPS content or full visited page payload
- full page titles or page bodies

### Advanced insights require extra tooling

To enrich router traffic data, add one or more of these:

- DNS logging service: Pi-hole, AdGuard Home
- Flow exporter / analyzer: NetFlow / IPFIX / nProbe / ntopng
- Inspection engine: Suricata, Zeek
- Device agent: for screen time or app activity on endpoints

---

## 2. Recommended architecture

```
Router (OpenWRT / MikroTik / ASUS)        ↓ Traffic Export (NetFlow / IPFIX / DHCP / DNS)        ↓ Collector Server (Node.js / Python)        ↓ Processing Layer
  ├── Device mapping
  ├── Access point grouping
  ├── Session builder
  ├── Domain resolution
  ├── Traffic aggregation
  ↓ PostgreSQL (analytics store)
  ↓ Dashboard (Next.js / Grafana)
```

Optional add-ons:

- DNS: Pi-hole / AdGuard Home
- Flow analytics: ntopng
- IDS / DPI: Zeek / Suricata
- Device presence: DHCP leases / ARP table

---

## 3. Final database design

This is the schema you should use for future logs, rich device tracking, and analytics.

### 3.1 `groups`

Stores organization or tenant grouping.

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `id` - unique group identifier
- `name` - group name
- `created_at` - record creation timestamp

### 3.2 `users`

Admin and viewer accounts.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  group_id UUID REFERENCES groups(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL, -- admin / viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `group_id` - organization membership
- `email` - account address
- `role` - permission level

### 3.3 `routers`

Configured routers / access points.

```sql
CREATE TABLE routers (
  id UUID PRIMARY KEY,
  group_id UUID REFERENCES groups(id),
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  router_type TEXT,
  location TEXT,
  auth_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `router_type` - e.g. mikrotik / openwrt / asus
- `auth_config` - encrypted or masked router admin metadata

### 3.4 `access_points`

Wi-Fi AP or switch segment grouping.

```sql
CREATE TABLE access_points (
  id UUID PRIMARY KEY,
  router_id UUID REFERENCES routers(id),
  name TEXT,
  ssid TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `router_id` - parent router
- `ssid` - Wi-Fi SSID
- `location` - physical location or room

### 3.5 `devices`

Discovered devices on the network.

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY,
  router_id UUID REFERENCES routers(id),
  ap_id UUID REFERENCES access_points(id),
  mac_address TEXT NOT NULL,
  ip_address TEXT,
  device_name TEXT,
  vendor TEXT,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  user_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
```

Columns:

- `mac_address` - device MAC
- `ip_address` - latest IP
- `device_name` - hostname or label
- `vendor` - OUI or vendor lookup
- `user_label` - user-defined alias

### 3.6 `device_sessions`

Device connection timeline.

```sql
CREATE TABLE device_sessions (
  id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(id),
  router_id UUID REFERENCES routers(id),
  ap_id UUID REFERENCES access_points(id),
  connected_at TIMESTAMPTZ NOT NULL,
  disconnected_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  session_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `connected_at` - session start
- `disconnected_at` - session end
- `duration_seconds` - computed duration
- `session_type` - Wi-Fi / ethernet / guest

### 3.7 `traffic_logs`

Raw and normalized traffic records.

```sql
CREATE TABLE traffic_logs (
  id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(id),
  router_id UUID REFERENCES routers(id),
  ap_id UUID REFERENCES access_points(id),
  timestamp TIMESTAMPTZ NOT NULL,
  src_ip TEXT,
  dest_ip TEXT,
  src_port INTEGER,
  dest_port INTEGER,
  protocol TEXT,
  bytes_up BIGINT DEFAULT 0,
  bytes_down BIGINT DEFAULT 0,
  packet_count INTEGER DEFAULT 0,
  flags TEXT[],
  ttl INTEGER,
  suspicious BOOLEAN DEFAULT FALSE,
  domain TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `bytes_up`, `bytes_down` - direction counts if available
- `domain` - inferred or DNS-derived hostname
- `suspicious` - heuristic flag

### 3.8 `dns_logs`

Domain query history.

```sql
CREATE TABLE dns_logs (
  id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(id),
  timestamp TIMESTAMPTZ NOT NULL,
  domain TEXT NOT NULL,
  query_type TEXT,
  response_ip TEXT,
  blocked BOOLEAN DEFAULT FALSE,
  upstream_dns TEXT,
  cached BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `query_type` - A / AAAA / CNAME / MX
- `blocked` - whether the request was blocked
- `response_ip` - returned address

### 3.9 `app_usage`

Inferred app / service usage.

```sql
CREATE TABLE app_usage (
  id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(id),
  timestamp TIMESTAMPTZ NOT NULL,
  app_name TEXT NOT NULL,
  domain TEXT,
  category TEXT,
  confidence FLOAT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `app_name` - inferred name like YouTube, WhatsApp
- `category` - video / social / messaging
- `confidence` - inference confidence score
- `metadata` - raw inference details

### 3.10 `screen_time`

Active-period approximation.

```sql
CREATE TABLE screen_time (
  id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(id),
  date DATE NOT NULL,
  active_seconds INTEGER NOT NULL,
  session_seconds INTEGER NOT NULL,
  packet_bursts INTEGER,
  dns_queries INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `active_seconds` - estimated active time
- `session_seconds` - connection duration
- `packet_bursts` - traffic activity count

### 3.11 `tool_usage`

Internal tool or service usage.

```sql
CREATE TABLE tool_usage (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_id UUID REFERENCES devices(id),
  tool_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `tool_name` - internal tool name or app pipeline
- `metadata` - contextual details

### 3.12 `daily_device_summary`

Aggregated per-device daily metrics.

```sql
CREATE TABLE daily_device_summary (
  id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(id),
  date DATE NOT NULL,
  total_up BIGINT DEFAULT 0,
  total_down BIGINT DEFAULT 0,
  active_time_seconds INTEGER DEFAULT 0,
  top_domain TEXT,
  top_app TEXT,
  session_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns:

- `total_up` / `total_down` - daily volume
- `active_time_seconds` - daily active estimate
- `top_domain` / `top_app` - highest use

---

## 4. Data tracking and storage guidance

### What to store

Store only metadata and flow-level telemetry:

- IPs, ports, protocols
- bytes transferred
- DNS query names
- connected device MAC/IP
- session start/end times
- inferred app names from domains
- aggregated daily totals

Do not store:

- packet payloads
- HTTPS contents
- user credentials
- message bodies
- screen contents

### Where to store credentials

Router admin credentials should not be stored as plain text in PostgreSQL.
Use one of these patterns:

- environment variables / `.env.local`
- deployment secret store
- encrypted vault table

Example `router_secrets` table:

```sql
CREATE TABLE router_secrets (
  router_id UUID PRIMARY KEY REFERENCES routers(id),
  encrypted_credentials TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Environment variables

```
ROUTER_HOST=192.168.1.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=super-secret
ROUTER_ADMIN_PORT=80
ROUTER_ADMIN_DOMAIN=router.local
ROUTER_MONITOR_MODE=false
TRAFFIC_HISTORY_DAYS=7
POSTGRES_ENABLED=true
POSTGRES_URL=postgres://user:pass@host:5432/routerdb
POSTGRES_TABLE=router_traffic
```

---

## 5. API endpoints

Recommended API surface for the system:

- `POST /api/ingest` — ingest flow records
- `GET /api/devices` — list known devices
- `GET /api/ap` — access point / router summary
- `GET /api/stats` — aggregated analytics
- `GET /api/stream` — real-time WebSocket stream
- `GET /api/traffic` — router / traffic summary

### Example ingest payload

```json
{
  "sourceIp": "192.168.1.25",
  "destIp": "8.8.8.8",
  "sourceMac": "AA:BB:CC:DD:EE:FF",
  "routerId": "...",
  "destPort": 443,
  "protocol": "HTTPS",
  "bytes": 1240,
  "timestamp": 1700000000000,
  "domain": "example.com"
}
```

### Ingest pipeline steps

Each flow record should:

1. validate input
2. resolve device by IP/MAC
3. assign router / access point
4. persist raw traffic
5. update device session state
6. persist DNS information if available
7. infer app usage from domains
8. emit real-time updates to dashboard

---

## 6. Dashboard insights

### Group level

- total bandwidth across routers
- active device count
- top routers by usage
- usage trend

### Router level

- traffic per router
- active clients
- top devices
- live connection status

### Device level

- session timeline
- total upload/download
- estimated screen time
- top apps (inferred)
- top domains

### Timeline view

- hourly usage graph
- daily trends
- peak hours
- anomalies

---

## 7. Test plan

### Local test setup

1. run the dashboard locally
2. enable router flow export or DNS logging
3. connect multiple devices
4. generate traffic to common services
5. ingest records to `POST /api/ingest`
6. verify `/api/traffic` and `/api/devices`

### Example test commands

```bash
npm install
npm run dev
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"sourceIp":"192.168.1.12","destIp":"142.250.190.78","sourceMac":"AA:BB:CC:DD:EE:FF","routerId":"00000000-0000-0000-0000-000000000000","destPort":443,"protocol":"HTTPS","bytes":5120,"timestamp":'$(date +%s)000',"domain":"youtube.com"}'
```

Then verify:

```bash
curl http://localhost:3000/api/traffic
curl http://localhost:3000/api/devices
```

---

## 8. Important limitations

This system can infer apps from domains and traffic patterns, but it cannot provide exact app internals or screen-level monitoring without endpoint agents.

If you need app/tool-level detail beyond network metadata, add a client-side agent or MDM-style endpoint telemetry.

---

## 9. Notes for implementation

Add the following comment template to key files to keep the architecture consistent:

```js
/**
 * NETWORK INTELLIGENCE MODULE
 * - Must normalize incoming traffic
 * - Must map device + AP before saving
 * - Must support PostgreSQL persistence
 * - Must support aggregation pipeline
 */
```

Add the API ingest comment to `/app/api/ingest/route.ts`:

```js
/**
 * FLOW INGESTION PIPELINE
 * Steps:
 * 1. Validate incoming flow
 * 2. Resolve device (IP/MAC → device_id)
 * 3. Assign access point (AP)
 * 4. Store raw traffic_logs
 * 5. Update session tracking
 * 6. Log DNS if available
 * 7. Infer app usage from domain
 * 8. Emit real-time WebSocket update
 */
```

---

## 10. Final delivery

This `setup.md` is the final document for advanced router and Wi-Fi monitoring. It defines the tables, columns, and architecture needed to store every useful analytic data point for devices, sessions, traffic, DNS, and app inference.
