
-- Run this once after supabase-share-music-migration.sql.
alter table public.memorials add column if not exists netease_song_id text;

