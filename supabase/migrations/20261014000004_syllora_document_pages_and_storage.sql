-- ============================================================================
-- SYLLORA MIGRATION: 20261014000004_syllora_document_pages_and_storage.sql
-- ============================================================================
-- 1. Add mime_type to public.study_documents
-- 2. Expand index_status check constraint to support explicit lifecycle states:
--    ('pending', 'queued', 'uploading', 'processing', 'indexed', 'completed', 'failed')
-- 3. Create public.document_pages table for page-level text extraction and metadata
-- 4. Ensure metadata column exists on public.document_chunks
-- 5. Enable Row Level Security (RLS) on document_pages with authenticated tenant isolation
-- ============================================================================

-- 1. Add mime_type column to study_documents if not already present
ALTER TABLE public.study_documents 
ADD COLUMN IF NOT EXISTS mime_type text NOT NULL DEFAULT 'application/pdf';

-- 2. Expand index_status check constraint
DO $$
BEGIN
    -- Drop existing index_status check constraint if exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'study_documents_index_status_check' 
          AND conrelid = 'public.study_documents'::regclass
    ) THEN
        ALTER TABLE public.study_documents 
        DROP CONSTRAINT study_documents_index_status_check;
    END IF;

    -- Add updated constraint allowing all explicit lifecycle states
    ALTER TABLE public.study_documents 
    ADD CONSTRAINT study_documents_index_status_check 
    CHECK (index_status IN ('pending', 'queued', 'uploading', 'processing', 'indexed', 'completed', 'failed'));
END $$;

-- 3. Create document_pages table
CREATE TABLE IF NOT EXISTS public.document_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    document_id uuid NOT NULL,
    page_number integer NOT NULL CHECK (page_number >= 1),
    extracted_text text NOT NULL DEFAULT '',
    page_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, page_number),
    UNIQUE (id, user_id),
    FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id, user_id) 
        REFERENCES public.study_documents(id, user_id) ON DELETE CASCADE
);

-- Index for fast user/document lookups
CREATE INDEX IF NOT EXISTS idx_document_pages_user_doc 
ON public.document_pages(user_id, document_id, page_number);

-- 4. Ensure metadata jsonb exists on document_chunks
ALTER TABLE public.document_chunks 
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. Enable Row Level Security (RLS) on document_pages
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist to remain idempotent
DROP POLICY IF EXISTS "document_pages_owner_select" ON public.document_pages;
DROP POLICY IF EXISTS "document_pages_owner_insert" ON public.document_pages;
DROP POLICY IF EXISTS "document_pages_owner_update" ON public.document_pages;
DROP POLICY IF EXISTS "document_pages_owner_delete" ON public.document_pages;

-- Recreate policies with strict tenant isolation
CREATE POLICY "document_pages_owner_select" ON public.document_pages
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "document_pages_owner_insert" ON public.document_pages
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "document_pages_owner_update" ON public.document_pages
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "document_pages_owner_delete" ON public.document_pages
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);
