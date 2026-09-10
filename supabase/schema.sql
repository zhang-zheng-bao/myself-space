create table if not exists public.portfolio_profile (
  id text primary key,
  name text default '',
  avatar text default '',
  tagline text default '',
  intro text default '',
  quote text default '',
  resume_pdf_url text default '',
  music_autoplay boolean default false,
  page_copy jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.portfolio_profile
add column if not exists page_copy jsonb default '{}'::jsonb;

alter table public.portfolio_profile
add column if not exists music_autoplay boolean default false;

create table if not exists public.portfolio_prospects (
  id text primary key,
  title text default '',
  content text default '',
  points jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.portfolio_contact (
  id text primary key,
  wechat text default '',
  qq text default '',
  email text default '',
  phone text default '',
  github text default '',
  updated_at timestamptz default now()
);

create table if not exists public.portfolio_experiences (
  id text primary key,
  period text default '',
  role text default '',
  company text default '',
  "desc" text default '',
  sort_order integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.portfolio_works (
  id text primary key,
  category text default 'app',
  title text default '',
  description text default '',
  icon text,
  badge_text text default '',
  images jsonb default '[]'::jsonb,
  video_url text default '',
  links jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  sort_order integer default 0,
  updated_at timestamptz default now()
);

alter table public.portfolio_works
  add column if not exists badge_text text default '';

create table if not exists public.portfolio_gallery (
  id text primary key,
  category text default '应用',
  title text default '',
  description text default '',
  image_url text default '',
  sort_order integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.portfolio_treasures (
  id text primary key,
  image_url text default '',
  sort_order integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.portfolio_music_tracks (
  id text primary key,
  title text default '',
  artist text default '',
  audio_url text default '',
  cover_url text default '',
  lyrics text default '',
  sort_order integer default 0,
  updated_at timestamptz default now()
);

alter table public.portfolio_music_tracks
add column if not exists lyrics text default '';

create table if not exists public.portfolio_awards (
  id text primary key,
  period text default '',
  title text default '',
  sort_order integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.portfolio_skills (
  id text primary key,
  name text default '',
  sort_order integer default 0,
  updated_at timestamptz default now()
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('portfolio-media', 'portfolio-media', true, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
