"""Secure runner for official Supabase CLI inspection and dry-run commands."""
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
root_env = backend_dir.parent / ".env"
if root_env.is_file():
    load_dotenv(root_env, override=False)
else:
    load_dotenv(backend_dir.parent / ".env.local", override=False)
    load_dotenv(backend_dir / ".env", override=False)

from app.db.postgres_adapter import normalize_postgres_url


def sanitize(text: str, password: str) -> str:
    if not text:
        return ""
    if password:
        text = text.replace(password, "[REDACTED_PASSWORD]")
    # Redact any remaining postgresql://...:password@
    text = re.sub(r":(?:[^@\s/:]+)@", ":[REDACTED_PASSWORD]@", text)
    return text


def run_cli_checks():
    raw_url = os.getenv("DIRECT_URL", "")
    if not raw_url:
        print("ERROR: DIRECT_URL is not set.")
        return 1

    clean_url = normalize_postgres_url(raw_url)
    parsed = urlparse(clean_url)
    password = parsed.password or ""

    print("=" * 60)
    print("OFFICIAL SUPABASE CLI VERIFICATION & DRY-RUN")
    print("=" * 60)

    # 1. CLI Version
    try:
        ver_proc = subprocess.run(["supabase", "--version"], capture_output=True, text=True, check=True)
        print("1. Supabase CLI Version:", ver_proc.stdout.strip())
    except Exception as e:
        print("1. Supabase CLI Version Error:", e)
        return 1

    # 2. Inspect local migration directory
    migrations_dir = backend_dir.parent / "supabase" / "migrations"
    migration_files = sorted([f.name for f in migrations_dir.glob("*.sql")])
    print("\n2. Local Forward Migrations (supabase/migrations/):")
    for f in migration_files:
        print("   *", f)

    rollback_dir = backend_dir.parent / "supabase" / "rollback"
    rollback_files = sorted([f.name for f in rollback_dir.glob("*.sql")])
    print("\n3. Isolated Rollback Files (supabase/rollback/):")
    for r in rollback_files:
        print("   *", r)

    # 4. Run `supabase migration list --db-url`
    print("\n4. Running: supabase migration list --db-url [REMOTE_SESSION_POOLER]")
    try:
        list_proc = subprocess.run(
            ["supabase", "migration", "list", "--db-url", clean_url],
            capture_output=True,
            text=True,
            cwd=str(backend_dir.parent)
        )
        print("   Return Code:", list_proc.returncode)
        if list_proc.stdout:
            print("   --- Output ---")
            print(sanitize(list_proc.stdout, password))
        if list_proc.stderr:
            print("   --- Stderr ---")
            print(sanitize(list_proc.stderr, password))
    except Exception as e:
        print("   Execution Error:", e)

    # 5. Run `supabase db push --dry-run --db-url`
    print("\n5. Running: supabase db push --dry-run --db-url [REMOTE_SESSION_POOLER]")
    try:
        push_proc = subprocess.run(
            ["supabase", "db", "push", "--dry-run", "--db-url", clean_url],
            capture_output=True,
            text=True,
            cwd=str(backend_dir.parent)
        )
        print("   Return Code:", push_proc.returncode)
        if push_proc.stdout:
            print("   --- Output ---")
            print(sanitize(push_proc.stdout, password))
        if push_proc.stderr:
            print("   --- Stderr ---")
            print(sanitize(push_proc.stderr, password))
    except Exception as e:
        print("   Execution Error:", e)

    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(run_cli_checks())
