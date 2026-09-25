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

-- 原始交互事件：只记录控件标签，不保存输入框、表单或媒体文本内容。
create table if not exists public.portfolio_events (
  id bigserial primary key,
  event_id text not null unique,
  visit_id bigint references public.portfolio_visits(id) on delete set null,
  visitor_key text not null,
  session_id text default '',
  event_name text not null,
  element_key text not null,
  element_label text default '',
  element_type text default '',
  path text default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.portfolio_events add column if not exists event_id text;
update public.portfolio_events set event_id = 'legacy-' || id::text where event_id is null or event_id = '';
alter table public.portfolio_events alter column event_id set not null;
create unique index if not exists portfolio_events_event_id_idx on public.portfolio_events (event_id);

create index if not exists portfolio_events_lookup_idx
  on public.portfolio_events (event_name, element_key, created_at desc);

create index if not exists portfolio_events_visitor_idx
  on public.portfolio_events (visitor_key, created_at desc);

-- 心跳可能并发抵达；在数据库事务里累加，避免读后写覆盖导致时长丢失。
create or replace function public.increment_portfolio_dwell(
  p_visit_id bigint,
  p_visitor_key text,
  p_dwell_ms bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_visitor_key text;
begin
  update public.portfolio_visits
     set dwell_ms = coalesce(dwell_ms, 0) + greatest(p_dwell_ms, 0)
   where id = p_visit_id
   returning visitor_key into resolved_visitor_key;

  resolved_visitor_key := coalesce(resolved_visitor_key, p_visitor_key);
  if resolved_visitor_key is not null and resolved_visitor_key <> '' then
    update public.portfolio_visitors
       set total_dwell_ms = coalesce(total_dwell_ms, 0) + greatest(p_dwell_ms, 0)
     where visitor_key = resolved_visitor_key;
  end if;
end;
$$;

revoke all on function public.increment_portfolio_dwell(bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.increment_portfolio_dwell(bigint, text, bigint) to service_role;

-- 全量按钮聚合由数据库完成，避免应用只拉最近 N 条导致历史计数被截断。
create or replace function public.portfolio_click_stats(p_limit integer default 100)
returns table (
  element_key text,
  element_label text,
  element_type text,
  path text,
  clicks bigint,
  unique_visitors bigint,
  last_clicked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.element_key,
    max(e.element_label) as element_label,
    max(e.element_type) as element_type,
    e.path,
    count(*) as clicks,
    count(distinct e.visitor_key) as unique_visitors,
    max(e.occurred_at) as last_clicked_at
  from public.portfolio_events e
  where e.event_name = 'ui_click'
  group by e.path, e.element_key
  order by count(*) desc, max(e.occurred_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.portfolio_click_stats(integer) from public, anon, authenticated;
grant execute on function public.portfolio_click_stats(integer) to service_role;

-- 统计数据只允许 Express 服务端持 service role 访问，浏览器不能绕过后台 API 直读。
alter table public.portfolio_visitors enable row level security;
alter table public.portfolio_visits enable row level security;
alter table public.portfolio_events enable row level security;
revoke all on table public.portfolio_visitors, public.portfolio_visits, public.portfolio_events from anon, authenticated;
