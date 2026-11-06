-- Payment records for the owner admin. No card number, expiry, or CVV.
create table if not exists public.banla_card_payments (
  id text primary key,
  booking_id text not null,
  provider text not null,
  provider_order_id text,
  provider_capture_id text,
  amount integer not null,
  currency text not null default 'VND',
  status text not null,
  room_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint banla_card_payments_status_chk check (status in ('PENDING', 'PAID', 'CANCELLED', 'FAILED', 'AMOUNT_MISMATCH'))
);

alter table public.banla_card_payments enable row level security;
revoke all on table public.banla_card_payments from anon, authenticated;
