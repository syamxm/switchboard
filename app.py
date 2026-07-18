import asyncio
import os
import re
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

SITES = [s.strip().lower() for s in os.environ.get("SITES", "").split(",") if s.strip()]
FLAGS_DIR = Path(os.environ.get("FLAGS_DIR", "/flags"))
STATIC_DIR = Path(__file__).parent / "static"
CACHE_TTL_SECONDS = 30
CHECK_TIMEOUT_SECONDS = 4

HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
    r"(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$"
)

app = FastAPI(title="switchboard", docs_url=None, redoc_url=None, openapi_url=None)

_cache_lock = asyncio.Lock()
_cache: dict = {"expires": 0.0, "statuses": {}}


def valid_host(host: str) -> bool:
    return bool(HOSTNAME_RE.fullmatch(host)) and host in SITES


def require_host(host: str) -> str:
    host = host.lower()
    if not valid_host(host):
        raise HTTPException(status_code=404, detail="unknown host")
    return host


def flag_path(host: str) -> Path:
    return FLAGS_DIR / f"{host}.flag"


def state_for(host: str, http_status: int | None) -> str:
    if flag_path(host).exists():
        return "maintenance"
    if http_status is not None and http_status < 500:
        return "live"
    return "down"


async def _fetch_status(client: httpx.AsyncClient, host: str) -> int | None:
    try:
        response = await client.get(f"https://{host}/")
        return response.status_code
    except httpx.HTTPError:
        return None


async def http_statuses() -> dict[str, int | None]:
    async with _cache_lock:
        if time.monotonic() < _cache["expires"]:
            return _cache["statuses"]
        async with httpx.AsyncClient(
            timeout=CHECK_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            results = await asyncio.gather(*(_fetch_status(client, h) for h in SITES))
        _cache["statuses"] = dict(zip(SITES, results))
        _cache["expires"] = time.monotonic() + CACHE_TTL_SECONDS
        return _cache["statuses"]


@app.get("/")
async def dashboard_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "dashboard.html")


@app.get("/status")
async def status_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "status.html")


@app.get("/api/sites")
async def api_sites() -> list[dict]:
    statuses = await http_statuses()
    return [
        {
            "host": host,
            "maintenance": flag_path(host).exists(),
            "http_status": statuses.get(host),
            "state": state_for(host, statuses.get(host)),
        }
        for host in SITES
    ]


@app.post("/api/sites/{host}/toggle")
async def toggle_site(host: str) -> dict:
    host = require_host(host)
    path = flag_path(host)
    if path.exists():
        path.unlink(missing_ok=True)
    else:
        path.touch()
    return {"host": host, "maintenance": path.exists()}


@app.get("/api/status")
async def api_status() -> dict:
    statuses = await http_statuses()
    sites = [
        {"host": host, "state": state_for(host, statuses.get(host))} for host in SITES
    ]
    return {"all_ok": all(s["state"] == "live" for s in sites), "sites": sites}
