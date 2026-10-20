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
-- Content-duration analytics are installed separately by engagement-analytics.sql.
-- Run that additive migration after this file for page/work/video reports.
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

-- 小柴的访客长期记忆。每行是一轮已经完成的问答；服务端按匿名 visitor_key
-- 选择最近及相关片段传给 Dify。聊天内容不与公开统计接口混用。
create table if not exists public.portfolio_assistant_memories (
  id bigserial primary key,
  visitor_key text not null,
  conversation_id text default '',
  user_message text not null,
  assistant_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_assistant_memories_visitor_idx
  on public.portfolio_assistant_memories (visitor_key, created_at desc);

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

-- ---------------------------------------------------------------------------
-- 流量分类：human（真人）/ bot（爬虫、扫描器、无浏览器标识的脚本）/ local（本机、内网）。
-- 旧记录只打标、不删除；后台默认只统计 human。规则与 server.ts 的 classifyTraffic 保持一致。
-- ---------------------------------------------------------------------------
alter table public.portfolio_visits add column if not exists traffic_type text not null default 'human';
alter table public.portfolio_visitors add column if not exists traffic_type text not null default 'human';

create or replace function public.portfolio_classify_traffic(p_user_agent text, p_ip text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_ip, '') = ''
      or p_ip ~* '^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1$|f[cd]|fe80)' then 'local'
    when coalesce(p_user_agent, '') !~* '^mozilla/'
      or p_user_agent !~* '(applewebkit|gecko)/'
      or p_user_agent ~* 'bot|crawl|spider|slurp|scan|inspect|headless|phantom|playwright|puppeteer|selenium|lighthouse|curl|wget|python|go-http|java/|okhttp|axios|node-fetch|httpclient|libwww|rootevidence|measurement|palo alto|censys|webindexer|facebookexternalhit|preview|monitor|uptime' then 'bot'
    else 'human'
  end;
$$;

-- 回填（幂等）：只改分类结果有变化的行。
update public.portfolio_visits
   set traffic_type = public.portfolio_classify_traffic(user_agent, ip)
 where traffic_type is distinct from public.portfolio_classify_traffic(user_agent, ip);

-- 访客的类型取其名下访问的「最像真人」的一档：human > local > bot。
update public.portfolio_visitors p
   set traffic_type = agg.traffic_type
  from (
    select visitor_key,
           case when bool_or(traffic_type = 'human') then 'human'
                when bool_or(traffic_type = 'local') then 'local'
                else 'bot' end as traffic_type
      from public.portfolio_visits
     group by visitor_key
  ) agg
 where agg.visitor_key = p.visitor_key
   and p.traffic_type is distinct from agg.traffic_type;

create index if not exists portfolio_visits_fingerprint_idx
  on public.portfolio_visits (fingerprint, created_at desc) where fingerprint <> '';
create index if not exists portfolio_visits_type_created_idx
  on public.portfolio_visits (traffic_type, created_at desc);
create index if not exists portfolio_visitors_last_seen_idx
  on public.portfolio_visitors (traffic_type, last_seen desc);

-- 访客聚合在一条 upsert 里完成，替代原来的读后写（并发访问会丢计数）。
-- 归属地查不到时传空串，保留上一次已知的归属地，不再被清空。
create or replace function public.record_portfolio_visitor(
  p_visitor_key text,
  p_traffic_type text,
  p_ip text,
  p_country text,
  p_region text,
  p_city text,
  p_isp text,
  p_device text,
  p_browser text,
  p_os text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portfolio_visitors as v (
    visitor_key, first_seen, last_seen, visit_count, page_views, traffic_type,
    last_ip, last_country, last_region, last_city, last_isp, last_device, last_browser, last_os
  ) values (
    p_visitor_key, now(), now(), 1, 1, coalesce(p_traffic_type, 'human'),
    coalesce(p_ip, ''), coalesce(p_country, ''), coalesce(p_region, ''), coalesce(p_city, ''),
    coalesce(p_isp, ''), coalesce(p_device, ''), coalesce(p_browser, ''), coalesce(p_os, '')
  )
  on conflict (visitor_key) do update set
    last_seen = now(),
    visit_count = v.visit_count + 1,
    page_views = v.page_views + 1,
    traffic_type = case when v.traffic_type = 'human' or excluded.traffic_type = 'human' then 'human'
                        else excluded.traffic_type end,
    last_ip = excluded.last_ip,
    last_country = case when excluded.last_country <> '' then excluded.last_country else v.last_country end,
    last_region = case when excluded.last_country <> '' then excluded.last_region else v.last_region end,
    last_city = case when excluded.last_country <> '' then excluded.last_city else v.last_city end,
    last_isp = case when excluded.last_country <> '' then excluded.last_isp else v.last_isp end,
    last_device = excluded.last_device,
    last_browser = excluded.last_browser,
    last_os = excluded.last_os;
end;
$$;

revoke all on function public.record_portfolio_visitor(text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_portfolio_visitor(text, text, text, text, text, text, text, text, text, text) to service_role;

-- 后台概览：一次往返拿到卡片数字、趋势、Top 分布和被隐藏的流量数。
-- p_since 为 null 表示全部时间；p_bucket 为 'hour' 或 'day'（按北京时间切分）。
create or replace function public.portfolio_visit_summary(
  p_since timestamptz default null,
  p_human_only boolean default true,
  p_bucket text default 'day'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select *
      from public.portfolio_visits
     where (p_since is null or created_at >= p_since)
       and (not p_human_only or traffic_type = 'human')
  ),
  hidden as (
    select count(*) filter (where traffic_type = 'bot') as bots,
           count(*) filter (where traffic_type = 'local') as locals
      from public.portfolio_visits
     where (p_since is null or created_at >= p_since)
  ),
  series as (
    select date_trunc(case when p_bucket = 'hour' then 'hour' else 'day' end,
                      created_at at time zone 'Asia/Shanghai') as bucket,
           count(*) as visits,
           count(distinct visitor_key) as visitors
      from v
     group by 1
  ),
  refs as (
    select coalesce(nullif(substring(referrer from '^[a-z]+://([^/:?#]+)'), ''), '直接访问') as label,
           count(*) as n
      from v
     group by 1
  ),
  clicks as (
    select count(*) as n
      from public.portfolio_events e
      left join public.portfolio_visitors p on p.visitor_key = e.visitor_key
     where e.event_name = 'ui_click'
       and (p_since is null or e.occurred_at >= p_since)
       and (not p_human_only or coalesce(p.traffic_type, 'human') = 'human')
  )
  select jsonb_build_object(
    'visits', (select count(*) from v),
    'visitors', (select count(distinct visitor_key) from v),
    'avgDwellMs', (select coalesce(round(avg(dwell_ms) filter (where dwell_ms > 0)), 0) from v),
    'bounceRate', (select case when count(*) = 0 then 0
                               else round(count(*) filter (where coalesce(dwell_ms, 0) < 10000)::numeric / count(*), 3) end from v),
    'clicks', (select n from clicks),
    'hiddenBots', (select bots from hidden),
    'hiddenLocal', (select locals from hidden),
    'series', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(bucket, 'YYYY-MM-DD"T"HH24:MI'), 'visits', visits, 'visitors', visitors) order by bucket) from series), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('label', coalesce(nullif(country, ''), '未知'), 'n', count(*)) as x
          from v group by coalesce(nullif(country, ''), '未知') order by count(*) desc limit 6) t), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('label', coalesce(nullif(concat_ws(' · ', nullif(region, ''), nullif(city, '')), ''), '未知'), 'n', count(*)) as x
          from v group by coalesce(nullif(concat_ws(' · ', nullif(region, ''), nullif(city, '')), ''), '未知') order by count(*) desc limit 6) t), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('label', coalesce(nullif(device_type, ''), '未知'), 'n', count(*)) as x
          from v group by coalesce(nullif(device_type, ''), '未知') order by count(*) desc limit 6) t), '[]'::jsonb),
    'browsers', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('label', coalesce(nullif(concat_ws(' / ', nullif(os, ''), nullif(browser, '')), ''), '未知'), 'n', count(*)) as x
          from v group by coalesce(nullif(concat_ws(' / ', nullif(os, ''), nullif(browser, '')), ''), '未知') order by count(*) desc limit 6) t), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc) from (
        select label, n from refs order by n desc limit 6) t), '[]'::jsonb)
  );
$$;

revoke all on function public.portfolio_visit_summary(timestamptz, boolean, text) from public, anon, authenticated;
grant execute on function public.portfolio_visit_summary(timestamptz, boolean, text) to service_role;

-- 按钮排行增加时间范围和流量过滤。先删旧签名，避免 PostgREST 遇到重载歧义。
drop function if exists public.portfolio_click_stats(integer);
create or replace function public.portfolio_click_stats(
  p_limit integer default 100,
  p_since timestamptz default null,
  p_human_only boolean default false
)
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
  left join public.portfolio_visitors p on p.visitor_key = e.visitor_key
  where e.event_name = 'ui_click'
    and (p_since is null or e.occurred_at >= p_since)
    and (not p_human_only or coalesce(p.traffic_type, 'human') = 'human')
  group by e.path, e.element_key
  order by count(*) desc, max(e.occurred_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.portfolio_click_stats(integer, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.portfolio_click_stats(integer, timestamptz, boolean) to service_role;

-- 统计数据只允许 Express 服务端持 service role 访问，浏览器不能绕过后台 API 直读。
alter table public.portfolio_visitors enable row level security;
alter table public.portfolio_visits enable row level security;
alter table public.portfolio_events enable row level security;
alter table public.portfolio_assistant_memories enable row level security;
revoke all on table public.portfolio_visitors, public.portfolio_visits, public.portfolio_events, public.portfolio_assistant_memories from anon, authenticated;
