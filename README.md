# switchboard

Maintenance toggle dashboard + public status page for my self-hosted sites.
FastAPI, one container, no database.

## How it works

Maintenance mode per site is just a flag file:

```
/etc/nginx/flags/<host>.flag
```

Each nginx server block includes `nginx-samples/errors.conf`, which returns
503 when the flag exists and serves a custom error page for 404/503.
Switchboard only creates/deletes flag files in the mounted `/flags` dir —
it never touches nginx config and never reloads nginx.

## Two faces, one container

| Face | Exposure | Routes |
|------|----------|--------|
| Dashboard | Tailscale/localhost only (`127.0.0.1:8100` + tailscale IP) | `/`, `/api/sites`, `/api/sites/{host}/toggle`, `/status`, `/api/status` |
| Public status | Cloudflare Tunnel → nginx (`nginx-samples/status.syamxm.com.conf`) | `/status`, `/api/status` only — everything else 404s at nginx |

The public boundary is the nginx path allowlist: the tunnel only reaches the
`status.syamxm.com` server block, which proxies exactly two read-only paths.
The dashboard port is never routed by the tunnel.

## Run

```
cp .env.example .env   # set SITES and TAILSCALE_IP
sudo install -d -o 1000 /etc/nginx/flags   # writable by container user
docker compose up -d --build
```

## Status states

- `maintenance` — flag file exists
- `live` — site responded < 500 (checked every 30s, cached in memory)
- `down` — request failed or 5xx

## Dev

```
pip install -r requirements-dev.txt
ruff check . && pytest -q
SITES=syamxm.com FLAGS_DIR=/tmp/flags uvicorn app:app --reload
```
