"""Syllora Centralized Configuration & Environment Loader.

Single source of truth for FastAPI backend and CLI tooling.
Anchors all relative filesystem paths to the Syllora project root,
prioritizes the root-level .env file, and strictly validates configurations.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger("syllora.config")

# Determine Syllora project root reliably regardless of current working directory
_CURRENT_FILE = Path(__file__).resolve()
# backend/app/config.py -> backend/app -> backend -> Syllora root
PROJECT_ROOT = _CURRENT_FILE.parents[2]

# 1. Load root-level .env as primary single source of truth
_loaded_env_path: Path | None = None
try:
    from dotenv import load_dotenv

    root_env = PROJECT_ROOT / ".env"
    if root_env.is_file():
        load_dotenv(root_env, override=False)
        _loaded_env_path = root_env
    else:
        root_env_local = PROJECT_ROOT / ".env.local"
        if root_env_local.is_file():
            load_dotenv(root_env_local, override=False)
            _loaded_env_path = root_env_local
        else:
            backend_env = PROJECT_ROOT / "backend" / ".env"
            if backend_env.is_file():
                load_dotenv(backend_env, override=False)
                _loaded_env_path = backend_env
except ImportError:
    logger.debug("python-dotenv not installed; relying on system environment variables.")
except Exception as exc:
    logger.warning("Failed loading environment file: %s", exc)


def get_project_root() -> Path:
    """Return the absolute Path to the Syllora repository root."""
    return PROJECT_ROOT


def resolve_project_path(path_str: str | Path | None, default_relative: str) -> Path:
    """
    Resolve a filesystem path against PROJECT_ROOT unless it is already absolute.
    Eliminates hardcoded Windows drive letters and enables cross-platform server execution.
    """
    raw = path_str or default_relative
    p = Path(raw)
    if p.is_absolute():
        return p
    return (PROJECT_ROOT / p).resolve()


# Application Settings
APP_NAME = os.getenv("APP_NAME", "Syllora AI Backend")
APP_ENV = os.getenv("APP_ENV", "development").lower()
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
REQUIRE_AUTH = os.getenv("SYLLORA_REQUIRE_AUTH", "true").lower() in ("true", "1")

# Server & Networking
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))
PUBLIC_API_BASE_URL = os.getenv("PUBLIC_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

_raw_cors = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080,https://syllora-seven.vercel.app"
)
CORS_ALLOWED_ORIGINS: list[str] = [origin.strip() for origin in _raw_cors.split(",") if origin.strip()]

# Database & Persistence
DB_PROVIDER = os.getenv("SYLLORA_DB_PROVIDER", "postgres").strip().lower()
DATABASE_URL = os.getenv("DATABASE_URL")
DIRECT_URL = os.getenv("DIRECT_URL")
DB_PATH = resolve_project_path(os.getenv("SYLLORA_DB_PATH") or os.getenv("SQLITE_PATH"), "backend/data/indexes/syllora.sqlite3")

# Storage
STORAGE_PROVIDER = os.getenv("SYLLORA_STORAGE_PROVIDER", "supabase").strip().lower()
UPLOAD_DIR = resolve_project_path(os.getenv("SYLLORA_UPLOAD_DIR") or os.getenv("LOCAL_UPLOAD_DIR"), "backend/data/uploads")
STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "syllora-study-pdfs")

# Supabase Auth & JWT
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("PUBLIC_SUPABASE_URL", "")).rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", os.getenv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""))
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
SUPABASE_JWKS_URL = os.getenv(
    "SUPABASE_JWKS_URL",
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""
)

# Ollama & AI Models
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", os.getenv("OLLAMA_CHAT_MODEL", "qwen3:4b"))
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))

# Rate Limiting & Limits
AI_RATE_LIMIT_RPM = int(os.getenv("AI_RATE_LIMIT_RPM", "30"))
STANDARD_RATE_LIMIT_RPM = int(os.getenv("STANDARD_RATE_LIMIT_RPM", "120"))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", os.getenv("SYLLORA_MAX_UPLOAD_MB", "20")))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_PDF_PAGES = int(os.getenv("SYLLORA_MAX_PDF_PAGES", "500"))
MAX_CHUNKS_PER_DOCUMENT = int(os.getenv("SYLLORA_MAX_CHUNKS_PER_DOCUMENT", "1200"))
MAX_CONCURRENT_INFERENCES = int(os.getenv("SYLLORA_MAX_CONCURRENT_INFERENCES", "3"))


def validate_environment() -> dict[str, Any]:
    """
    Validate active configuration for startup readiness.
    Returns status report without leaking passwords or secret keys.
    """
    issues: list[str] = []

    if DB_PROVIDER in ("postgres", "postgresql", "supabase") and not DATABASE_URL:
        issues.append("SYLLORA_DB_PROVIDER=postgres requires DATABASE_URL to be defined.")

    if not SUPABASE_URL:
        issues.append("SUPABASE_URL or PUBLIC_SUPABASE_URL is required for authentication.")

    if not SUPABASE_PUBLISHABLE_KEY:
        issues.append("SUPABASE_PUBLISHABLE_KEY is required for Supabase authentication and storage.")

    return {
        "valid": len(issues) == 0,
        "loaded_env_path": str(_loaded_env_path) if _loaded_env_path else None,
        "app_env": APP_ENV,
        "db_provider": DB_PROVIDER,
        "storage_provider": STORAGE_PROVIDER,
        "require_auth": REQUIRE_AUTH,
        "cors_origins_count": len(CORS_ALLOWED_ORIGINS),
        "issues": issues,
    }
