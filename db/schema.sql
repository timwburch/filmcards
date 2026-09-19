-- Film Cards cloud sync schema (Neon / Postgres)
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql

create extension if not exists pgcrypto;

create table if not exists access_requests (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'revoked')),
  approval_token_hash  text,
  approval_expires_at  timestamptz,
  access_token_hash    text,
  requested_at         timestamptz not null default now(),
  last_request_at      timestamptz not null default now(),
  request_count        integer not null default 1,
  approved_at          timestamptz
);

-- Token lookups hit these on every approve/save, and both are high-cardinality.
create index if not exists access_requests_approval_token_idx
  on access_requests (approval_token_hash);
create index if not exists access_requests_access_token_idx
  on access_requests (access_token_hash);

create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references access_requests (id) on delete cascade,
  name        text not null default 'Film cards session',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sessions_owner_idx on sessions (owner_id, updated_at desc);

-- One row per printable card. card_index mirrors the IndexedDB suffix in
-- `film-data-<n>` / `film-still-<n>` so a restore rebuilds the same keys.
create table if not exists cards (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions (id) on delete cascade,
  card_index      integer not null check (card_index >= 0),
  title           text not null default '',
  year            text not null default '',
  runtime         text not null default '',
  director        text not null default '',
  writer          text not null default '',
  starring        text not null default '',
  genre           text not null default '',
  still_filename  text not null default '',
  -- Data URL for uploaded stills, remote URL when the host blocked download.
  still_url       text,
  created_at      timestamptz not null default now(),
  unique (session_id, card_index)
);

create index if not exists cards_session_idx on cards (session_id, card_index);
