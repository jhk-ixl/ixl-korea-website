-- =============================================
-- IXL KOREA COMMUNITY
-- Supabase schema v1: Discussion + Responses
-- Run once in Supabase SQL Editor.
-- =============================================

create extension if not exists pgcrypto;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'discussion',
  title text not null,
  body text not null,
  status text not null default 'active',
  promoted_knowledge_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_post_type_check
    check (post_type in ('discussion', 'blog', 'question', 'expert-insight', 'collaboration', 'event')),
  constraint community_posts_status_check
    check (status in ('active', 'archived', 'hidden'))
);

create index if not exists community_posts_type_status_created_idx
  on public.community_posts (post_type, status, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_comments_status_check
    check (status in ('active', 'archived', 'hidden'))
);

create index if not exists community_comments_post_created_idx
  on public.community_comments (post_id, created_at asc);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;

-- Signed-in Community members may read active posts.
drop policy if exists "community_posts_read_active" on public.community_posts;
create policy "community_posts_read_active"
  on public.community_posts
  for select
  to authenticated
  using (status = 'active');

-- A signed-in member may create a post only as themselves.
drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
  on public.community_posts
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Authors may update their own posts. Curator/admin workflow can be added separately.
drop policy if exists "community_posts_update_own" on public.community_posts;
create policy "community_posts_update_own"
  on public.community_posts
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Signed-in Community members may read active responses.
drop policy if exists "community_comments_read_active" on public.community_comments;
create policy "community_comments_read_active"
  on public.community_comments
  for select
  to authenticated
  using (status = 'active');

-- A signed-in member may create a response only as themselves.
drop policy if exists "community_comments_insert_own" on public.community_comments;
create policy "community_comments_insert_own"
  on public.community_comments
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Authors may update their own responses.
drop policy if exists "community_comments_update_own" on public.community_comments;
create policy "community_comments_update_own"
  on public.community_comments
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
