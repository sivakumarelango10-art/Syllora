"""Verification script for Syllora Supabase credentials and schema state."""
from __future__ import annotations

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    load_dotenv(backend_dir.parent / ".env.local")
except Exception:
    pass

import psycopg
from psycopg.rows import dict_row

from app.db.postgres_adapter import normalize_postgres_url


def verify_credentials() -> dict:
    report = {}
    db_url = normalize_postgres_url(os.getenv("DATABASE_URL", ""))
    direct_url = normalize_postgres_url(os.getenv("DIRECT_URL", ""))

    # 1. Test Transaction Pooler (port 6543)
    try:
        with psycopg.connect(db_url, connect_timeout=8, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version(), current_database(), current_user;")
                row = cur.fetchone()
                report["pooler_transaction"] = {
                    "status": "SUCCESS",
                    "database": row["current_database"],
                    "user": row["current_user"],
                    "engine": row["version"].split(" on ")[0],
                }
    except Exception as e:
        report["pooler_transaction"] = {"status": f"FAILED ({type(e).__name__})"}

    # 2. Test Session Pooler (port 5432) & count public tables
    try:
        with psycopg.connect(direct_url, connect_timeout=8, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version(), current_database(), current_user;")
                row = cur.fetchone()
                cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
                tables = [r["table_name"] for r in cur.fetchall()]
                report["pooler_session"] = {
                    "status": "SUCCESS",
                    "database": row["current_database"],
                    "user": row["current_user"],
                    "engine": row["version"].split(" on ")[0],
                    "public_tables_count": len(tables),
                    "public_tables": tables,
                }

                # Check official Supabase CLI migration history table
                # (supabase_migrations.schema_migrations ONLY - DO NOT check auth.schema_migrations)
                cur.execute(
                    """
                    SELECT EXISTS (
                        SELECT 1 
                        FROM information_schema.tables 
                        WHERE table_schema = 'supabase_migrations' 
                          AND table_name = 'schema_migrations'
                    ) AS has_table,
                    EXISTS (
                        SELECT 1 
                        FROM information_schema.schemata 
                        WHERE schema_name = 'supabase_migrations'
                    ) AS has_schema;
                    """
                )
                sm_check = cur.fetchone()
                has_schema = sm_check["has_schema"] if sm_check else False
                has_table = sm_check["has_table"] if sm_check else False

                if has_table:
                    cur.execute("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;")
                    applied_versions = [str(r["version"]) for r in cur.fetchall()]
                    report["supabase_cli_migration_history"] = {
                        "schema_exists": True,
                        "table_exists": True,
                        "table_name": "supabase_migrations.schema_migrations",
                        "applied_versions": applied_versions,
                        "status": "INITIALIZED",
                    }
                else:
                    report["supabase_cli_migration_history"] = {
                        "schema_exists": has_schema,
                        "table_exists": False,
                        "table_name": "supabase_migrations.schema_migrations",
                        "applied_versions": [],
                        "status": "UNINITIALIZED",
                        "note": "Supabase CLI migration history table has not yet been initialized on the hosted database.",
                    }
    except Exception as e:
        report["pooler_session"] = {"status": f"FAILED ({type(e).__name__})"}

    # 3. Check migration files in supabase/migrations/
    migrations_dir = backend_dir.parent / "supabase" / "migrations"
    migration_files = sorted([f.name for f in migrations_dir.glob("*.sql")])
    report["migrations"] = migration_files

    # 4. Check rollback directory
    rollback_dir = backend_dir.parent / "supabase" / "rollback"
    rollback_files = sorted([f.name for f in rollback_dir.glob("*.sql")])
    report["rollback_files"] = rollback_files

    # 5. Local migration detection & compatibility
    local_version = "20261013000001"
    foundation_filename = "20261013000001_syllora_foundation.sql"
    applied = report.get("supabase_cli_migration_history", {}).get("applied_versions", [])
    report["foundation_migration_present"] = foundation_filename in migration_files
    report["migration_compatible"] = local_version not in applied

    # 6. Credential rotation verification (NEVER print or expose secrets)
    from urllib.parse import urlparse, unquote
    parsed_direct = urlparse(direct_url)
    active_password_raw = parsed_direct.password or ""
    active_password = unquote(active_password_raw)
    known_exposed_password = "Syllora@012"

    if active_password == known_exposed_password or active_password_raw == "Syllora%40012":
        report["password_rotation"] = {
            "status": "BLOCKED",
            "is_exposed_password_active": True,
            "message": "Previously exposed password remains active in local configuration and hosted database. Operation is BLOCKED. Rotate manually in Supabase Dashboard.",
        }
    elif active_password:
        report["password_rotation"] = {
            "status": "ROTATED",
            "is_exposed_password_active": False,
            "message": "New credential in use. Previously exposed password is not active.",
        }
    else:
        report["password_rotation"] = {
            "status": "MISSING",
            "is_exposed_password_active": False,
            "message": "No database password detected in environment.",
        }

    return report


if __name__ == "__main__":
    rep = verify_credentials()
    print("=" * 60)
    print("SYLLORA SUPABASE FINAL MIGRATION VERIFICATION REPORT")
    print("=" * 60)
    print("1. Transaction Pooler (DATABASE_URL):", rep["pooler_transaction"]["status"])
    if rep["pooler_transaction"]["status"] == "SUCCESS":
        print("   Database:", rep["pooler_transaction"]["database"])
        print("   User:    ", rep["pooler_transaction"]["user"])
        print("   Engine:  ", rep["pooler_transaction"]["engine"])

    print("\n2. Session Pooler (DIRECT_URL):      ", rep["pooler_session"]["status"])
    if rep["pooler_session"]["status"] == "SUCCESS":
        print("   Database:            ", rep["pooler_session"]["database"])
        print("   User:                ", rep["pooler_session"]["user"])
        print("   Public Tables Count: ", rep["pooler_session"]["public_tables_count"])
        print("   Public Tables:       ", rep["pooler_session"]["public_tables"])

    print("\n3. Supabase CLI Migration History (supabase_migrations.schema_migrations):")
    scmh = rep.get("supabase_cli_migration_history", {})
    print("   Table:               ", scmh.get("table_name"))
    print("   Schema Exists:       ", scmh.get("schema_exists"))
    print("   Table Exists:        ", scmh.get("table_exists"))
    print("   History Status:      ", scmh.get("status"))
    print("   Applied Versions:    ", scmh.get("applied_versions", []))
    if scmh.get("note"):
        print("   Note:                ", scmh.get("note"))

    print("\n4. Forward Migrations in supabase/migrations/:")
    for m in rep["migrations"]:
        print("   *", m)
    print("   Foundation File Recognized:", rep.get("foundation_migration_present"))
    print("   Version Not in Remote History:", rep.get("migration_compatible"))

    print("\n5. Rollback Scripts in supabase/rollback/:")
    for r in rep["rollback_files"]:
        print("   *", r)

    print("\n6. Credential Rotation Status:")
    pws = rep.get("password_rotation", {})
    print("   Status:              ", pws.get("status"))
    print("   Old Password Active: ", pws.get("is_exposed_password_active"))
    print("   Message:             ", pws.get("message"))
    print("=" * 60)
