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


