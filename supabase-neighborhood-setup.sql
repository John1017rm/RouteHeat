-- RouteHeat Neighborhood Snapshot server-side cache and rate limits.
-- Run this after supabase-setup.sql in Supabase Dashboard -> SQL Editor.
-- The browser never receives direct access to these tables or the quota RPC.

create table if not exists public.routeheat_census_tract_cache (
  data_year smallint not null check (data_year between 2009 and 2100),
  geoid text not null check (geoid ~ '^[0-9]{11}$'),
  state_fips text not null check (state_fips ~ '^[0-9]{2}$'),
  county_fips text not null check (county_fips ~ '^[0-9]{3}$'),
  tract_code text not null check (tract_code ~ '^[0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 200),
  statistics jsonb not null check (jsonb_typeof(statistics) = 'object'),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (data_year, geoid),
  check (expires_at > fetched_at),
  check (geoid = state_fips || county_fips || tract_code)
);

create index if not exists routeheat_census_tract_cache_expiry_idx
  on public.routeheat_census_tract_cache (expires_at);

create table if not exists public.routeheat_neighborhood_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id text not null check (char_length(route_id) between 1 and 192),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  data_year smallint not null check (data_year between 2009 and 2100),
  snapshot_data jsonb not null check (jsonb_typeof(snapshot_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, route_id),
  check (expires_at > created_at)
);

create index if not exists routeheat_neighborhood_snapshots_expiry_idx
  on public.routeheat_neighborhood_snapshots (expires_at);

create table if not exists public.routeheat_function_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('snapshot_request', 'snapshot_compute')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.routeheat_census_tract_cache enable row level security;
alter table public.routeheat_neighborhood_snapshots enable row level security;
alter table public.routeheat_function_rate_limits enable row level security;

-- These are Edge-Function-only tables. RLS has deliberately been left with no
-- client policies, and grants are revoked even when automatic table exposure is on.
revoke all on table public.routeheat_census_tract_cache from public, anon, authenticated;
revoke all on table public.routeheat_neighborhood_snapshots from public, anon, authenticated;
revoke all on table public.routeheat_function_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.routeheat_census_tract_cache to service_role;
grant select, insert, update, delete on table public.routeheat_neighborhood_snapshots to service_role;
grant select, insert, update, delete on table public.routeheat_function_rate_limits to service_role;

create or replace function public.routeheat_take_function_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  current_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_count integer;
  v_interval interval;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;
  if p_bucket not in ('snapshot_request', 'snapshot_compute') then
    raise exception 'invalid rate-limit bucket';
  end if;
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid rate-limit maximum';
  end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate-limit window';
  end if;

  v_interval := make_interval(secs => p_window_seconds);

  insert into public.routeheat_function_rate_limits as limits (
    user_id,
    bucket,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_user_id,
    p_bucket,
    v_now,
    1,
    v_now
  )
  on conflict (user_id, bucket) do update
  set
    window_started_at = case
      when limits.window_started_at <= v_now - v_interval then v_now
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= v_now - v_interval then 1
      else limits.request_count + 1
    end,
    updated_at = v_now
  returning request_count, window_started_at
    into v_count, v_window_started_at;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_started_at + v_interval,
    v_count;
end;
$$;

revoke all on function public.routeheat_take_function_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.routeheat_take_function_rate_limit(uuid, text, integer, integer)
  to service_role;

create or replace function public.routeheat_purge_neighborhood_snapshot_on_route_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.routeheat_neighborhood_snapshots
      where user_id = old.user_id and route_id = old.route_id;
    return old;
  end if;

  if new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at then
    delete from public.routeheat_neighborhood_snapshots
      where user_id = new.user_id and route_id = new.route_id;
  end if;
  return new;
end;
$$;

revoke all on function public.routeheat_purge_neighborhood_snapshot_on_route_delete()
  from public, anon, authenticated;

drop trigger if exists routeheat_purge_neighborhood_snapshot_on_route_delete
  on public.routeheat_routes;
create trigger routeheat_purge_neighborhood_snapshot_on_route_delete
  after update of deleted_at or delete on public.routeheat_routes
  for each row execute function public.routeheat_purge_neighborhood_snapshot_on_route_delete();

-- 6.2 release hardening: route-scoped generation epochs make removal win over
-- an older Edge Function that is still processing Census data.
alter table public.routeheat_routes
  add column if not exists neighborhood_generation bigint not null default 0;

delete from public.routeheat_neighborhood_snapshots as snapshots
where not exists (
  select 1 from public.routeheat_routes as routes
  where routes.user_id = snapshots.user_id and routes.route_id = snapshots.route_id
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routeheat_neighborhood_snapshot_route_fk'
      and conrelid = 'public.routeheat_neighborhood_snapshots'::regclass
  ) then
    alter table public.routeheat_neighborhood_snapshots
      add constraint routeheat_neighborhood_snapshot_route_fk
      foreign key (user_id, route_id)
      references public.routeheat_routes(user_id, route_id)
      on delete cascade;
  end if;
end;
$$;

create or replace function public.routeheat_bump_neighborhood_generation_on_delete_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is distinct from new.deleted_at then
    new.neighborhood_generation := old.neighborhood_generation + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.routeheat_bump_neighborhood_generation_on_delete_change()
  from public, anon, authenticated;

drop trigger if exists routeheat_bump_neighborhood_generation_on_delete_change
  on public.routeheat_routes;
create trigger routeheat_bump_neighborhood_generation_on_delete_change
  before update of deleted_at on public.routeheat_routes
  for each row execute function public.routeheat_bump_neighborhood_generation_on_delete_change();

-- The authenticated Edge client reads only the route fields needed for tract
-- matching. Large GPS trails and unrelated route analytics never enter the function.
create or replace function public.routeheat_neighborhood_route_input(p_route_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', to_jsonb(routes.route_id),
    'startedAt', routes.route_data -> 'startedAt',
    'endedAt', routes.route_data -> 'endedAt',
    'revision', coalesce(routes.route_data -> 'revision', '0'::jsonb),
    'updatedAt', coalesce(routes.route_data -> 'updatedAt', routes.route_data -> 'endedAt'),
    'neighborhoodGeneration', to_jsonb(routes.neighborhood_generation),
    'stops', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', stop.value -> 'id',
          'lat', stop.value -> 'lat',
          'lng', stop.value -> 'lng',
          'locationSource', stop.value -> 'locationSource',
          'manualLocation', stop.value -> 'manualLocation',
          'accuracy', stop.value -> 'accuracy',
          'phaseId', stop.value -> 'phaseId',
          'timestamp', stop.value -> 'timestamp',
          'locationCount', stop.value -> 'locationCount'
        )) order by stop.ordinality
      )
      from jsonb_array_elements(coalesce(routes.route_data -> 'stops', '[]'::jsonb))
        with ordinality as stop(value, ordinality)
    ), '[]'::jsonb),
    'phases', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', phase.value -> 'id',
          'label', phase.value -> 'label',
          'type', phase.value -> 'type',
          'startedAt', phase.value -> 'startedAt'
        )) order by phase.ordinality
      )
      from jsonb_array_elements(coalesce(routes.route_data -> 'phases', '[]'::jsonb))
        with ordinality as phase(value, ordinality)
    ), '[]'::jsonb)
  )
  from public.routeheat_routes as routes
  where routes.user_id = (select auth.uid())
    and routes.route_id = p_route_id
    and routes.ended_at is not null
    and routes.deleted_at is null
  limit 1;
$$;

revoke all on function public.routeheat_neighborhood_route_input(text)
  from public, anon;
grant execute on function public.routeheat_neighborhood_route_input(text)
  to authenticated;

drop function if exists public.routeheat_begin_neighborhood_generation(uuid, text);
create or replace function public.routeheat_begin_neighborhood_generation(
  p_user_id uuid,
  p_route_id text,
  p_expected_generation bigint,
  p_expected_revision bigint,
  p_expected_updated_at bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation bigint;
begin
  if p_expected_generation < 0 or p_expected_revision < 0 or p_expected_updated_at < 1 then
    return null;
  end if;
  update public.routeheat_routes
  set neighborhood_generation = neighborhood_generation + 1
  where user_id = p_user_id
    and route_id = p_route_id
    and ended_at is not null
    and deleted_at is null
    and neighborhood_generation = p_expected_generation
    and coalesce(
      case when route_data ->> 'revision' ~ '^[0-9]{1,18}$'
        then (route_data ->> 'revision')::bigint end,
      0
    ) = p_expected_revision
    and case when route_data ->> 'updatedAt' ~ '^[0-9]{1,18}$'
      then (route_data ->> 'updatedAt')::bigint end = p_expected_updated_at
    and round(extract(epoch from updated_at) * 1000)::bigint = p_expected_updated_at
  returning neighborhood_generation into v_generation;
  return v_generation;
end;
$$;

revoke all on function public.routeheat_begin_neighborhood_generation(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.routeheat_begin_neighborhood_generation(uuid, text, bigint, bigint, bigint)
  to service_role;

create or replace function public.routeheat_validate_neighborhood_generation(
  p_user_id uuid,
  p_route_id text,
  p_generation bigint,
  p_expected_revision bigint,
  p_expected_updated_at bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.routeheat_routes
    where user_id = p_user_id
      and route_id = p_route_id
      and ended_at is not null
      and deleted_at is null
      and neighborhood_generation = p_generation
      and coalesce(
        case when route_data ->> 'revision' ~ '^[0-9]{1,18}$'
          then (route_data ->> 'revision')::bigint end,
        0
      ) = p_expected_revision
      and case when route_data ->> 'updatedAt' ~ '^[0-9]{1,18}$'
        then (route_data ->> 'updatedAt')::bigint end = p_expected_updated_at
      and round(extract(epoch from updated_at) * 1000)::bigint = p_expected_updated_at
  );
$$;

revoke all on function public.routeheat_validate_neighborhood_generation(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.routeheat_validate_neighborhood_generation(uuid, text, bigint, bigint, bigint)
  to service_role;

drop function if exists public.routeheat_store_neighborhood_snapshot(uuid, text, bigint, text, smallint, jsonb, timestamptz);
create or replace function public.routeheat_store_neighborhood_snapshot(
  p_user_id uuid,
  p_route_id text,
  p_generation bigint,
  p_expected_revision bigint,
  p_expected_updated_at bigint,
  p_input_hash text,
  p_data_year smallint,
  p_snapshot_data jsonb,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation bigint;
  v_revision bigint;
  v_updated_at bigint;
  v_row_updated_at bigint;
  v_deleted_at timestamptz;
  v_ended_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  select neighborhood_generation,
      coalesce(
        case when route_data ->> 'revision' ~ '^[0-9]{1,18}$'
          then (route_data ->> 'revision')::bigint end,
        0
      ),
      case when route_data ->> 'updatedAt' ~ '^[0-9]{1,18}$'
        then (route_data ->> 'updatedAt')::bigint end,
      round(extract(epoch from updated_at) * 1000)::bigint,
      deleted_at,
      ended_at
    into v_generation, v_revision, v_updated_at, v_row_updated_at, v_deleted_at, v_ended_at
  from public.routeheat_routes
  where user_id = p_user_id and route_id = p_route_id
  for update;

  if not found
    or v_deleted_at is not null
    or v_ended_at is null
    or v_generation <> p_generation
    or v_revision <> p_expected_revision
    or v_updated_at <> p_expected_updated_at
    or v_row_updated_at <> p_expected_updated_at
  then
    return false;
  end if;

  insert into public.routeheat_neighborhood_snapshots as snapshots (
    user_id, route_id, input_hash, data_year, snapshot_data,
    created_at, updated_at, expires_at
  ) values (
    p_user_id, p_route_id, p_input_hash, p_data_year, p_snapshot_data,
    v_now, v_now, p_expires_at
  )
  on conflict (user_id, route_id) do update
  set input_hash = excluded.input_hash,
      data_year = excluded.data_year,
      snapshot_data = excluded.snapshot_data,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at;
  return true;
end;
$$;

revoke all on function public.routeheat_store_neighborhood_snapshot(uuid, text, bigint, bigint, bigint, text, smallint, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.routeheat_store_neighborhood_snapshot(uuid, text, bigint, bigint, bigint, text, smallint, jsonb, timestamptz)
  to service_role;

create or replace function public.routeheat_remove_neighborhood_snapshot(
  p_user_id uuid,
  p_route_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.routeheat_routes
  set neighborhood_generation = neighborhood_generation + 1
  where user_id = p_user_id and route_id = p_route_id;

  delete from public.routeheat_neighborhood_snapshots
  where user_id = p_user_id and route_id = p_route_id;
  return true;
end;
$$;

revoke all on function public.routeheat_remove_neighborhood_snapshot(uuid, text)
  from public, anon, authenticated;
grant execute on function public.routeheat_remove_neighborhood_snapshot(uuid, text)
  to service_role;

-- A project-wide budget protects the shared Census key when many accounts build
-- snapshots at once. Per-user limits remain in place as a second layer.
create table if not exists public.routeheat_global_function_rate_limits (
  bucket text primary key check (bucket in ('snapshot_compute')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.routeheat_global_function_rate_limits enable row level security;
revoke all on table public.routeheat_global_function_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.routeheat_global_function_rate_limits to service_role;

create or replace function public.routeheat_take_global_function_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  current_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_count integer;
  v_interval interval;
begin
  if p_bucket <> 'snapshot_compute' then raise exception 'invalid global rate-limit bucket'; end if;
  if p_limit < 1 or p_limit > 100000 then raise exception 'invalid global rate-limit maximum'; end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'invalid global rate-limit window'; end if;
  v_interval := make_interval(secs => p_window_seconds);

  insert into public.routeheat_global_function_rate_limits as limits (
    bucket, window_started_at, request_count, updated_at
  ) values (p_bucket, v_now, 1, v_now)
  on conflict (bucket) do update
  set window_started_at = case when limits.window_started_at <= v_now - v_interval then v_now else limits.window_started_at end,
      request_count = case when limits.window_started_at <= v_now - v_interval then 1 else limits.request_count + 1 end,
      updated_at = v_now
  returning request_count, window_started_at into v_count, v_window_started_at;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_started_at + v_interval,
    v_count;
end;
$$;

revoke all on function public.routeheat_take_global_function_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.routeheat_take_global_function_rate_limit(text, integer, integer)
  to service_role;
