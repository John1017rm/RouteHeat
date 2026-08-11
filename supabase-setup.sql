-- RouteHeat cloud backup schema
-- Run this entire file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.routeheat_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  stop_count integer not null default 0 check (stop_count >= 0),
  route_data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists routeheat_routes_user_route_unique
  on public.routeheat_routes (user_id, route_id);

create index if not exists routeheat_routes_user_started_idx
  on public.routeheat_routes (user_id, started_at desc);

alter table public.routeheat_routes enable row level security;

revoke all on table public.routeheat_routes from anon;
grant select, insert, update, delete on table public.routeheat_routes to authenticated;

drop policy if exists "RouteHeat users read their own routes" on public.routeheat_routes;
create policy "RouteHeat users read their own routes"
  on public.routeheat_routes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "RouteHeat users insert their own routes" on public.routeheat_routes;
create policy "RouteHeat users insert their own routes"
  on public.routeheat_routes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "RouteHeat users update their own routes" on public.routeheat_routes;
create policy "RouteHeat users update their own routes"
  on public.routeheat_routes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "RouteHeat users delete their own routes" on public.routeheat_routes;
create policy "RouteHeat users delete their own routes"
  on public.routeheat_routes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
