-- Vows & Vibe — Canonical Schema
-- Storage bucket requirement: PUBLIC bucket named `vto-renders`

create extension if not exists "pgcrypto";

-- This schema is intended for Supabase, where the storage schema is available.
-- Keep the render bucket public because the application stores public lineup cutouts
-- and VTO renders here and reads them through Supabase public object URLs.
insert into storage.buckets (id, name, public)
values ('vto-renders', 'vto-renders', true)
on conflict (id) do update set public = excluded.public;

-- ============================================================================
-- ENUMS
-- ============================================================================

do $$ begin
  create type participant_status as enum ('pending', 'confirmed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_role as enum ('bride', 'bridesmaid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vto_attempt_status as enum ('processing', 'ready', 'confirmed', 'error');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- TABLES & INDEXES
-- ============================================================================

-- 1. EVENTS
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title varchar(255) not null,
  event_date date,
  dress_style varchar(255),
  color_palette jsonb not null default '[]'::jsonb,
  example_dresses jsonb not null default '[]'::jsonb,
  invite_code text unique not null default encode(gen_random_bytes(6), 'hex'),
  fabric_type text default 'chiffon',
  dress_length text default 'floor',
  created_at timestamptz not null default now()
);

create index if not exists events_owner_id_idx on events(owner_id);

-- The generated group image is replace-in-place; the flattened generation input is never stored.
alter table events add column if not exists group_preview_path text;
alter table events add column if not exists group_preview_updated_at timestamptz;
alter table events add column if not exists group_preview_venue_path text;

-- Remove the legacy dress-mode column from databases created before moodboard-only events.
alter table events drop column if exists dress_mode;


-- 2. PARTICIPANTS
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name varchar(255) not null,
  session_token text not null default encode(gen_random_bytes(16), 'hex'),
  role participant_role not null default 'bridesmaid',
  original_photo_path text,
  confirmed_look_id uuid,
  -- Public participant lifecycle: only pending or confirmed. VTO attempt progress lives on vto_attempts.
  status participant_status not null default 'pending',
  -- Derived once per uploaded photo from the YouCam skin-tone-analysis task. Nullable:
  -- absent until analysis completes, and the app must always work fine without it (the
  -- color palette just stays in its original order).
  skin_tone_hex text,
  skin_undertone text check (skin_undertone in ('warm', 'cool', 'neutral')),
  skin_depth text check (skin_depth in ('fair', 'light', 'medium', 'deep')),
  -- Read from the SAME YouCam skin-tone-analysis task/response as skin_tone_hex — never a
  -- separate call. Nullable: the model may not find hair in a given selfie frame. Used
  -- alongside skin_tone_hex for dress-rail scoring (see analyzeDressWithSkinAndHair).
  hair_tone_hex text,
  hair_color_name text,
  -- 2D lineup metadata. Coordinates are normalized to 0..1 so layouts survive resize/device changes.
  lineup_x numeric(8,6) default 0.5,
  lineup_y numeric(8,6) default 0.07,
  lineup_z_index integer not null default 0,
  lineup_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Additive migrations for databases created before skin-tone analysis, confirmed
-- looks, or the shared 2D lineup existed. CREATE TABLE IF NOT EXISTS does not add
-- columns to an existing table, so keep these explicit and rerunnable.
alter table participants add column if not exists original_photo_path text;
alter table participants add column if not exists confirmed_look_id uuid;
alter table participants add column if not exists status participant_status not null default 'pending';
alter table participants add column if not exists skin_tone_hex text;
alter table participants add column if not exists skin_undertone text check (skin_undertone in ('warm', 'cool', 'neutral'));
alter table participants add column if not exists skin_depth text check (skin_depth in ('fair', 'light', 'medium', 'deep'));
alter table participants add column if not exists hair_tone_hex text;
alter table participants add column if not exists hair_color_name text;
alter table participants add column if not exists lineup_x numeric(8,6) default 0.5;
alter table participants add column if not exists lineup_y numeric(8,6) default 0.07;
alter table participants add column if not exists lineup_z_index integer not null default 0;
alter table participants add column if not exists lineup_hidden boolean not null default false;
alter table participants add column if not exists updated_at timestamptz not null default now();

create index if not exists participants_event_id_idx on participants(event_id);
create unique index if not exists participants_session_token_idx on participants(session_token);
create unique index if not exists participants_event_name_idx on participants(event_id, lower(trim(name)));
create unique index if not exists participants_one_bride_per_event_idx on participants(event_id) where role = 'bride';


-- 3. PUBLIC LINEUP UPDATES
-- Realtime-safe event rows. This intentionally contains no session token, photo path,
-- task id, or other private participant data. Clients receive the event, then refresh
-- the already-sanitized public lineup endpoint once.
create table if not exists lineup_updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists lineup_updates_event_idx on lineup_updates(event_id, created_at desc);

-- 3. PARTICIPANT DRESSES
create table if not exists participant_dresses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  storage_path text not null,
  label varchar(255),
  -- User-confirmed canonical color palette + representative hex.
  primary_hex text,
  color_name varchar(255),
  created_at timestamptz not null default now(),
  unique(participant_id, storage_path)
);

-- Additive columns for databases created before garment color analysis existed.
alter table participant_dresses add column if not exists primary_hex text;
alter table participant_dresses add column if not exists color_name varchar(255);

create index if not exists participant_dresses_participant_idx on participant_dresses(participant_id);


-- 4. VTO ATTEMPTS
create table if not exists vto_attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  participant_dress_id uuid references participant_dresses(id) on delete set null,
  dress_path text,
  body_photo_path text not null,
  render_path text,
  cutout_path text,
  task_id text not null unique,
  status vto_attempt_status not null default 'processing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, participant_id)
);

-- Additive migrations for databases created before saved dress references and
-- background-removed lineup cutouts were introduced.
alter table vto_attempts add column if not exists participant_dress_id uuid references participant_dresses(id) on delete set null;
alter table vto_attempts add column if not exists cutout_path text;
alter table vto_attempts add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vto_attempts_id_participant_idx on vto_attempts(id, participant_id);
create index if not exists vto_attempts_participant_idx on vto_attempts(participant_id, created_at desc);
create unique index if not exists vto_one_confirmed_per_participant_idx on vto_attempts(participant_id) where status = 'confirmed';

-- 3b. PARTICIPANT SUGGESTIONS
-- Suggestions are private to the intended recipient and are scoped to the recipient's
-- current confirmed look. Old suggestions disappear automatically when that participant
-- changes her look. Clients only subscribe to the sanitized suggestion_updates signal.
create table if not exists participant_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  from_participant_id uuid not null references participants(id) on delete cascade,
  to_participant_id uuid not null references participants(id) on delete cascade,
  target_look_id uuid not null references vto_attempts(id) on delete cascade,
  text varchar(500) not null check (length(trim(text)) between 1 and 500),
  created_at timestamptz not null default now(),
  check (from_participant_id <> to_participant_id)
);

create index if not exists participant_suggestions_recipient_idx
  on participant_suggestions(to_participant_id, target_look_id, created_at desc);

-- Realtime-safe signal. The text is deliberately not published to Realtime.
create table if not exists suggestion_updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  suggestion_id uuid not null references participant_suggestions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists suggestion_updates_event_idx on suggestion_updates(event_id, created_at desc);


-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Composite foreign key guarantees that confirmed_look_id belongs to the same
-- participant. Recreate it on every run so installations that used the older broad
-- SET NULL action are repaired. Only confirmed_look_id may be nulled; participants.id
-- is the non-null primary key and must never be part of the SET NULL action.
alter table participants
  drop constraint if exists participants_confirmed_look_same_participant_fkey;

alter table participants
  add constraint participants_confirmed_look_same_participant_fkey
  foreign key (confirmed_look_id, id)
  references vto_attempts(id, participant_id)
  on delete set null (confirmed_look_id);


-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================
-- PUBLIC LINEUP REALTIME
alter table lineup_updates enable row level security;

drop policy if exists "public read lineup updates" on lineup_updates;
create policy "public read lineup updates"
  on lineup_updates for select
  using (true);

create or replace function publish_lineup_update() returns trigger as $$
begin
  -- Emit only the sanitized signal. The clients never subscribe to private participant rows.
  if (
    old.status is distinct from new.status
    or old.confirmed_look_id is distinct from new.confirmed_look_id
    or old.lineup_x is distinct from new.lineup_x
    or old.lineup_y is distinct from new.lineup_y
    or old.lineup_z_index is distinct from new.lineup_z_index
    or old.lineup_hidden is distinct from new.lineup_hidden
  ) then
    insert into lineup_updates(event_id, participant_id)
    values (new.event_id, new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_participants_lineup_update on participants;
create trigger trg_participants_lineup_update
  after update of status, confirmed_look_id, lineup_x, lineup_y, lineup_z_index, lineup_hidden on participants
  for each row execute function publish_lineup_update();

-- Manual lineup scaling was removed. Drop its persisted value only after replacing
-- the trigger above, since older installations may still have an UPDATE OF dependency.
alter table participants drop column if exists lineup_scale;


create or replace function validate_participant_suggestion() returns trigger as $$
declare
  sender_event uuid;
  sender_status participant_status;
  sender_look uuid;
  target_event uuid;
  target_status participant_status;
  target_look uuid;
begin
  select event_id, status, confirmed_look_id
    into sender_event, sender_status, sender_look
    from participants where id = new.from_participant_id;
  select event_id, status, confirmed_look_id
    into target_event, target_status, target_look
    from participants where id = new.to_participant_id;

  if sender_event is null or target_event is null or sender_event <> target_event or sender_event <> new.event_id then
    raise exception 'Suggestion participants must belong to the same event';
  end if;
  if sender_status <> 'confirmed' or target_status <> 'confirmed' then
    raise exception 'Only confirmed participants can exchange suggestions';
  end if;
  if target_look is null or new.target_look_id <> target_look then
    raise exception 'Suggestion must target the participant''s current confirmed look';
  end if;
  if sender_look is null then
    raise exception 'Sender must have a confirmed look';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_validate_participant_suggestion on participant_suggestions;
create trigger trg_validate_participant_suggestion
  before insert on participant_suggestions
  for each row execute function validate_participant_suggestion();

create or replace function publish_suggestion_update() returns trigger as $$
begin
  insert into suggestion_updates(event_id, suggestion_id)
  values (new.event_id, new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_publish_suggestion_update on participant_suggestions;
create trigger trg_publish_suggestion_update
  after insert on participant_suggestions
  for each row execute function publish_suggestion_update();

create or replace function clear_suggestions_on_look_change() returns trigger as $$
begin
  if old.confirmed_look_id is distinct from new.confirmed_look_id then
    delete from participant_suggestions where to_participant_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_clear_suggestions_on_look_change on participants;
create trigger trg_clear_suggestions_on_look_change
  after update of confirmed_look_id on participants
  for each row execute function clear_suggestions_on_look_change();

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_participants_updated_at on participants;
create trigger trg_participants_updated_at
  before update on participants
  for each row execute function set_updated_at();

drop trigger if exists trg_vto_attempts_updated_at on vto_attempts;
create trigger trg_vto_attempts_updated_at
  before update on vto_attempts
  for each row execute function set_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table events enable row level security;
alter table participants enable row level security;
alter table participant_dresses enable row level security;
alter table vto_attempts enable row level security;
alter table participant_suggestions enable row level security;
alter table suggestion_updates enable row level security;

-- Events Policies
drop policy if exists "owners manage their events" on events;
create policy "owners manage their events"
  on events for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Participants Policies
drop policy if exists "owners read their participants" on participants;
create policy "owners read their participants"
  on participants for select
  using (exists(select 1 from events e where e.id = participants.event_id and e.owner_id = auth.uid()));

drop policy if exists "owners update their participants" on participants;
create policy "owners update their participants"
  on participants for update
  using (exists(select 1 from events e where e.id = participants.event_id and e.owner_id = auth.uid()));

-- Participant Dresses Policies
drop policy if exists "owners read participant dresses" on participant_dresses;
create policy "owners read participant dresses"
  on participant_dresses for select
  using (exists(
    select 1 from participants p
    join events e on e.id = p.event_id
    where p.id = participant_dresses.participant_id and e.owner_id = auth.uid()
  ));

-- VTO Attempts Policies
drop policy if exists "owners read vto attempts" on vto_attempts;
create policy "owners read vto attempts"
  on vto_attempts for select
  using (exists(
    select 1 from participants p
    join events e on e.id = p.event_id
    where p.id = vto_attempts.participant_id and e.owner_id = auth.uid()
  ));

drop policy if exists "public read suggestion updates" on suggestion_updates;
create policy "public read suggestion updates"
  on suggestion_updates for select
  using (true);

-- Supabase Realtime publications. These blocks are idempotent so they are safe to run
-- after enabling the tables in the Supabase dashboard.
--
-- NOTE: `participants` itself is deliberately NOT published. The dashboard listens only
-- to the sanitized lineup_updates signal, which is emitted for confirmed-look changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vto_attempts'
  ) then
    alter publication supabase_realtime add table public.vto_attempts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lineup_updates'
  ) then
    alter publication supabase_realtime add table public.lineup_updates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestion_updates'
  ) then
    alter publication supabase_realtime add table public.suggestion_updates;
  end if;
end $$;
