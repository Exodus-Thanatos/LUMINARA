-- LUMINARA schema, version 1. Requires PostgreSQL 12 or newer. No extensions needed.
-- Applied once by `npm run db:migrate` (see server/migrate.js); never edit this file after it has been applied,
-- add 002_*.sql instead.

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name            TEXT        NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 80),
  username             TEXT        NOT NULL CHECK (username ~ '^[A-Za-z0-9._-]{3,32}$'),
  email                TEXT        NOT NULL CHECK (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  password_hash        TEXT        NOT NULL,
  role                 TEXT        NOT NULL CHECK (role IN ('ADMIN', 'TECHNICIAN', 'STAFF')),
  account_status       TEXT        NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'INACTIVE')),
  must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT      REFERENCES users (id) ON DELETE SET NULL
);
-- Duplicate usernames / e-mail addresses are rejected by the database itself, case-insensitively.
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_key    ON users (lower(email));
CREATE INDEX users_role_status_idx           ON users (role, account_status);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- sessions
-- Only a SHA-256 hash of the random session token is stored; the token itself lives in the HTTP-only cookie.
CREATE TABLE sessions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash   TEXT        NOT NULL UNIQUE,
  user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX sessions_user_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- ---------------------------------------------------------------- maintenance tickets
CREATE SEQUENCE maintenance_ticket_seq START 1001;

CREATE TABLE maintenance_tickets (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_number          TEXT        NOT NULL UNIQUE DEFAULT ('MT-' || nextval('maintenance_ticket_seq')::text),
  streetlight_id         TEXT        NOT NULL CHECK (streetlight_id ~ '^L-[0-9]{3}$'),
  location               TEXT        NOT NULL CHECK (char_length(btrim(location)) BETWEEN 3 AND 80),
  issue_description      TEXT        NOT NULL CHECK (char_length(btrim(issue_description)) BETWEEN 5 AND 300),
  priority               TEXT        NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  -- The technician is a real user (foreign key). Users are never deleted, only deactivated, so history stays intact.
  assigned_technician_id BIGINT      REFERENCES users (id) ON DELETE RESTRICT,
  -- Only used for tickets imported from the old browser prototype, where the technician was just a typed name.
  legacy_technician_name TEXT,
  status                 TEXT        NOT NULL CHECK (status IN ('OPEN', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED')),
  reported_at            TIMESTAMPTZ NOT NULL,
  first_response_at      TIMESTAMPTZ,
  resolved_at            TIMESTAMPTZ,
  resolution             TEXT        NOT NULL DEFAULT '' CHECK (char_length(resolution) <= 200),
  archived_at            TIMESTAMPTZ,
  archived_by            BIGINT      REFERENCES users (id) ON DELETE RESTRICT,
  created_by             BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  version                INTEGER     NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Rules the database enforces on its own, whatever the application does:
  CONSTRAINT tickets_resolved_has_date    CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL),
  CONSTRAINT tickets_archive_only_resolved CHECK (archived_at IS NULL OR status = 'RESOLVED'),
  CONSTRAINT tickets_archive_has_actor    CHECK ((archived_at IS NULL) = (archived_by IS NULL)),
  CONSTRAINT tickets_active_has_technician CHECK (status NOT IN ('ASSIGNED', 'IN PROGRESS') OR assigned_technician_id IS NOT NULL OR legacy_technician_name IS NOT NULL),
  CONSTRAINT tickets_one_technician_source CHECK (assigned_technician_id IS NULL OR legacy_technician_name IS NULL)
);
CREATE INDEX tickets_active_idx     ON maintenance_tickets (updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX tickets_archived_idx   ON maintenance_tickets (archived_at DESC) WHERE archived_at IS NOT NULL;
CREATE INDEX tickets_technician_idx ON maintenance_tickets (assigned_technician_id);
CREATE INDEX tickets_streetlight_idx ON maintenance_tickets (streetlight_id);
CREATE INDEX tickets_status_idx     ON maintenance_tickets (status);
CREATE TRIGGER tickets_set_updated_at BEFORE UPDATE ON maintenance_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- maintenance history (append-only)
-- RESTRICT: a ticket that has history can never be deleted by accident, so archiving always keeps its trail.
CREATE TABLE maintenance_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id      BIGINT      NOT NULL REFERENCES maintenance_tickets (id) ON DELETE RESTRICT,
  action         TEXT        NOT NULL CHECK (action IN ('CREATED', 'STATUS_CHANGED', 'TECHNICIAN_CHANGED', 'PRIORITY_CHANGED', 'DETAILS_EDITED', 'RESOLVED', 'ARCHIVED', 'RESTORED', 'IMPORTED_NOTE')),
  previous_value TEXT,
  new_value      TEXT,
  performed_by   BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_history_ticket_idx ON maintenance_history (ticket_id, created_at, id);
