-- Syllora database foundation rollback script.
-- Safely removes Syllora Phase 3 tables, functions, and storage policies in reverse order.
-- Does not drop extensions, schemas, or auth.users.

-- 1. Drop function
drop function if exists public.match_document_chunks(extensions.vector, integer, uuid, uuid[]);

-- 2. Drop storage policies
drop policy if exists syllora_pdf_read on storage.objects;
drop policy if exists syllora_pdf_insert on storage.objects;
drop policy if exists syllora_pdf_update on storage.objects;
drop policy if exists syllora_pdf_delete on storage.objects;

-- 3. Drop tables in reverse dependency order
drop table if exists public.study_preferences cascade;
drop table if exists public.revision_tasks cascade;
drop table if exists public.misconceptions cascade;
drop table if exists public.understanding_attempts cascade;
drop table if exists public.answer_citations cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_sessions cascade;
drop table if exists public.topic_evidence cascade;
drop table if exists public.syllabus_topics cascade;
drop table if exists public.document_chunks cascade;
drop table if exists public.study_documents cascade;
drop table if exists public.courses cascade;
drop table if exists public.profiles cascade;
