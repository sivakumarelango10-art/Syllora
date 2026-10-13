from __future__ import annotations

import pytest

from app.rag import store
from app.rag.search import invalidate_index_cache
import app.main as main


@pytest.fixture(autouse=True)
def isolated_local_store(tmp_path, monkeypatch):
    """Keep tests from writing uploaded files or indexes into the user's project data."""
    test_db = tmp_path / "test-syllora.sqlite3"
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "sqlite")
    monkeypatch.setenv("SYLLORA_REQUIRE_AUTH", "false")
    monkeypatch.setenv("SYLLORA_ALLOW_DEMO_AUTH", "true")
    monkeypatch.setenv("SYLLORA_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("SYLLORA_DB_PATH", str(test_db))
    monkeypatch.setattr("app.db._ACTIVE_ADAPTER", None)
    monkeypatch.setattr("app.repositories.academic_repository._ACADEMIC_REPO", None)
    monkeypatch.setattr("app.storage._ACTIVE_STORAGE", None)
    monkeypatch.setattr(store, "DB_PATH", test_db)
    test_upload_dir = tmp_path / "uploads"
    monkeypatch.setattr(main, "UPLOAD_DIR", test_upload_dir)
    store.init_db()
    invalidate_index_cache()
    yield
    invalidate_index_cache()
