-- Email and password sign-in, one page per audience: travellers, business
-- owners, and operations staff.
--
-- Kept apart from users so a row with a password hash is only ever read by
-- the sign-in path, never by a query that happens to select from users.
CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- scrypt$N$r$p$salt$hash, base64url. Never the password itself.
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_signed_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
