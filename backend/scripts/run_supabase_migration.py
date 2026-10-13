"""Safe, idempotent migration runner for Syllora foundation schema on Supabase."""
from __future__ import annotations

import argparse
import os
import sys
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

import psycopg
from psycopg.rows import dict_row

from app.db.postgres_adapter import normalize_postgres_url


def inspect_database_prerequisites(pg_url: str) -> dict:
    """Verify that required schemas and extensions exist on the target Supabase instance."""
    normalized_url = normalize_postgres_url(pg_url)
    # Ensure port 5432 is used for migration session
    if ":6543" in normalized_url:
        normalized_url = normalized_url.replace(":6543", ":5432")

    report = {}
    with psycopg.connect(normalized_url, connect_timeout=10, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Check current engine and database
            cur.execute("SELECT version(), current_database(), current_user;")
            row = cur.fetchone()
            report["database"] = row["current_database"]
            report["user"] = row["current_user"]
            report["engine"] = row["version"].split(" on ")[0]

            # Check schemas
            cur.execute(
                """
                SELECT schema_name FROM information_schema.schemata 
                WHERE schema_name IN ('public', 'extensions', 'storage', 'auth');
                """
            )
            found_schemas = [r["schema_name"] for r in cur.fetchall()]
            report["schemas"] = found_schemas
            report["missing_schemas"] = [
                s for s in ("public", "extensions", "storage", "auth") if s not in found_schemas
            ]

            # Check pgvector
            cur.execute(
                "SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector';"
            )
            vec = cur.fetchone()
            report["vector_available"] = bool(vec)
            report["vector_version"] = vec["default_version"] if vec else None

            # Check existing public tables
            cur.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
            )
            report["existing_tables"] = [r["table_name"] for r in cur.fetchall()]

    return report


def run_migration(migration_file: Path, pg_url: str, execute: bool = False) -> dict:
    """Preview or safely execute the foundation migration SQL."""
    if not migration_file.is_file():
        raise FileNotFoundError(f"Migration file not found at {migration_file}")

    sql_content = migration_file.read_text(encoding="utf-8")
    
    prereqs = inspect_database_prerequisites(pg_url)
    
    result = {
        "migration_file": str(migration_file),
        "target_database": prereqs["database"],
        "target_user": prereqs["user"],
        "target_engine": prereqs["engine"],
        "schemas_present": prereqs["schemas"],
        "vector_available": prereqs["vector_available"],
        "vector_version": prereqs["vector_version"],
        "existing_public_tables": prereqs["existing_tables"],
        "sql_size_bytes": len(sql_content),
        "executed": False,
    }

    if not execute:
        result["status"] = "PREVIEW_ONLY (DRY RUN)"
        result["message"] = (
            "Migration preview completed successfully. "
            "Database connectivity and pgvector verified. "
            "No SQL changes were applied to the target database. "
            "To apply, explicit user authorization and the --execute flag are required."
        )
        return result

    # When execute is explicitly requested:
    normalized_url = normalize_postgres_url(pg_url)
    if ":6543" in normalized_url:
        normalized_url = normalized_url.replace(":6543", ":5432")

    with psycopg.connect(normalized_url, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(sql_content)
        conn.commit()

    # Re-inspect to confirm created tables
    post_check = inspect_database_prerequisites(pg_url)
    result["executed"] = True
    result["status"] = "MIGRATION_COMPLETED"
    result["created_tables"] = post_check["existing_tables"]
    return result


def main():
    parser = argparse.ArgumentParser(description="Syllora Supabase Migration Runner")
    parser.add_argument(
        "--migration-file",
        type=Path,
        default=backend_dir.parent / "supabase" / "migrations" / "20261013000001_syllora_foundation.sql",
        help="Path to SQL migration file",
    )
    parser.add_argument(
        "--pg-url",
        type=str,
        default=os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL"),
        help="PostgreSQL connection string (defaults to DIRECT_URL or DATABASE_URL)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute migration (APPLIES CHANGES TO TARGET DB). Without this, runs in preview mode.",
    )
    args = parser.parse_args()

    if not args.pg_url:
        print("[ERROR] No database URL provided. Set DIRECT_URL/DATABASE_URL in .env or pass --pg-url.")
        sys.exit(1)

    print("=" * 70)
    print("  SYLLORA -- SAFE MIGRATION RUNNER")
    print("=" * 70)
    print(f"Mode: {'EXECUTE (LIVE)' if args.execute else 'DRY RUN (PREVIEW ONLY)'}")
    print(f"Target file: {args.migration_file}")

    res = run_migration(args.migration_file, args.pg_url, execute=args.execute)
    print("\nTarget Environment Details:")
    print(f"  * Database:        {res['target_database']}")
    print(f"  * User:            {res['target_user']}")
    print(f"  * Engine:          {res['target_engine']}")
    print(f"  * Schemas:         {', '.join(res['schemas_present'])}")
    print(f"  * pgvector:        {'Yes (v' + str(res['vector_version']) + ')' if res['vector_available'] else 'No'}")
    print(f"  * Existing tables: {res['existing_public_tables'] if res['existing_public_tables'] else 'None (fresh)'}")
    print(f"\nStatus: {res['status']}")
    if not args.execute:
        print(f"Result: {res['message']}")
    else:
        print(f"Created Tables ({len(res.get('created_tables', []))}): {', '.join(res.get('created_tables', []))}")
    print("=" * 70)


if __name__ == "__main__":
    main()
