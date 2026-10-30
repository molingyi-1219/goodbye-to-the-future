
-- Run this once in Supabase SQL Editor after the earlier feature migration.
alter table public.memorials add column if not exists music_path text;

-- Public memorial pages can request a short-lived URL for their owner's uploaded music.
create policy "read music belonging to public memorials" on storage.objects for select
  using (bucket_id = 'memorial-media' and exists (
    select 1 from public.memorials m
    where m.music_path = name and m.visibility = 'public'
  ));

