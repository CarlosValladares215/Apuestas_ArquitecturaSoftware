from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_ok_and_read_only_mode() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "reports"
    assert payload["mode"] == "read-only"
    assert isinstance(payload["version"], str)
    assert isinstance(payload["timestamp"], str)
