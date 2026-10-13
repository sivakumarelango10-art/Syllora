from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "Syllora AI Backend"


def test_openapi_docs_are_available_and_rag_routes_are_registered() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/llm/status" in paths
    assert "/api/v1/llm/test" in paths
    assert "/api/v1/documents" in paths
    assert "/api/v1/search" in paths
    assert "/api/v1/ask" in paths
