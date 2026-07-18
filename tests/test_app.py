import os
import tempfile
from pathlib import Path

os.environ["SITES"] = "syamxm.com,cv.syamxm.com"
os.environ["FLAGS_DIR"] = tempfile.mkdtemp()

from fastapi.testclient import TestClient

import app as switchboard

client = TestClient(switchboard.app)


def test_valid_host_accepts_listed_sites():
    assert switchboard.valid_host("syamxm.com")
    assert switchboard.valid_host("cv.syamxm.com")


def test_valid_host_rejects_unknown_and_traversal():
    assert not switchboard.valid_host("evil.com")
    assert not switchboard.valid_host("../etc/passwd")
    assert not switchboard.valid_host("..")
    assert not switchboard.valid_host("syamxm.com/../x")
    assert not switchboard.valid_host("syamxm.com%2f..")
    assert not switchboard.valid_host("")
    assert not switchboard.valid_host(".syamxm.com")
    assert not switchboard.valid_host("syamxm.com.")
    assert not switchboard.valid_host("syamxm com")


def test_toggle_creates_and_deletes_flag():
    flag = Path(os.environ["FLAGS_DIR"]) / "syamxm.com.flag"
    assert not flag.exists()

    response = client.post("/api/sites/syamxm.com/toggle")
    assert response.status_code == 200
    assert response.json() == {"host": "syamxm.com", "maintenance": True}
    assert flag.exists()

    response = client.post("/api/sites/syamxm.com/toggle")
    assert response.status_code == 200
    assert response.json() == {"host": "syamxm.com", "maintenance": False}
    assert not flag.exists()


def test_toggle_rejects_unknown_host():
    response = client.post("/api/sites/evil.com/toggle")
    assert response.status_code == 404


def test_toggle_rejects_traversal():
    response = client.post("/api/sites/..%2F..%2Fetc%2Fpasswd/toggle")
    assert response.status_code == 404


def test_api_status_has_no_toggle_info():
    switchboard._cache["statuses"] = {"syamxm.com": 200, "cv.syamxm.com": None}
    switchboard._cache["expires"] = float("inf")

    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"all_ok", "sites"}
    for site in body["sites"]:
        assert set(site.keys()) == {"host", "state"}

    switchboard._cache["expires"] = 0.0


def test_api_sites_reports_maintenance_state():
    switchboard._cache["statuses"] = {"syamxm.com": 200, "cv.syamxm.com": 503}
    switchboard._cache["expires"] = float("inf")

    client.post("/api/sites/syamxm.com/toggle")
    response = client.get("/api/sites")
    sites = {s["host"]: s for s in response.json()}
    assert sites["syamxm.com"]["state"] == "maintenance"
    assert sites["cv.syamxm.com"]["state"] == "down"

    client.post("/api/sites/syamxm.com/toggle")
    switchboard._cache["expires"] = 0.0
