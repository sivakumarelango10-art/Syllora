-- Syllora database foundation for Supabase Local and hosted Supabase.
-- Requires Supabase (Postgres, auth.users, storage schemas).
-- Applies schema changes only to the connected database. Inspect target before applying.

create extension if not exists vector with schema extensions;

create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default '',
    avatar_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.courses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    code text not null default '',
    title text not null,
    description text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);
create index if not exists idx_courses_user on public.courses(user_id);

create table if not exists public.study_documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid,
    filename text not null,
    title text not null,
    storage_path text not null,
    sha256 text not null,
    size_bytes bigint not null check (size_bytes >= 0),
    page_count integer not null default 0 check (page_count >= 0),
    chunk_count integer not null default 0 check (chunk_count >= 0),
    index_status text not null default 'pending'
        check (index_status in ('pending','processing','indexed','failed')),
    index_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, sha256),
    unique (id, user_id),
    foreign key (course_id, user_id) references public.courses(id, user_id) on delete set null (course_id)
);
create index if not exists idx_study_documents_user_created on public.study_documents(user_id, created_at desc);
create index if not exists idx_study_documents_course on public.study_documents(user_id, course_id);

create table if not exists public.document_chunks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    document_id uuid not null,
    page_number integer not null check (page_number >= 1),
    chunk_index integer not null check (chunk_index >= 0),
    content text not null,
    embedding extensions.vector(768),
    embedding_model text not null default 'nomic-embed-text',
    created_at timestamptz not null default now(),
    unique (document_id, page_number, chunk_index),
    unique (id, user_id),
    foreign key (document_id, user_id) references public.study_documents(id, user_id) on delete cascade
);
create index if not exists idx_document_chunks_user_doc on public.document_chunks(user_id, document_id);
create index if not exists idx_document_chunks_embed_model on public.document_chunks(embedding_model);
-- For larger corpora, HNSW provides approximate nearest-neighbor search.
create index if not exists idx_document_chunks_cosine
    on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops)
    where embedding is not null;

create table if not exists public.syllabus_topics (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid not null,
    parent_topic_id uuid,
    title text not null,
    description text not null default '',
    sort_order integer not null default 0,
    mastery_score numeric(4,3) check (mastery_score between 0 and 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id),
    foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade,
    foreign key (parent_topic_id, user_id) references public.syllabus_topics(id, user_id) on delete set null (parent_topic_id)
);
create index if not exists idx_topics_user_course on public.syllabus_topics(user_id, course_id);

create table if not exists public.topic_evidence (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    topic_id uuid not null,
    chunk_id uuid not null,
    similarity real not null check (similarity between -1 and 1),
    created_at timestamptz not null default now(),
    unique (topic_id, chunk_id),
    foreign key (topic_id, user_id) references public.syllabus_topics(id, user_id) on delete cascade,
    foreign key (chunk_id, user_id) references public.document_chunks(id, user_id) on delete cascade
);
create index if not exists idx_topic_evidence_user on public.topic_evidence(user_id, topic_id);

create table if not exists public.chat_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    course_id uuid,
    title text not null default 'New conversation',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id),
    foreign key (course_id, user_id) references public.courses(id, user_id) on delete set null (course_id)
);
create index if not exists idx_chat_sessions_user on public.chat_sessions(user_id, updated_at desc);

create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    session_id uuid not null,
    role text not null check (role in ('user','assistant')),
    content text not null,
    model text,
    evidence_status text check (evidence_status in ('answered','insufficient_evidence','partial')),
    created_at timestamptz not null default now(),
    unique (id, user_id),
    foreign key (session_id, user_id) references public.chat_sessions(id, user_id) on delete cascade
);
create index if not exists idx_chat_messages_session on public.chat_messages(user_id, session_id, created_at);

create table if not exists public.answer_citations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    message_id uuid not null,
    chunk_id uuid not null,
    source_label text not null,
    created_at timestamptz not null default now(),
    unique (message_id, chunk_id),
    foreign key (message_id, user_id) references public.chat_messages(id, user_id) on delete cascade,
    foreign key (chunk_id, user_id) references public.document_chunks(id, user_id) on delete cascade
);

create table if not exists public.understanding_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    topic_id uuid not null,
    explanation text not null,
    score integer check (score between 1 and 3),
    rubric jsonb not null default '{}'::jsonb,
    feedback text not null default '',
    model text,
    created_at timestamptz not null default now(),
    unique (id, user_id),
    foreign key (topic_id, user_id) references public.syllabus_topics(id, user_id) on delete cascade
);
create index if not exists idx_understanding_user_topic on public.understanding_attempts(user_id, topic_id, created_at desc);

create table if not exists public.misconceptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    topic_id uuid not null,
    attempt_id uuid,
    student_quote text not null default '',
    explanation text not null,
    corrected_explanation text not null default '',
    status text not null default 'open' check (status in ('open','in_progress','resolved')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    unique (id, user_id),
    foreign key (topic_id, user_id) references public.syllabus_topics(id, user_id) on delete cascade,
    foreign key (attempt_id, user_id) references public.understanding_attempts(id, user_id) on delete set null (attempt_id)
);
create index if not exists idx_misconceptions_user_status on public.misconceptions(user_id, status);

create table if not exists public.revision_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    topic_id uuid not null,
    misconception_id uuid,
    due_at timestamptz not null,
    priority integer not null default 3 check (priority between 1 and 5),
    status text not null default 'scheduled' check (status in ('scheduled','completed','skipped')),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    foreign key (topic_id, user_id) references public.syllabus_topics(id, user_id) on delete cascade,
    foreign key (misconception_id, user_id) references public.misconceptions(id, user_id) on delete set null (misconception_id)
);
create index if not exists idx_revision_user_due on public.revision_tasks(user_id, status, due_at);

create table if not exists public.study_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    daily_study_minutes integer not null default 45 check (daily_study_minutes between 0 and 1440),
    exam_date date,
    preferences jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- All user-owned tables are protected by Row Level Security.
-- A real authenticated Supabase session is mandatory for owner-scoped reads/writes.
do $$
declare t text;
begin
    foreach t in array array[
        'profiles','courses','study_documents','document_chunks','syllabus_topics',
        'topic_evidence','chat_sessions','chat_messages','answer_citations',
        'understanding_attempts','misconceptions','revision_tasks','study_preferences'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_owner', t);
        execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_owner', t);
        execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_owner', t);
        execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_owner', t);
    end loop;
end $$;

-- Least-privilege grants for authenticated users; RLS policies govern row-level access
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Ensure unauthenticated/anonymous users have zero access to Syllora tables or sequences
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Supabase Storage keeps raw PDFs private. Path format: <auth.uid()>/<document_uuid>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllora-study-pdfs', 'syllora-study-pdfs', false, 20971520, array['application/pdf']::text[])
on conflict (id) do nothing;

drop policy if exists syllora_pdf_read on storage.objects;
create policy syllora_pdf_read on storage.objects for select to authenticated
using (bucket_id = 'syllora-study-pdfs' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists syllora_pdf_insert on storage.objects;
create policy syllora_pdf_insert on storage.objects for insert to authenticated
with check (bucket_id = 'syllora-study-pdfs' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists syllora_pdf_update on storage.objects;
create policy syllora_pdf_update on storage.objects for update to authenticated
using (bucket_id = 'syllora-study-pdfs' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'syllora-study-pdfs' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists syllora_pdf_delete on storage.objects;
create policy syllora_pdf_delete on storage.objects for delete to authenticated
using (bucket_id = 'syllora-study-pdfs' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- SECURITY INVOKER ensures RLS applies to retrieval; do not use SECURITY DEFINER here.
create or replace function public.match_document_chunks(
    query_embedding extensions.vector(768),
    match_count integer default 5,
    course_filter uuid default null,
    document_filter uuid[] default null
)
returns table (
    chunk_id uuid,
    document_id uuid,
    page_number integer,
    chunk_index integer,
    content text,
    filename text,
    title text,
    similarity double precision
)
language sql stable security invoker set search_path = public, extensions
as $$
    select c.id, c.document_id, c.page_number, c.chunk_index, c.content,
           d.filename, d.title, 1 - (c.embedding <=> query_embedding) as similarity
    from public.document_chunks c
    join public.study_documents d on d.id = c.document_id and d.user_id = c.user_id
    where c.user_id = (select auth.uid())
      and c.embedding is not null
      and (course_filter is null or d.course_id = course_filter)
      and (document_filter is null or c.document_id = any(document_filter))
    order by c.embedding <=> query_embedding
    limit least(greatest(match_count, 1), 20)
$$;
revoke all on function public.match_document_chunks(extensions.vector, integer, uuid, uuid[]) from public;
grant execute on function public.match_document_chunks(extensions.vector, integer, uuid, uuid[]) to authenticated;
