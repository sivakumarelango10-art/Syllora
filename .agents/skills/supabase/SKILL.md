---
name: supabase
description: Comprehensive agent skill and reference for Supabase PostgreSQL, pgvector 768-dim embeddings, Row Level Security (RLS), Storage buckets, and JWKS authentication in Syllora.
---

# Supabase Agent Skill for Syllora

This skill provides architectural guidelines, query patterns, and connection best practices for Supabase with PostgreSQL, pgvector, and Syllora's dual-database engine.

---

## 1. Project Reference & Topology

* **Project Ref**: `lgiarosqejiaejizrxdu`
* **API / REST Base**: `https://lgiarosqejiaejizrxdu.supabase.co`
* **JWKS Endpoint**: `https://lgiarosqejiaejizrxdu.supabase.co/auth/v1/.well-known/jwks.json`
* **Direct Database Host**: `db.lgiarosqejiaejizrxdu.supabase.co:5432`
* **Database Name**: `postgres`
* **Default Database User**: `postgres`

### Connection String Formats:
1. **Direct Session Connection** (for schema migrations, DDL, and admin tasks):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.lgiarosqejiaejizrxdu.supabase.co:5432/postgres
   ```
   Or via Session Pooler:
   ```
   postgresql://postgres.lgiarosqejiaejizrxdu:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
   ```
2. **Transaction Mode Pooler** (for FastAPI backend & Prisma client, IPv4-compatible):
   ```
   postgresql://postgres.lgiarosqejiaejizrxdu:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   *(Note: Percent-encode special characters in your password, e.g., `@` becomes `%40`, `#` becomes `%23`).*


---

## 2. Row Level Security (RLS) Rules

* Every user-owned table MUST have RLS enabled:
  ```sql
  alter table public.table_name enable row level security;
  ```
* Use `(select auth.uid()) = user_id` to prevent scalar subquery re-evaluations:
  ```sql
  create policy "owner_select" on public.table_name
      for select to authenticated
      using ((select auth.uid()) = user_id);
  ```
* NEVER use `security definer` on search or matching functions if they should respect user boundaries. Always use `security invoker`.

---

## 3. Vector Embeddings (pgvector) in Syllora

* **Model**: `nomic-embed-text`
* **Dimension**: Exactly `768` dimensions
* **PostgreSQL Extension**: `extensions.vector(768)`
* **Cosine Distance Operator**: `<=>` where `similarity = 1 - (embedding <=> query_vector)`
* **HNSW Indexing**:
  ```sql
  create index idx_document_chunks_cosine
      on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops)
      where embedding is not null;
  ```

---

## 4. Storage Security (Private PDFs)

* **Bucket**: `syllora-study-pdfs` (private, `public = false`).
* **Path Convention**: `<auth.uid()>/<document_uuid>.pdf`.
* **Access Rules**: Objects can only be read or written by users whose `auth.uid()::text` matches the first folder component:
  ```sql
  create policy syllora_pdf_read on storage.objects for select to authenticated
  using (bucket_id = 'syllora-study-pdfs' and (storage.foldername(name))[1] = (select auth.uid()::text));
  ```

---

## 5. Token Verification (JWKS)

* **Verification**: In FastAPI (`backend/app/auth.py`), tokens from `Authorization: Bearer <token>` are verified using public keys fetched from `https://lgiarosqejiaejizrxdu.supabase.co/auth/v1/.well-known/jwks.json`.
* **Claims**: The verified subject UUID is extracted from the `sub` claim.
* **Tenant Isolation**: Queries enforce `user_id = sub` to guarantee strict cross-user access denial.
