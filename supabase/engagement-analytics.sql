-- Run after schema.sql, in Supabase SQL Editor. Additive and safe to repeat.
-- Intentionally NO foreign key to portfolio content: deleting a work must retain history.
begin;
alter table public.portfolio_visits add column if not exists last_activity_at timestamptz;
alter table public.portfolio_visits add column if not exists reported_dwell_ms bigint not null default 0;
update public.portfolio_visits set reported_dwell_ms = greatest(reported_dwell_ms, coalesce(dwell_ms, 0));

create table if not exists public.portfolio_engagements (
  id uuid primary key,
  visit_id bigint references public.portfolio_visits(id) on delete set null,
  visitor_key text not null,
  session_id text not null,
  traffic_type text not null check (traffic_type in ('human','bot','local')),
  kind text not null check (kind in ('page','work','video')),
  content_key text not null,
  title text not null,
  page_key text not null default '',
  path text not null default '',
  started_at timestamptz not null,
  last_seen timestamptz not null default now(),
  dwell_ms bigint not null default 0 check (dwell_ms >= 0),
  watch_ms bigint not null default 0 check (watch_ms >= 0),
  duration_ms bigint not null default 0,
  max_progress numeric not null default 0,
  completed boolean not null default false,
  play_count integer not null default 0
);
create index if not exists portfolio_engagements_content_idx on public.portfolio_engagements(kind, content_key, started_at desc);
create index if not exists portfolio_engagements_visitor_idx on public.portfolio_engagements(visitor_key, started_at desc);
create index if not exists portfolio_engagements_range_idx on public.portfolio_engagements(traffic_type, started_at desc);
create index if not exists portfolio_visits_activity_idx on public.portfolio_visits(last_activity_at desc) where dwell_ms > 120000;
alter table public.portfolio_engagements enable row level security;
revoke all on public.portfolio_engagements from anon, authenticated;
grant all on public.portfolio_engagements to service_role;

create or replace function public.record_portfolio_engagements(
  p_visit_id bigint, p_visitor_key text, p_session_id text, p_entries jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v public.portfolio_visits%rowtype;
  e jsonb;
  start_time timestamptz;
  elapsed bigint;
begin
  select * into v from public.portfolio_visits
    where id = p_visit_id and visitor_key = p_visitor_key and session_id = p_session_id;
  if not found then raise exception 'invalid visit context'; end if;
  for e in select value from jsonb_array_elements(p_entries) limit 24 loop
    start_time := greatest(v.created_at, least(now(), (e->>'startedAt')::timestamptz));
    elapsed := least(21600000, greatest(0, extract(epoch from now() - start_time) * 1000)::bigint);
    insert into public.portfolio_engagements as target
      (id, visit_id, visitor_key, session_id, traffic_type, kind, content_key, title, page_key, path,
       started_at, dwell_ms, watch_ms, duration_ms, max_progress, completed, play_count)
    values
      ((e->>'id')::uuid, v.id, v.visitor_key, v.session_id, v.traffic_type,
       e->>'kind', e->>'contentKey', e->>'title', e->>'pageKey', e->>'path',
       start_time, least(elapsed, (e->>'dwellMs')::bigint), least(elapsed, (e->>'watchMs')::bigint),
       (e->>'durationMs')::bigint, (e->>'maxProgress')::numeric, (e->>'completed')::boolean, (e->>'playCount')::integer)
    on conflict (id) do update set
      dwell_ms = greatest(target.dwell_ms, excluded.dwell_ms),
      watch_ms = greatest(target.watch_ms, excluded.watch_ms),
      duration_ms = greatest(target.duration_ms, excluded.duration_ms),
      max_progress = greatest(target.max_progress, excluded.max_progress),
      completed = target.completed or excluded.completed,
      play_count = greatest(target.play_count, excluded.play_count),
      last_seen = case when excluded.dwell_ms > target.dwell_ms or excluded.watch_ms > target.watch_ms then now() else target.last_seen end
    where target.visit_id = v.id and target.visitor_key = v.visitor_key
      and target.kind = excluded.kind and target.content_key = excluded.content_key;
  end loop;
end;
$$;

-- Idempotent whole-visit heartbeats, including retries and unload/interval races.
create or replace function public.sync_portfolio_dwell(p_visit_id bigint, p_visitor_key text, p_total_ms bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portfolio_visits%rowtype; next_total bigint; delta bigint;
begin
  select * into v from public.portfolio_visits where id = p_visit_id and visitor_key = p_visitor_key for update;
  if not found then return; end if;
  next_total := least(21600000, greatest(0, p_total_ms), greatest(0, extract(epoch from now() - v.created_at) * 1000)::bigint);
  delta := greatest(0, next_total - v.reported_dwell_ms);
  if delta = 0 then return; end if;
  update public.portfolio_visits set reported_dwell_ms = next_total, dwell_ms = coalesce(dwell_ms, 0) + delta,
    last_activity_at = now() where id = v.id;
  update public.portfolio_visitors set total_dwell_ms = coalesce(total_dwell_ms, 0) + delta
    where visitor_key = v.visitor_key;
end;
$$;

create or replace function public.portfolio_content_report(
  p_since timestamptz default null, p_until timestamptz default now(),
  p_human_only boolean default true, p_kind text default 'page',
  p_visitor_key text default null, p_content_key text default null,
  p_page integer default 1, p_size integer default 20
) returns jsonb language sql stable security definer set search_path = public as $$
with filtered as (
  select * from public.portfolio_engagements
  where (p_since is null or started_at >= p_since) and started_at <= p_until
    and (not p_human_only or traffic_type = 'human')
    and kind = p_kind
    and (p_visitor_key is null or visitor_key = p_visitor_key)
    and (p_content_key is null or content_key = p_content_key)
), grouped as (
  select kind, content_key, (array_agg(title order by started_at desc))[1] as title,
    count(*) as views, count(distinct visitor_key) as visitors,
    sum(dwell_ms) as dwell_ms, round(avg(dwell_ms)) as avg_dwell_ms,
    sum(watch_ms) as watch_ms,
    coalesce(round(avg(watch_ms) filter (where play_count > 0)), 0) as avg_watch_ms,
    count(*) filter (where play_count > 0) as plays,
    count(*) filter (where completed and play_count > 0) as completions,
    max(last_seen) as last_seen
  from filtered group by kind, content_key
), paged as (
  select * from grouped order by
    case when p_kind = 'video' then watch_ms else dwell_ms end desc, content_key
  limit least(100, greatest(1, p_size)) offset greatest(0, p_page - 1) * least(100, greatest(1, p_size))
)
select jsonb_build_object('configured',true,'total',(select count(*) from grouped),'page',p_page,'pageSize',p_size,
  'items', coalesce((select jsonb_agg(jsonb_build_object(
    'kind',kind,'contentKey',content_key,'title',title,'views',views,'visitors',visitors,
    'dwellMs',dwell_ms,'avgDwellMs',avg_dwell_ms,'watchMs',watch_ms,'avgWatchMs',avg_watch_ms,
    'plays',plays,'completions',completions,'lastSeen',last_seen
  )) from paged),'[]'::jsonb));
$$;
revoke all on function public.record_portfolio_engagements(bigint,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.sync_portfolio_dwell(bigint,text,bigint) from public,anon,authenticated;
revoke all on function public.portfolio_content_report(timestamptz,timestamptz,boolean,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_portfolio_engagements(bigint,text,text,jsonb) to service_role;
grant execute on function public.sync_portfolio_dwell(bigint,text,bigint) to service_role;
grant execute on function public.portfolio_content_report(timestamptz,timestamptz,boolean,text,text,text,integer,integer) to service_role;
commit;
notify pgrst, 'reload schema';
