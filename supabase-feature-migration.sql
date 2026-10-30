
-- goodbye to the future: feature expansion migration
-- Run this once in Supabase SQL Editor after supabase-schema.sql has already been applied.
alter table public.memorials
  add column if not exists anniversary_date date,
  add column if not exists reminder_enabled boolean not null default false;

alter table public.flowers
  add column if not exists tribute_type text not null default 'flower'
    check (tribute_type in ('flower', 'candle', 'stone', 'leaf'));

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

create table if not exists public.memorial_capsules (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1600),
  reveal_at timestamptz not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.memorial_album_items (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  caption text check (char_length(caption) <= 240),
  created_at timestamptz not null default now()
);

alter table public.comment_reports enable row level security;
alter table public.memorial_capsules enable row level security;
alter table public.memorial_album_items enable row level security;

create policy "report visible public comments" on public.comment_reports for insert to authenticated
  with check (reporter_id = auth.uid() and exists (
    select 1 from public.comments c join public.memorials m on m.id = c.memorial_id
    where c.id = comment_id and c.status = 'published' and m.visibility = 'public'
  ));
create policy "reporters read their reports" on public.comment_reports for select to authenticated using (reporter_id = auth.uid());
create policy "memorial owners read comment reports" on public.comment_reports for select to authenticated
  using (exists (select 1 from public.comments c join public.memorials m on m.id = c.memorial_id where c.id = comment_id and m.owner_id = auth.uid()));
create policy "owners read all comments on their memorials" on public.comments for select to authenticated
  using (exists (select 1 from public.memorials m where m.id = memorial_id and m.owner_id = auth.uid()));
create policy "owners moderate comments on their memorials" on public.comments for update to authenticated
  using (exists (select 1 from public.memorials m where m.id = memorial_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.memorials m where m.id = memorial_id and m.owner_id = auth.uid()));
create policy "owners read their capsules" on public.memorial_capsules for select to authenticated using (author_id = auth.uid());
create policy "read opened public capsules" on public.memorial_capsules for select
  using (is_public and reveal_at <= now() and exists (select 1 from public.memorials m where m.id = memorial_id and m.visibility = 'public'));
create policy "owners manage capsules" on public.memorial_capsules for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and exists (select 1 from public.memorials m where m.id = memorial_id and m.owner_id = auth.uid()));
create policy "read public or own album items" on public.memorial_album_items for select
  using (author_id = auth.uid() or exists (select 1 from public.memorials m where m.id = memorial_id and m.visibility = 'public'));
create policy "owners manage album items" on public.memorial_album_items for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and exists (select 1 from public.memorials m where m.id = memorial_id and m.owner_id = auth.uid()));

