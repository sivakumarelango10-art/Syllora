from __future__ import annotations

import pytest

from app.rag import store
from app.rag.search import invalidate_index_cache
import app.main as main


@pytest.fixture(autouse=True)
def isolated_local_store(tmp_path, monkeypatch):
    """Keep tests from writing uploaded files or indexes into the user's project data."""
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "test-syllora.sqlite3")
    test_upload_dir = tmp_path / "uploads"
    monkeypatch.setattr(main, "UPLOAD_DIR", test_upload_dir)
    store.init_db()
    invalidate_index_cache()
    yield
    invalidate_index_cache()
