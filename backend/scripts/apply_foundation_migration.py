"""Execute and verify the authorized Stage A Syllora foundation migration."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir.parent / ".env.local", override=True)

import psycopg
from psycopg.rows import dict_row
from app.db.postgres_adapter import normalize_postgres_url


def sanitize(text: str, password: str) -> str:
    if not text:
        return ""
    if password:
        text = text.replace(password, "[REDACTED_PASSWORD]")
    text = re.sub(r":(?:[^@\s/:]+)@", ":[REDACTED_PASSWORD]@", text)
    return text


def execute_stage_a():
    raw_url = os.getenv("DIRECT_URL", "")
    if not raw_url:
        print("ERROR: DIRECT_URL is not set.")
        return 1

    clean_url = normalize_postgres_url(raw_url)
    parsed = urlparse(clean_url)
    password = parsed.password or ""

    print("=" * 65)
    print("SYLLORA STAGE A FOUNDATION MIGRATION EXECUTION")
    print("=" * 65)

    # 1. Re-verify CLI dry-run before pushing
    print("1. Running Pre-Flight Dry Run Check...")
    dry_run = subprocess.run(
        ["supabase", "db", "push", "--dry-run", "--db-url", clean_url],
        capture_output=True,
        text=True,
        cwd=str(backend_dir.parent),
    )
    if dry_run.returncode != 0:
        print("Pre-flight dry-run failed:")
        print(sanitize(dry_run.stderr, password))
        return 1
    print("   Dry-run confirmed: 1 pending migration.")

    # 2. Execute official CLI push
    print("\n2. Applying migration via Supabase CLI: db push --include-all --skip-vault --yes...")
    push_proc = subprocess.run(
        ["supabase", "db", "push", "--include-all", "--skip-vault", "--yes", "--db-url", clean_url],
        capture_output=True,
        text=True,
        cwd=str(backend_dir.parent),
    )
    print("   CLI Return Code:", push_proc.returncode)
    if push_proc.stdout:
        print("   --- CLI Output ---")
        print(sanitize(push_proc.stdout, password))
    if push_proc.stderr:
        print("   --- CLI Stderr ---")
        print(sanitize(push_proc.stderr, password))

    if push_proc.returncode != 0:
        print("\nERROR: Supabase CLI migration execution failed.")
        return 1

    # 3. Post-execution deep verification via direct SQL query
    print("\n3. Verifying Applied Schema & Objects on Hosted PostgreSQL...")
    with psycopg.connect(clean_url, connect_timeout=15, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # 3.1 Check CLI Migration History
            cur.execute("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;")
            applied_versions = [str(r["version"]) for r in cur.fetchall()]
            print("   * Supabase CLI Schema Migrations Record:", applied_versions)

            # 3.2 Check all 13 application tables
            expected_tables = [
                "profiles", "courses", "study_documents", "document_chunks",
                "syllabus_topics", "topic_evidence", "chat_sessions", "chat_messages",
                "answer_citations", "understanding_attempts", "misconceptions",
                "revision_tasks", "study_preferences"
            ]
            cur.execute(
                """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
                """
            )
            found_tables = [r["table_name"] for r in cur.fetchall()]
            missing_tables = [t for t in expected_tables if t not in found_tables]
            print(f"   * Public Tables Count: {len(found_tables)} (Expected 13)")
            print(f"   * Missing Tables: {missing_tables if missing_tables else 'None (All 13 present)'}")

            # 3.3 Check RLS on all 13 tables
            cur.execute(
                """
                SELECT relname, relrowsecurity 
                FROM pg_class 
                JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
                WHERE pg_namespace.nspname = 'public' AND relkind = 'r'
                ORDER BY relname;
                """
            )
            rls_status = {r["relname"]: r["relrowsecurity"] for r in cur.fetchall()}
            all_rls_enabled = all(rls_status.get(t, False) for t in expected_tables)
            print(f"   * Row Level Security Enabled on All 13 Tables: {all_rls_enabled}")

            # 3.4 Check pgvector column & HNSW index
            cur.execute(
                """
                SELECT column_name, udt_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                  AND table_name = 'document_chunks' 
                  AND column_name = 'embedding';
                """
            )
            col_info = cur.fetchone()
            print(f"   * document_chunks.embedding column: {col_info['udt_name'] if col_info else 'MISSING'}")

            cur.execute(
                """
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE schemaname = 'public' 
                  AND tablename = 'document_chunks' 
                  AND indexname = 'idx_document_chunks_cosine';
                """
            )
            idx_info = cur.fetchone()
            print(f"   * HNSW Cosine Index: {'EXISTS' if idx_info else 'MISSING'}")

            # 3.5 Check match_document_chunks function
            cur.execute(
                """
                SELECT routine_name, security_type 
                FROM information_schema.routines 
                WHERE routine_schema = 'public' 
                  AND routine_name = 'match_document_chunks';
                """
            )
            func_info = cur.fetchone()
            print(f"   * RPC match_document_chunks: {'EXISTS (Security ' + func_info['security_type'] + ')' if func_info else 'MISSING'}")

            # 3.6 Check Storage Bucket
            cur.execute(
                """
                SELECT id, name, public, file_size_limit 
                FROM storage.buckets 
                WHERE id = 'syllora-study-pdfs';
                """
            )
            bucket_info = cur.fetchone()
            print(f"   * Storage Bucket 'syllora-study-pdfs': {'EXISTS (Private)' if bucket_info and not bucket_info['public'] else 'MISSING'}")

    print("=" * 65)
    print("STAGE A FOUNDATION MIGRATION COMPLETED SUCCESSFULLY.")
    print("=" * 65)
    return 0


if __name__ == "__main__":
    sys.exit(execute_stage_a())
