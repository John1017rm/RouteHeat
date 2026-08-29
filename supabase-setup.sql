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

-- Private, per-user Delivery Area definitions. Deletions remain as compact
-- tombstones so an older offline device cannot silently recreate an Area.
create table if not exists public.routeheat_delivery_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id text not null check (char_length(area_id) between 1 and 192),
  area_data jsonb,
  revision bigint not null default 1 check (revision between 1 and 2147483647),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint routeheat_delivery_area_live_or_deleted check (coalesce(
    ((deleted_at is null and area_data is not null and jsonb_typeof(area_data) = 'object'
      and area_data ->> 'id' = area_id
      and area_data ->> 'version' = '1'
      and area_data ->> 'revision' ~ '^[0-9]{1,10}$'
      and (area_data ->> 'revision')::bigint = revision
      and char_length(area_data ->> 'name') between 1 and 40
      and area_data ->> 'color' ~ '^#[0-9a-f]{6}$'
      and case when jsonb_typeof(area_data -> 'polygon') = 'array'
        then jsonb_array_length(area_data -> 'polygon') between 3 and 64
        else false end
      and pg_column_size(area_data) <= 131072)
    or (deleted_at is not null and deleted_at = updated_at and area_data is null)),
    false
  ))
);

create unique index if not exists routeheat_delivery_areas_user_area_unique
  on public.routeheat_delivery_areas (user_id, area_id);

create index if not exists routeheat_delivery_areas_user_updated_idx
  on public.routeheat_delivery_areas (user_id, updated_at desc);

-- Direct browser upserts are safe under RLS. This trigger adds an atomic
-- last-write guard so a stale device cannot overwrite a newer revision after
-- both devices read the same older row. A deletion wins an exact version tie.
create or replace function public.routeheat_keep_newest_delivery_area()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.user_id <> old.user_id or new.area_id <> old.area_id then
    raise exception 'Delivery Area identity cannot be changed';
  end if;
  if new.revision < old.revision
    or (new.revision = old.revision and new.updated_at < old.updated_at) then
    return old;
  end if;
  if new.revision = old.revision and new.updated_at = old.updated_at then
    if old.deleted_at is not null and new.deleted_at is null then
      return old;
    end if;
    if old.deleted_at is null and new.deleted_at is not null then
      return new;
    end if;
    if coalesce(new.area_data::text, '') <= coalesce(old.area_data::text, '') then
      return old;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.routeheat_keep_newest_delivery_area() from public, anon, authenticated;

drop trigger if exists routeheat_delivery_areas_keep_newest on public.routeheat_delivery_areas;
create trigger routeheat_delivery_areas_keep_newest
  before update on public.routeheat_delivery_areas
  for each row execute function public.routeheat_keep_newest_delivery_area();

alter table public.routeheat_delivery_areas enable row level security;

revoke all on table public.routeheat_delivery_areas from public, anon;
grant select, insert, update, delete on table public.routeheat_delivery_areas to authenticated;

drop policy if exists "RouteHeat users read their own Delivery Areas" on public.routeheat_delivery_areas;
create policy "RouteHeat users read their own Delivery Areas"
  on public.routeheat_delivery_areas
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "RouteHeat users insert their own Delivery Areas" on public.routeheat_delivery_areas;
create policy "RouteHeat users insert their own Delivery Areas"
  on public.routeheat_delivery_areas
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "RouteHeat users update their own Delivery Areas" on public.routeheat_delivery_areas;
create policy "RouteHeat users update their own Delivery Areas"
  on public.routeheat_delivery_areas
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "RouteHeat users delete their own Delivery Areas" on public.routeheat_delivery_areas;
create policy "RouteHeat users delete their own Delivery Areas"
  on public.routeheat_delivery_areas
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
