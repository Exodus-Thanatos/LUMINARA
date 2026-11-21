-- Phase 5, Step 4: the DEVELOPER role and administrator-issued developer registration keys. Requires 001_init.sql and 003.
-- Never edit this file after it has been applied; add 005_*.sql instead.
--
-- 1) Allow the new role. Existing accounts keep their roles; nobody is converted.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC', 'DEVELOPER'));

-- 2) Invitation keys. Only a SHA-256 hash of the key is stored (the key is 192 random bits, so a fast hash is enough,
--    the same way session tokens are stored). The key itself is shown to the administrator ONCE, when it is created.
--    Which role the key grants is not a column on purpose: a key can only ever create a DEVELOPER account.
CREATE TABLE developer_invites (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_hash    TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 60),
  created_by  BIGINT      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  used_by     BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ,
  revoked_by  BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT developer_invites_expiry_after_creation CHECK (expires_at > created_at),
  -- single use: a key is either unused, used or revoked, never two of these
  CONSTRAINT developer_invites_used_or_revoked CHECK (used_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX developer_invites_created_idx ON developer_invites (created_at DESC);
