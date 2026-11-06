create table if not exists public.portfolio_avatar_calls (
  id uuid primary key,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  outcome text not null,
  setup_ms integer,
  settings_version timestamptz
);

alter table public.portfolio_avatar_calls enable row level security;
revoke all on table public.portfolio_avatar_calls from anon, authenticated;
grant insert on table public.portfolio_avatar_calls to service_role;
