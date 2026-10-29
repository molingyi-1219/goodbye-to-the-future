-- Run in the Supabase SQL editor. Never expose the service_role key in the browser.
create type public.memorial_visibility as enum ('private', 'public');
create type public.comment_status as enum ('pending', 'published', 'hidden');

create table public.memorials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('人', '物', '理想', '记忆', '其他')),
  title text not null check (char_length(title) between 1 and 48),
  epitaph text check (char_length(epitaph) <= 100),
  story text check (char_length(story) <= 2000),
  style text not null check (style in ('cross', 'arch', 'weathered', 'obelisk', 'abstract', 'deco')),
  visibility public.memorial_visibility not null default 'private',
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flowers (
  memorial_id uuid not null references public.memorials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memorial_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 180),
  is_anonymous boolean not null default true,
  status public.comment_status not null default 'published',
  created_at timestamptz not null default now()
);

-- A creator's return visit: a new note left while "tending" their own memorial.
create table public.memorial_visits (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 800),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.memorials enable row level security;
alter table public.flowers enable row level security;
alter table public.comments enable row level security;
alter table public.memorial_visits enable row level security;

-- Memorials: visitors read only public records; owners retain full control of theirs.
create policy "read public or own memorials" on public.memorials for select
  using (visibility = 'public' or owner_id = auth.uid());
create policy "owners create memorials" on public.memorials for insert to authenticated
  with check (owner_id = auth.uid());
create policy "owners update memorials" on public.memorials for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete memorials" on public.memorials for delete to authenticated
  using (owner_id = auth.uid());

-- Flowers: only logged-in users can add/remove their own single flower.
create policy "read flowers on visible memorials" on public.flowers for select
  using (exists (select 1 from public.memorials m where m.id = memorial_id and (m.visibility = 'public' or m.owner_id = auth.uid())));
create policy "users add own flowers" on public.flowers for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.memorials m where m.id = memorial_id and m.visibility = 'public'));
create policy "users remove own flowers" on public.flowers for delete to authenticated using (user_id = auth.uid());

-- Comments publish immediately. Add a moderation dashboard before opening a large public community.
create policy "read published or own comments" on public.comments for select
  using (status = 'published' or author_id = auth.uid());
create policy "users submit comments" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and status = 'published' and exists (select 1 from public.memorials m where m.id = memorial_id and m.visibility = 'public'));

-- Only a memorial's creator can add a tending visit. Visitors can see public visits on public memorials.
create policy "read public or own tending visits" on public.memorial_visits for select
  using (author_id = auth.uid() or (is_public and exists (select 1 from public.memorials m where m.id = memorial_id and m.visibility = 'public')));
create policy "owners add tending visits" on public.memorial_visits for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.memorials m where m.id = memorial_id and m.owner_id = auth.uid()));

-- Keep the image bucket private. A server-side Edge Function should issue temporary signed URLs
-- only after checking the associated memorial's visibility / ownership.
insert into storage.buckets (id, name, public) values ('memorial-media', 'memorial-media', false);
create policy "owners upload into own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'memorial-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners manage own images" on storage.objects for all to authenticated
  using (bucket_id = 'memorial-media' and owner_id = auth.uid()::text)
  with check (bucket_id = 'memorial-media' and owner_id = auth.uid()::text);
create policy "read images belonging to public memorials" on storage.objects for select
  using (bucket_id = 'memorial-media' and exists (
    select 1 from public.memorials m
    where m.image_path = name and m.visibility = 'public'
  ));

