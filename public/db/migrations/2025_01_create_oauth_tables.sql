create table if not exists oauth_states (
  id bigserial primary key,
  provider text not null,
  state text unique not null,
  pkce_verifier text not null,
  created_at timestamptz not null default now()
);
create table if not exists tesla_tokens (
  user_id uuid primary key,
  access_token text not null,
  refresh_token text not null,
  expires_in integer not null,
  fetched_at timestamptz not null default now()
);
