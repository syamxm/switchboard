# switchboard

Maintenance toggle dashboard + public status page for my self-hosted sites.
FastAPI, one container, no database.

## Code map

```text
app.py                     # Settings, host validation, flag files, HTTP checks, cache, routes
static/
  dashboard.html           # Dashboard markup
  status.html              # Public page markup
  assets/
    common.css             # Embedded fonts, colors and shared components
    dashboard.css          # Dashboard-only styles
    status.css             # Public-page-only styles
    common.js              # Helpers both pages share
    dashboard.js           # Dashboard rendering, refresh and toggle flow
    status.js              # Public rendering and refresh flow
tests/
  test_app.py              # Host validation, flag toggles and API state checks
  check_pages.js           # Asset references and page behavior on a simulated DOM
nginx-samples/             # Maintenance responses and the public route allowlist
Dockerfile                 # Image build
docker-compose.yml         # Port bindings and flag directory mount
```

| File | Responsibility |
|------|----------------|
| `app.py` | Environment settings, host validation, flag files, HTTP checks, cache, the asset mount and five routes. |
| `static/*.html` | Markup and the asset references for each page. Styles and scripts live in `static/assets/`. |
| `static/assets/common.*` | Everything identical in both pages: fonts, palette, chrome, port strip, service-row base, staleness math, the fetch wrapper. |
| `static/assets/dashboard.*` | Maintenance switch, action log, HTTP column, clock and the toggle flow. |
| `static/assets/status.*` | Read-only rows and the indicator dot. |
| `tests/test_app.py` | Host validation, flag toggles and API state checks. |
| `tests/check_pages.js` | Asset references, transfer budget and JavaScript behavior using a simulated DOM. |
| `docker-compose.yml`, `Dockerfile` | Container setup, port bindings and flag directory mount. |
| `nginx-samples/` | Maintenance responses and the public route allowlist. |

Start with `app.py` to understand the data flow. Then read
`static/assets/common.js` for the shared helpers, and the page's own script to
see how it uses them.

The two pages differ enough to keep apart: they call different endpoints, have
different response shapes and validation rules, and only the dashboard writes.
`common.js` holds what is identical in both, and nothing else.

### Design notes

Both pages are one rack panel: a fixed top strip, a vertical rack label down
the left edge on wide screens, and a hard-left asymmetric verdict block. There
is one accent (violet) and three semantic state hues; everything else is
carried by weight, spacing and a single cool-violet gray family.

Three things on the page are data, not decoration, and should stay that way:

- The **jackfield** above the channels — one module per service, state named in
  text next to the lamp.
- The **poll history** on each channel strip — one cell per poll this page has
  observed, oldest on the left. A failed poll writes a hatched gap, so an
  outage in the checker reads differently from a service that was really down.
  It lives in memory only and starts empty on every load.
- The **state bar** in each row's gutter.

Anything added here should say something true about the system or come out.

The verdict is drawn twice: `#banner` holds the plain sentence for screen
readers and for the no-JS case, and `#ansi` redraws it in ANSI Shadow block
letters once the script runs. The glyph table in `common.js` was generated with
pyfiglet (`ansi_shadow`) and covers A-Z, 0-9 and space. Wrapping is measured in
glyph columns, not characters, because `I` is three columns wide and `M` is
eleven; CSS then sizes the type from the column count so the widest line fits.
The art needs U+2500-259F, which is why `common.css` embeds a second woff2 face
for the box-drawing range. Don't drop it.

The whole page sits behind a CRT overlay: scanlines, an RGB aperture mask on
desktop, a rolling bar, grain, tube-edge falloff and a phosphor text glow. It
is strong enough to get in the way of reading, so the rack carries a `crt`
toggle; the preference is stored per browser and off means fully off. All of
its motion also stops under `prefers-reduced-motion` and while the tab is
hidden.

### Serving the assets

Only `static/assets/` is mounted, at `/assets`. Mounting all of `static/` would
also serve the dashboard HTML through that route.

The public nginx block allowlists `common.css`, `status.css`, `common.js` and
`status.js` by name. The dashboard's own assets stay unreachable through the
tunnel along with the dashboard page and the write API.

Asset URLs carry a `?v=` value. Bump it in both pages when you change a file
under `static/assets/`.

## If the backend grows

The backend is 119 lines of small named functions. Keep it in one file for now;
splitting every helper into a module would make it harder to follow.

When it does get too long, extract HTTP probing and its cache together into
`health.py` first. Keep the cache lock and cached data with the code that owns
them. Update the Dockerfile to copy the new module and adjust the tests that
reach into `app._cache`. Leave routes in `app.py` until they become difficult
to read.

No frontend framework or build step is needed, and none should be added.

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
- `live` — site root responded HTTP 200 (checks run on API requests when the
  30-second in-memory cache expires; there is no background checker)
- `down` — any other HTTP status, timeout, or connection/DNS failure. Redirects are followed to their final response.

## Dev

```
pip install -r requirements-dev.txt
ruff check . && pytest -q
node tests/check_pages.js
mkdir -p /tmp/flags
SITES=syamxm.com FLAGS_DIR=/tmp/flags uvicorn app:app --reload
```

The page checks require Node.js and no npm packages. Expect a passed message
for each page. Python checks should report no lint errors and passing tests.

For a browser check, open `http://127.0.0.1:8000/` and `/status`. Both should
show the configured sites. Toggle maintenance on the dashboard: its flag
should appear in `/tmp/flags`, and the public page should show maintenance
on its next refresh. Toggle it off to remove the flag. Browser layout and
real nginx behavior still need manual checks.
