-- ============================================================================
-- SYLLORA PHASE 6: RESEARCH FEATURES SCHEMA EXTENSION (F1 - F14)
-- ============================================================================
-- Prepared forward-only migration.
-- STATUS: PREPARED LOCALLY (NOT APPLIED TO HOSTED DATABASE WITHOUT EXPLICIT APPROVAL).
-- Respects Section 1.3: preserves all existing 13 foundation tables and adds
-- non-destructive extensions for Exam Intelligence, Proof Mode, Answer Evaluations,
-- Figure Assets, Source Conflicts, Viva Sessions, and Faculty Portal.
-- ============================================================================

-- 1. EXAM PAPERS (F1: Past-Paper Intelligence)
create table if not exists public.exam_papers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid references public.courses(id) on delete set null,
    title text not null,
    filename text not null,
    storage_path text not null,
    exam_year integer not null check (exam_year between 1990 and 2100),
    semester text not null default 'Spring',
    exam_type text not null default 'End-Semester' check (exam_type in ('Internal', 'Mid-Semester', 'End-Semester', 'Supplementary', 'Model')),
    page_count integer not null default 1 check (page_count >= 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_exam_papers_user_course on public.exam_papers(user_id, course_id);
create index if not exists idx_exam_papers_year on public.exam_papers(user_id, exam_year desc);

-- 2. EXAM QUESTIONS (F1: Structured PYQ Questions & Repetition Analytics)
create table if not exists public.exam_questions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    exam_paper_id uuid not null,
    question_number text not null default '1',
    question_text text not null,
    marks integer not null default 5 check (marks between 1 and 100),
    unit_number integer check (unit_number between 1 and 20),
    topic_hint text not null default '',
    repetition_group_id text,
    repeat_count integer not null default 1 check (repeat_count >= 1),
    extraction_confidence real not null default 0.95 check (extraction_confidence between 0 and 1),
    evidence_status text not null default 'pending' check (evidence_status in ('pending', 'supported', 'partial', 'unsupported')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id),
    foreign key (exam_paper_id, user_id) references public.exam_papers(id, user_id) on delete cascade
);
create index if not exists idx_exam_questions_user_paper on public.exam_questions(user_id, exam_paper_id);
create index if not exists idx_exam_questions_unit on public.exam_questions(user_id, unit_number);
create index if not exists idx_exam_questions_repeat on public.exam_questions(user_id, repetition_group_id);

-- 3. EXAM QUESTION EVIDENCE (F1: Question-to-Notes Page Links)
create table if not exists public.exam_question_evidence (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    question_id uuid not null,
    chunk_id uuid not null,
    similarity real not null check (similarity between -1 and 1),
    created_at timestamptz not null default now(),
    unique (question_id, chunk_id),
    foreign key (question_id, user_id) references public.exam_questions(id, user_id) on delete cascade,
    foreign key (chunk_id, user_id) references public.document_chunks(id, user_id) on delete cascade
);
create index if not exists idx_exam_q_evidence_user on public.exam_question_evidence(user_id, question_id);

-- 4. ANSWER EVALUATIONS (F3: Source-Grounded Answer Evaluator & F5 Try-First)
create table if not exists public.answer_evaluations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    question_id uuid,
    topic_id uuid references public.syllabus_topics(id) on delete set null,
    question_text text not null,
    student_answer text not null,
    marks_allocated integer not null default 5,
    score_awarded numeric(4,2) not null default 0 check (score_awarded >= 0),
    percentage numeric(5,2) not null default 0 check (percentage between 0 and 100),
    rubric_breakdown jsonb not null default '{}'::jsonb,
    covered_points jsonb not null default '[]'::jsonb,
    missing_points jsonb not null default '[]'::jsonb,
    inaccuracies jsonb not null default '[]'::jsonb,
    feedback text not null default '',
    created_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_answer_evals_user on public.answer_evaluations(user_id, created_at desc);

-- 5. CLAIM VERIFICATIONS (F4: Proof Mode)
create table if not exists public.claim_verifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    message_id uuid references public.chat_messages(id) on delete set null,
    claim_text text not null,
    status text not null check (status in ('supported', 'partially_supported', 'unsupported')),
    source_id text not null default 'S1',
    document_id uuid,
    page_number integer,
    evidence_quote text not null default '',
    confidence real not null default 0.9 check (confidence between 0 and 1),
    created_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_claim_verif_user on public.claim_verifications(user_id, message_id);

-- 6. FIGURE ASSETS (F11: Diagram Retrieval)
create table if not exists public.figure_assets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    document_id uuid not null,
    page_number integer not null check (page_number >= 1),
    caption text not null default '',
    storage_path text not null,
    relevance_tags text not null default '',
    created_at timestamptz not null default now(),
    unique (id, user_id),
    foreign key (document_id, user_id) references public.study_documents(id, user_id) on delete cascade
);
create index if not exists idx_figure_assets_user_doc on public.figure_assets(user_id, document_id);

-- 7. SOURCE CONFLICTS (F12: Source Conflict Detector)
create table if not exists public.source_conflicts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid references public.courses(id) on delete set null,
    concept_title text not null,
    doc_a_id uuid not null,
    doc_a_page integer not null,
    doc_a_quote text not null,
    doc_b_id uuid not null,
    doc_b_page integer not null,
    doc_b_quote text not null,
    explanation text not null default '',
    status text not null default 'detected' check (status in ('detected', 'reviewed', 'dismissed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_source_conflicts_user on public.source_conflicts(user_id, course_id, status);

-- 8. VIVA SESSIONS (F13: Viva Simulator)
create table if not exists public.viva_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid references public.courses(id) on delete set null,
    topic_id uuid references public.syllabus_topics(id) on delete set null,
    topic_title text not null,
    status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
    transcript jsonb not null default '[]'::jsonb,
    overall_score numeric(4,2) default 0,
    feedback text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_viva_sessions_user on public.viva_sessions(user_id, created_at desc);

-- 9. FACULTY QUESTIONS & BLUEPRINTS (F14: Faculty Mode)
create table if not exists public.faculty_questions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid references public.courses(id) on delete cascade,
    question_text text not null,
    marks integer not null default 5 check (marks between 1 and 100),
    unit_number integer not null default 1,
    bloom_level text not null default 'Understand' check (bloom_level in ('Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create')),
    difficulty text not null default 'Medium' check (difficulty in ('Easy', 'Medium', 'Hard')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_faculty_q_course on public.faculty_questions(user_id, course_id, unit_number);

-- 10. ROW LEVEL SECURITY POLICIES FOR NEW ENTITIES
do $$
declare t text;
begin
    foreach t in array array[
        'exam_papers', 'exam_questions', 'exam_question_evidence',
        'answer_evaluations', 'claim_verifications', 'figure_assets',
        'source_conflicts', 'viva_sessions', 'faculty_questions'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_owner', t);
        execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_owner', t);
        execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_owner', t);
        execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_owner', t);
    end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
