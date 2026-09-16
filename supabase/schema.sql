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

-- ===========================================================================
-- 站点检测：访客设备指纹 + 逐次访问记录
-- ===========================================================================

-- 一个「人」= visitor_key（前台 localStorage 里的稳定匿名 ID）
create table if not exists public.portfolio_visitors (
  visitor_key text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visit_count integer not null default 0,
  page_views integer not null default 0,
  total_dwell_ms bigint not null default 0,
  label text default '',
  blocked boolean not null default false,
  last_ip text default '',
  last_country text default '',
  last_region text default '',
  last_city text default '',
  last_isp text default '',
  last_device text default '',
  last_browser text default '',
  last_os text default ''
);

alter table public.portfolio_visitors add column if not exists page_views integer not null default 0;
alter table public.portfolio_visitors add column if not exists total_dwell_ms bigint not null default 0;
alter table public.portfolio_visitors add column if not exists label text default '';
alter table public.portfolio_visitors add column if not exists blocked boolean not null default false;
alter table public.portfolio_visitors add column if not exists last_ip text default '';
alter table public.portfolio_visitors add column if not exists last_country text default '';
alter table public.portfolio_visitors add column if not exists last_region text default '';
alter table public.portfolio_visitors add column if not exists last_city text default '';
alter table public.portfolio_visitors add column if not exists last_isp text default '';
alter table public.portfolio_visitors add column if not exists last_device text default '';
alter table public.portfolio_visitors add column if not exists last_browser text default '';
alter table public.portfolio_visitors add column if not exists last_os text default '';

-- 一次访问 = 一行
create table if not exists public.portfolio_visits (
  id bigserial primary key,
  visitor_key text not null,
  session_id text default '',
  ip text default '',
  ip_geo jsonb default '{}'::jsonb,
  country text default '',
  region text default '',
  city text default '',
  isp text default '',
  device_type text default '',
  browser text default '',
  browser_version text default '',
  os text default '',
  os_version text default '',
  engine text default '',
  user_agent text default '',
  path text default '',
  referrer text default '',
  screen text default '',
  viewport text default '',
  pixel_ratio numeric,
  color_depth integer,
  timezone text default '',
  timezone_offset integer,
  language text default '',
  languages text default '',
  platform text default '',
  cpu_cores integer,
  device_memory numeric,
  touch_points integer,
  gpu text default '',
  cookie_enabled boolean,
  dnt text default '',
  fingerprint text default '',
  dwell_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_visits_visitor_idx
  on public.portfolio_visits (visitor_key, created_at desc);

create index if not exists portfolio_visits_created_idx
  on public.portfolio_visits (created_at desc);

create index if not exists portfolio_visits_ip_idx
  on public.portfolio_visits (ip);
