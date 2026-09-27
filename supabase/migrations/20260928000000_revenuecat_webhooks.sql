-- RevenueCat webhook state is service-role only. RLS is enabled without client policies.
create table if not exists public.revenuecat_entitlements (
  app_user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id text not null,
  active boolean not null default false,
  product_identifier text,
  period_start timestamptz,
  period_end timestamptz,
  environment text,
  revenuecat_event_id text,
  event_timestamp_ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (app_user_id, entitlement_id)
);

create table if not exists public.revenuecat_webhook_events (
  id text primary key,
  event_type text not null,
  app_user_id text,
  environment text,
  event_timestamp_ms bigint not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now()
);

alter table public.revenuecat_entitlements enable row level security;
alter table public.revenuecat_webhook_events enable row level security;
