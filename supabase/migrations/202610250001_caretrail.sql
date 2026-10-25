-- Run once in the Supabase SQL editor. No existing tables are dropped.
begin;
create table if not exists public.caretrail_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('organizer', 'admin'))
);
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references auth.users(id),
  title text not null check (char_length(title) between 5 and 100),
  summary text not null check (char_length(summary) between 10 and 240),
  story text not null check (char_length(story) between 20 and 10000),
  category text not null check (category in ('Relief', 'Medical', 'Education')),
  location text not null default 'Philippines',
  goal_stroops text not null check (goal_stroops ~ '^[1-9][0-9]{0,14}$'),
  is_sample boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  author_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 5 and 100),
  body text not null check (char_length(body) between 20 and 10000),
  expense_stroops text not null default '0' check (expense_stroops ~ '^[0-9]{1,15}$'),
  outcome text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  campaign_id uuid not null references public.campaigns(id),
  idempotency_key uuid not null,
  amount_stroops text not null check (amount_stroops ~ '^[1-9][0-9]{0,14}$'),
  campaign_stroops text not null,
  community_stroops text not null,
  network text not null default 'testnet' check (network = 'testnet'),
  status text not null default 'draft' check (status in ('draft', 'prepared', 'pending', 'confirmed', 'failed', 'needs_review')),
  tx_hash text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (amount_stroops::numeric = campaign_stroops::numeric + community_stroops::numeric),
  check (campaign_stroops::numeric = floor(amount_stroops::numeric * 0.9)),
  check (status <> 'confirmed' or (tx_hash is not null and verified_at is not null))
);
-- Preparation/signature data stays in its own backend-only table.
create table if not exists public.payment_attempts (
  donation_id uuid primary key references public.donations(id),
  deployment_id uuid not null,
  wallet_address text not null,
  unsigned_xdr text,
  signed_xdr text,
  history_request_id text,
  tx_hash text,
  preparation jsonb,
  receipt jsonb,
  created_at timestamptz not null default now()
);
create index if not exists donations_owner_date on public.donations(user_id, created_at desc);
create index if not exists campaign_updates_campaign_date on public.campaign_updates(campaign_id, created_at desc);
alter table public.caretrail_roles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_updates enable row level security;
alter table public.donations enable row level security;
alter table public.payment_attempts enable row level security;
revoke all on public.caretrail_roles, public.campaigns, public.campaign_updates, public.donations, public.payment_attempts from anon, authenticated;
grant all on public.caretrail_roles, public.campaigns, public.campaign_updates, public.donations, public.payment_attempts to service_role;
-- These sample campaigns are labelled; they contain no fabricated donations or outcomes.
insert into public.campaigns (id, title, summary, story, category, location, goal_stroops, is_sample, status) values
('b6db3554-04f7-460d-b75e-421e23ac0001', 'A fresh start after the storm.', 'Help communities take their next step toward recovery.', 'This sample relief campaign demonstrates the CareTrail donation journey. Replace this story and assign an authorized organizer before using it for a real campaign. Testnet XLM has no real monetary value.', 'Relief', 'Iloilo, Philippines', '2000000000', true, 'published'),
('b6db3554-04f7-460d-b75e-421e23ac0002', 'Care within everyone’s reach.', 'Support access to essential care and everyday health needs.', 'This sample medical campaign demonstrates how payment receipts stay separate from organizer reports. No patients or medical claims are represented by this sample. Replace the content before publishing a real campaign.', 'Medical', 'Western Visayas, Philippines', '2000000000', true, 'published'),
('b6db3554-04f7-460d-b75e-421e23ac0003', 'A brighter chapter begins.', 'Make room for possibility through learning and school supplies.', 'This sample education campaign demonstrates a transparent contribution trail. There are no claimed beneficiaries or verified outcomes. Replace this content and assign an organizer before using it for a real campaign.', 'Education', 'Iloilo, Philippines', '2000000000', true, 'published')
on conflict (id) do nothing;
commit;
