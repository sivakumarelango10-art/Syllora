-- ============================================================================
-- SYLLORA AUTH PROFILE SYNCHRONIZATION & PHONE STORAGE MIGRATION
-- Migration: 20261014000003_syllora_auth_profile_sync.sql
-- Description:
--   1. Idempotently adds optional phone_number column to public.profiles.
--   2. Installs on_auth_user_created trigger on auth.users to automatically
--      sync display_name (from full_name, name, or email), phone_number,
--      and avatar_path from Supabase Auth (Google OAuth & email signups).
--   3. Idempotently backfills missing profiles for existing auth.users.
-- Rollback:
--   - DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   - DROP FUNCTION IF EXISTS public.handle_new_auth_user();
--   - ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone_number;
-- ============================================================================

-- 1. Add optional phone_number column if not present
alter table public.profiles
  add column if not exists phone_number text;

-- 2. Create or replace profile synchronization function
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_meta jsonb;
  resolved_name text;
  resolved_phone text;
  resolved_avatar text;
begin
  raw_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- Extract full name from Google OAuth metadata (full_name, name) or email sign up metadata
  resolved_name := coalesce(
    nullif(trim(raw_meta->>'full_name'), ''),
    nullif(trim(raw_meta->>'name'), ''),
    nullif(trim(new.raw_app_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, 'Student'), '@', 1)
  );

  -- Extract optional phone number from user metadata or auth.users phone
  resolved_phone := coalesce(
    nullif(trim(raw_meta->>'phone_number'), ''),
    nullif(trim(new.phone), '')
  );

  -- Extract avatar if provided (e.g. Google avatar_url or picture)
  resolved_avatar := coalesce(
    nullif(trim(raw_meta->>'avatar_url'), ''),
    nullif(trim(raw_meta->>'picture'), '')
  );

  -- Upsert into public.profiles idempotently without overwriting user updates
  insert into public.profiles (user_id, display_name, phone_number, avatar_path, created_at, updated_at)
  values (new.id, resolved_name, resolved_phone, resolved_avatar, now(), now())
  on conflict (user_id) do update
  set
    display_name = case
      when public.profiles.display_name = '' or public.profiles.display_name is null then excluded.display_name
      else public.profiles.display_name
    end,
    phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
    avatar_path = coalesce(public.profiles.avatar_path, excluded.avatar_path),
    updated_at = now();

  return new;
end;
$$;

-- 3. Idempotently attach trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4. Backfill public.profiles for any existing auth.users without a profile
insert into public.profiles (user_id, display_name, phone_number, avatar_path, created_at, updated_at)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    split_part(coalesce(u.email, 'Student'), '@', 1)
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'phone_number'), ''),
    nullif(trim(u.phone), '')
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(u.raw_user_meta_data->>'picture'), '')
  ),
  now(),
  now()
from auth.users u
where not exists (
  select 1 from public.profiles p where p.user_id = u.id
)
on conflict (user_id) do nothing;
