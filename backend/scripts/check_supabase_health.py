"""Comprehensive Supabase health check utility for Syllora."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv
    root_env = backend_dir.parent / ".env"
    if root_env.is_file():
        load_dotenv(root_env, override=False)
    else:
        load_dotenv(backend_dir.parent / ".env.local", override=False)
        load_dotenv(backend_dir / ".env", override=False)
except Exception:
    pass

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import httpx
import psycopg
from psycopg.rows import dict_row

from app.db.postgres_adapter import PostgresAdapter, normalize_postgres_url


def run_health_check() -> dict:
    results = {}
    print("=" * 70)
    print("  SYLLORA -- SUPABASE COMPREHENSIVE HEALTH CHECK")
    print("=" * 70)

    # 1. Inspect Environment Variables
    sb_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    pub_key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    jwks_url = os.getenv("SUPABASE_JWKS_URL", "")
    db_url = os.getenv("DATABASE_URL", "")
    direct_url = os.getenv("DIRECT_URL", "")

    print(f"\n[1] Environment Configuration:")
    print(f"  * SUPABASE_URL:          {sb_url}")
    print(f"  * PUBLISHABLE_KEY:       {pub_key[:16]}... (length: {len(pub_key)})")
    print(f"  * JWKS_URL:              {jwks_url}")
    print(f"  * DATABASE_URL (pooler): {'Configured' if db_url else 'MISSING'}")
    print(f"  * DIRECT_URL (session):  {'Configured' if direct_url else 'MISSING'}")

    results["env_ready"] = bool(sb_url and db_url)

    # 2. HTTP / REST & Auth Services Health
    print(f"\n[2] HTTP & Auth Infrastructure Health:")
    headers = {"apikey": pub_key, "Authorization": f"Bearer {pub_key}"}
    
    with httpx.Client(timeout=8.0) as client:
        # Auth (GoTrue) Health
        t0 = time.perf_counter()
        try:
            r_auth = client.get(f"{sb_url.rstrip('/')}/auth/v1/health", headers=headers)
            auth_latency = (time.perf_counter() - t0) * 1000
            if r_auth.status_code == 200:
                auth_data = r_auth.json()
                print(f"  [PASS] GoTrue Auth Service:   HEALTHY ({auth_latency:.0f}ms) -- {auth_data.get('name')} {auth_data.get('version')}")
                results["auth_service"] = "HEALTHY"
            else:
                print(f"  [FAIL] GoTrue Auth Service:   HTTP {r_auth.status_code} ({r_auth.text})")
                results["auth_service"] = f"HTTP {r_auth.status_code}"
        except Exception as e:
            print(f"  [FAIL] GoTrue Auth Service:   ERROR ({e})")
            results["auth_service"] = f"ERROR: {e}"

        # JWKS Endpoint (for PyJWT token verification)
        t0 = time.perf_counter()
        try:
            r_jwks = client.get(jwks_url or f"{sb_url.rstrip('/')}/auth/v1/.well-known/jwks.json")
            jwks_latency = (time.perf_counter() - t0) * 1000
            if r_jwks.status_code == 200:
                keys = r_jwks.json().get("keys", [])
                print(f"  [PASS] JWKS Endpoint:          ACTIVE ({jwks_latency:.0f}ms) -- {len(keys)} public signing key(s)")
                results["jwks_service"] = f"ACTIVE ({len(keys)} keys)"
            else:
                print(f"  [FAIL] JWKS Endpoint:          HTTP {r_jwks.status_code}")
                results["jwks_service"] = f"HTTP {r_jwks.status_code}"
        except Exception as e:
            print(f"  [FAIL] JWKS Endpoint:          ERROR ({e})")
            results["jwks_service"] = f"ERROR: {e}"

    # 3. Transaction Pooler Connection (Port 6543)
    print(f"\n[3] PostgreSQL Database Connectivity:")
    if db_url:
        norm_db_url = normalize_postgres_url(db_url)
        t0 = time.perf_counter()
        try:
            with psycopg.connect(norm_db_url, connect_timeout=8, row_factory=dict_row) as conn:
                pooler_latency = (time.perf_counter() - t0) * 1000
                with conn.cursor() as cur:
                    cur.execute("SELECT version(), current_database(), current_user;")
                    row = cur.fetchone()
                    print(f"  [PASS] Transaction Pooler (port 6543): CONNECTED ({pooler_latency:.0f}ms)")
                    print(f"    - Database: {row['current_database']}, User: {row['current_user']}")
                    print(f"    - Engine:   {row['version'][:55]}...")
                    results["pooler_6543"] = "CONNECTED"
        except Exception as e:
            print(f"  [FAIL] Transaction Pooler (port 6543): FAILED -- {e}")
            results["pooler_6543"] = f"FAILED: {e}"
    else:
        print("  - Transaction Pooler: Skipped (DATABASE_URL not set)")

    # 4. Session Mode Pooler Connection (Port 5432)
    target_direct_url = direct_url or db_url
    if target_direct_url:
        norm_direct_url = normalize_postgres_url(target_direct_url)
        # Ensure port 5432 is used for session mode
        if ":6543" in norm_direct_url:
            norm_direct_url = norm_direct_url.replace(":6543", ":5432")
        t0 = time.perf_counter()
        try:
            with psycopg.connect(norm_direct_url, connect_timeout=8, row_factory=dict_row) as conn:
                session_latency = (time.perf_counter() - t0) * 1000
                with conn.cursor() as cur:
                    cur.execute("SELECT version(), current_database();")
                    row = cur.fetchone()
                    print(f"  [PASS] Session Pooler (port 5432):     CONNECTED ({session_latency:.0f}ms)")
                    results["pooler_5432"] = "CONNECTED"

                    # 5. Check pgvector Extension Availability
                    cur.execute(
                        "SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector';"
                    )
                    vec_row = cur.fetchone()
                    if vec_row:
                        print(f"  [PASS] pgvector Extension:            AVAILABLE in PostgreSQL (version {vec_row['default_version']})")
                        results["pgvector"] = f"AVAILABLE (v{vec_row['default_version']})"
                    else:
                        print("  [FAIL] pgvector Extension:            NOT FOUND in available extensions")
                        results["pgvector"] = "NOT FOUND"

                    # 6. Check existing tables in public schema
                    cur.execute(
                        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
                    )
                    tables = [r["table_name"] for r in cur.fetchall()]
                    print(f"\n[4] Database Schema Status:")
                    if tables:
                        print(f"  [PASS] Existing Public Tables ({len(tables)}): {', '.join(tables)}")
                        results["tables"] = tables
                    else:
                        print("  [INFO] Public Tables: None yet (database is fresh and ready for Syllora migration)")
                        results["tables"] = []
        except Exception as e:
            print(f"  [FAIL] Session Pooler (port 5432): FAILED -- {e}")
            results["pooler_5432"] = f"FAILED: {e}"

    # 7. Syllora PostgresAdapter Integration Test
    print(f"\n[5] Syllora Application Adapter Compatibility:")
    try:
        adapter = PostgresAdapter(db_url, connect_timeout=8)
        with adapter._connect() as conn:
            with conn.cursor() as cur:
                adapter._set_auth_context(cur, "64f9e277-f9da-5769-a309-7e2f80ffc698")
                cur.execute("SELECT 1 AS ok;")
                row = cur.fetchone()
                if row and row["ok"] == 1:
                    print("  [PASS] PostgresAdapter: AUTH CONTEXT & QUERY READY")
                    results["app_adapter"] = "READY"
    except Exception as e:
        print(f"  [FAIL] PostgresAdapter: FAILED -- {e}")
        results["app_adapter"] = f"FAILED: {e}"

    print("\n" + "=" * 70)
    all_ok = (
        results.get("auth_service") == "HEALTHY"
        and results.get("pooler_6543") == "CONNECTED"
        and results.get("pooler_5432") == "CONNECTED"
        and "AVAILABLE" in str(results.get("pgvector"))
        and results.get("app_adapter") == "READY"
    )
    if all_ok:
        print("  OVERALL SUPABASE HEALTH: 100% OPERATIONAL & CONNECTED")
    else:
        print("  OVERALL SUPABASE HEALTH: PARTIAL ISSUES DETECTED")
    print("=" * 70 + "\n")
    return results


if __name__ == "__main__":
    run_health_check()
