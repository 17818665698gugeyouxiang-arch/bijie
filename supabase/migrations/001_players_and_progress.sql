create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  constraint username_is_letters check (username ~ '^[A-Za-z]{1,10}$'),
  constraint username_normalized_is_letters check (username_normalized ~ '^[a-z]{1,10}$')
);

create table if not exists public.game_progress (
  player_id uuid primary key references public.players(id) on delete cascade,
  hits bigint not null default 0 check (hits >= 0),
  coins bigint not null default 0 check (coins >= 0),
  level integer not null default 1 check (level >= 1),
  xp bigint not null default 0 check (xp >= 0),
  piggies jsonb not null default '[{"id":"starter-pig","name":"小粉","count":0}]'::jsonb,
  selected_pig_id text not null default 'starter-pig',
  upgrades jsonb not null default '[]'::jsonb,
  unlocked_content jsonb not null default '[]'::jsonb,
  achievements jsonb not null default '[]'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  purchased_items jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  statistics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.game_progress enable row level security;

create policy "players can read their own profile" on public.players
  for select to authenticated using (id = auth.uid());
create policy "players can read only their own save" on public.game_progress
  for select to authenticated using (player_id = auth.uid());
create policy "players can update only their own save" on public.game_progress
  for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

create or replace function public.create_player_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.players (id, username, username_normalized)
  values (new.id, new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'username_normalized');
  insert into public.game_progress (player_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.create_player_progress();

create or replace function public.touch_progress_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists on_progress_updated on public.game_progress;
create trigger on_progress_updated before update on public.game_progress
  for each row execute procedure public.touch_progress_updated_at();

revoke all on public.players, public.game_progress from anon;
grant select on public.players to authenticated;
grant select, update on public.game_progress to authenticated;

create schema if not exists private;
create table if not exists private.auth_rate_limits (
  rate_key text primary key,
  attempts integer not null,
  window_started_at timestamptz not null default now()
);
create or replace function public.check_auth_rate_limit(key_input text)
returns boolean language plpgsql security definer set search_path = private, public as $$
declare current_attempts integer;
begin
  insert into private.auth_rate_limits (rate_key, attempts, window_started_at)
  values (key_input, 1, now())
  on conflict (rate_key) do update set
    attempts = case when private.auth_rate_limits.window_started_at < now() - interval '10 minutes' then 1 else private.auth_rate_limits.attempts + 1 end,
    window_started_at = case when private.auth_rate_limits.window_started_at < now() - interval '10 minutes' then now() else private.auth_rate_limits.window_started_at end
  returning attempts into current_attempts;
  return current_attempts <= 10;
end;
$$;
revoke all on function public.check_auth_rate_limit(text) from public, anon, authenticated;
