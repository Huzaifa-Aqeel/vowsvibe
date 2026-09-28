-- Ensure older projects have the columns used by quota-aware VTO reservations.
alter table public.vto_attempts
  add column if not exists participant_dress_id uuid references public.participant_dresses(id) on delete set null;

alter table public.vto_attempts
  add column if not exists cutout_path text;

alter table public.vto_attempts
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vto_attempts_id_participant_idx
  on public.vto_attempts(id, participant_id);

create index if not exists vto_attempts_participant_idx
  on public.vto_attempts(participant_id, created_at desc);

-- Reserve a quota slot atomically before calling the paid VTO provider. Failed
-- attempts and abandoned reservations older than 30 minutes do not consume quota.
create or replace function public.reserve_vto_attempt(
  p_participant_id uuid,
  p_participant_dress_id uuid,
  p_dress_path text,
  p_body_photo_path text,
  p_task_id text,
  p_period_start timestamptz,
  p_limit integer
) returns public.vto_attempts as $$
declare
  reserved public.vto_attempts;
  used_count integer;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_VTO_LIMIT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_participant_id::text, 0));

  update public.vto_attempts
  set status = 'error'
  where participant_id = p_participant_id
    and status = 'processing'
    and created_at < now() - interval '30 minutes';

  select count(*) into used_count
  from public.vto_attempts
  where participant_id = p_participant_id
    and status <> 'error'
    and created_at >= p_period_start;

  if used_count >= p_limit then
    raise exception 'VTO_QUOTA_EXCEEDED';
  end if;

  insert into public.vto_attempts(
    participant_id,
    participant_dress_id,
    dress_path,
    body_photo_path,
    task_id,
    status
  ) values (
    p_participant_id,
    p_participant_dress_id,
    p_dress_path,
    p_body_photo_path,
    p_task_id,
    'processing'
  ) returning * into reserved;

  return reserved;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.reserve_vto_attempt(uuid, uuid, text, text, text, timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.reserve_vto_attempt(uuid, uuid, text, text, text, timestamptz, integer)
  to service_role;
