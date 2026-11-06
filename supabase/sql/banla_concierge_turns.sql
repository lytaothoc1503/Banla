-- Nhật ký lễ tân AI. Không lưu số thẻ.
create table if not exists public.banla_concierge_turns (
  id bigint generated always as identity primary key,
  question text not null,
  reply text not null,
  source text not null default 'gemini',
  created_at timestamptz not null default now()
);

alter table public.banla_concierge_turns enable row level security;
revoke all on table public.banla_concierge_turns from anon, authenticated;
