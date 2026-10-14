-- Add durable retry scheduling to the existing owner-scoped study document rows.
-- Apply only after reviewing the target Supabase project and migration policy.

ALTER TABLE public.study_documents
    ADD COLUMN IF NOT EXISTS index_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.study_documents
    DROP CONSTRAINT IF EXISTS study_documents_index_attempts_check;

ALTER TABLE public.study_documents
    ADD CONSTRAINT study_documents_index_attempts_check
    CHECK (index_attempts >= 0);

CREATE INDEX IF NOT EXISTS idx_study_documents_pending_index
    ON public.study_documents(next_attempt_at, created_at)
    WHERE index_status IN ('pending', 'processing');
