-- Asynchronous online social mode. All counters are mutated only through RPCs below.

create table if not exists public.online_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null unique,
  total_hits_given bigint not null default 0 check (total_hits_given >= 0),
  total_hits_received bigint not null default 0 check (total_hits_received >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint online_username_letters check (username ~ '^[A-Za-z]{1,10}$'),
  constraint online_username_normalized_letters check (username_normalized ~ '^[a-z]{1,10}$')
);

create table if not exists public.online_elbow_records (
  id bigint generated always as identity primary key,
  attacker_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  attacker_username text not null,
  minute_bucket timestamptz not null,
  hit_count bigint not null default 1 check (hit_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attacker_id, target_id, minute_bucket),
  constraint online_record_not_self check (attacker_id <> target_id)
);

create table if not exists public.online_messages (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  author_username text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint online_message_body_nonempty check (length(trim(body)) > 0),
  constraint online_message_body_bytes check (octet_length(convert_to(body, 'UTF8')) <= 150)
);

create index if not exists online_profiles_received_rank_idx on public.online_profiles (total_hits_received desc, username_normalized asc);
create index if not exists online_profiles_given_rank_idx on public.online_profiles (total_hits_given desc, username_normalized asc);
create index if not exists online_profiles_username_search_idx on public.online_profiles (username_normalized);
create index if not exists online_messages_target_created_idx on public.online_messages (target_id, created_at desc, id desc);
create index if not exists online_elbow_records_target_created_idx on public.online_elbow_records (target_id, created_at desc, id desc);

create table if not exists private.online_hit_rate_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  second_bucket timestamptz not null,
  hit_count integer not null default 1,
  primary key (user_id, second_bucket)
);

create table if not exists private.online_message_rate_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_posted_at timestamptz not null
);

alter table public.online_profiles enable row level security;
alter table public.online_elbow_records enable row level security;
alter table public.online_messages enable row level security;

create policy "authenticated users can read online profiles" on public.online_profiles
  for select to authenticated using (true);
create policy "owners can read their elbow records" on public.online_elbow_records
  for select to authenticated using (target_id = auth.uid());
create policy "authenticated users can read online messages" on public.online_messages
  for select to authenticated using (true);
create policy "authors or board owners can delete messages" on public.online_messages
  for delete to authenticated using (author_id = auth.uid() or target_id = auth.uid());

create or replace function public.online_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists on_online_profile_updated on public.online_profiles;
create trigger on_online_profile_updated before update on public.online_profiles
for each row execute procedure public.online_touch_updated_at();
drop trigger if exists on_online_record_updated on public.online_elbow_records;
create trigger on_online_record_updated before update on public.online_elbow_records
for each row execute procedure public.online_touch_updated_at();

create or replace function public.create_online_profile()
returns public.online_profiles
language plpgsql security definer set search_path = public, private
as $$
declare profile_row public.online_profiles;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  insert into public.online_profiles (user_id, username, username_normalized)
  select id, username, username_normalized from public.players where id = auth.uid()
  on conflict (user_id) do nothing;
  select * into profile_row from public.online_profiles where user_id = auth.uid();
  if profile_row.user_id is null then raise exception 'player_profile_missing'; end if;
  return profile_row;
end;
$$;

create or replace function public.online_elbow(target_user_id uuid)
returns table (accepted boolean, attacker_total bigint, target_total bigint, reason text)
language plpgsql security definer set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  current_bucket timestamptz := date_trunc('second', clock_timestamp());
  current_minute timestamptz := date_trunc('minute', clock_timestamp());
  rate_count integer;
  actor_count bigint;
  target_count bigint;
  actor_name text;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if target_user_id is null or target_user_id = actor_id then
    return query select false, null::bigint, null::bigint, 'invalid_target'; return;
  end if;
  -- Lock both profile rows in a deterministic order before incrementing either counter.
  perform 1 from public.online_profiles
    where user_id in (actor_id, target_user_id)
    order by user_id for update;
  if not exists (select 1 from public.online_profiles where user_id = actor_id)
     or not exists (select 1 from public.online_profiles where user_id = target_user_id) then
    return query select false, null::bigint, null::bigint, 'invalid_target'; return;
  end if;
  insert into private.online_hit_rate_windows (user_id, second_bucket, hit_count)
  values (actor_id, current_bucket, 1)
  on conflict (user_id, second_bucket) do update
    set hit_count = private.online_hit_rate_windows.hit_count + 1
  returning hit_count into rate_count;
  if rate_count > 5 then
    select total_hits_given into actor_count from public.online_profiles where user_id = actor_id;
    select total_hits_received into target_count from public.online_profiles where user_id = target_user_id;
    return query select false, actor_count, target_count, 'rate_limited'; return;
  end if;
  update public.online_profiles set total_hits_given = total_hits_given + 1 where user_id = actor_id
    returning total_hits_given into actor_count;
  update public.online_profiles set total_hits_received = total_hits_received + 1 where user_id = target_user_id
    returning total_hits_received into target_count;
  select username into actor_name from public.online_profiles where user_id = actor_id;
  insert into public.online_elbow_records (attacker_id, target_id, attacker_username, minute_bucket, hit_count)
  values (actor_id, target_user_id, actor_name, current_minute, 1)
  on conflict (attacker_id, target_id, minute_bucket) do update
    set hit_count = public.online_elbow_records.hit_count + 1,
        updated_at = clock_timestamp();
  return query select true, actor_count, target_count, null::text;
end;
$$;

create or replace function public.online_post_message(target_user_id uuid, message_body text)
returns public.online_messages
language plpgsql security definer set search_path = public, private
as $$
declare
  actor_id uuid := auth.uid();
  author_name text;
  posted_at timestamptz;
  result public.online_messages;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if target_user_id is null or not exists (select 1 from public.online_profiles where user_id = target_user_id) then
    raise exception 'invalid_target';
  end if;
  if message_body is null or length(trim(message_body)) = 0 or octet_length(convert_to(message_body, 'UTF8')) > 150 then
    raise exception 'invalid_message';
  end if;
  insert into private.online_message_rate_windows (user_id, last_posted_at)
  values (actor_id, clock_timestamp())
  on conflict (user_id) do update set last_posted_at = clock_timestamp()
    where private.online_message_rate_windows.last_posted_at <= clock_timestamp() - interval '10 seconds'
  returning last_posted_at into posted_at;
  if posted_at is null then raise exception 'message_rate_limited'; end if;
  select username into author_name from public.players where id = actor_id;
  insert into public.online_messages (author_id, target_id, author_username, body)
  values (actor_id, target_user_id, author_name, trim(message_body)) returning * into result;
  return result;
end;
$$;

revoke all on public.online_profiles, public.online_elbow_records, public.online_messages from anon;
revoke all on public.online_profiles, public.online_elbow_records, public.online_messages from authenticated;
grant select on public.online_profiles, public.online_elbow_records, public.online_messages to authenticated;
grant delete on public.online_messages to authenticated;
revoke all on function public.create_online_profile() from public, anon;
revoke all on function public.online_elbow(uuid) from public, anon;
revoke all on function public.online_post_message(uuid, text) from public, anon;
grant execute on function public.create_online_profile() to authenticated;
grant execute on function public.online_elbow(uuid) to authenticated;
grant execute on function public.online_post_message(uuid, text) to authenticated;
