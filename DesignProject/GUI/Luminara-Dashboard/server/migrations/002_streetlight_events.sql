-- Phase 5, Step 2: permanent streetlight history and the lighting schedule. Requires 001_init.sql.
-- Never edit this file after it has been applied; add 003_*.sql instead.

-- ---------------------------------------------------------------- streetlight_events (append-only)
-- One row per MEANINGFUL event: a lamp's condition changed, a maintenance ticket moved, or the lighting schedule was edited.
-- Repeated identical telemetry readings are never written here (the receiver only writes when the condition changes).
-- maintenance_history stays as it is: it is the per-ticket trail; this table is the per-streetlight trail and links back to the ticket.
CREATE TABLE streetlight_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL only for SCHEDULE_CHANGE, which applies to every streetlight.
  streetlight_id  TEXT             CHECK (streetlight_id ~ '^L-[0-9]{3}$'),
  -- The moment the event really happened (not when it was saved), so a delayed write keeps its original time.
  occurred_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  event_type      TEXT             NOT NULL CHECK (event_type IN ('STATUS_CHANGE', 'MAINTENANCE', 'SCHEDULE_CHANGE')),
  previous_status TEXT             CHECK (char_length(previous_status) <= 80),
  new_status      TEXT             NOT NULL CHECK (char_length(new_status) <= 80),
  -- What the node itself reported (e.g. LOW_LIGHT), kept next to the plain-language status for engineers.
  raw_status      TEXT             CHECK (char_length(raw_status) <= 24),
  -- NULL = no valid light measurement. 0 is a real reading and is stored as 0.
  lux             DOUBLE PRECISION CHECK (lux IS NULL OR lux >= 0),
  description     TEXT             NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 400),
  source          TEXT             NOT NULL CHECK (source IN ('DEVICE', 'TEST', 'SERVER', 'USER')),
  -- RESTRICT: a ticket that appears in the lamp history can never be deleted by accident.
  ticket_id       BIGINT           REFERENCES maintenance_tickets (id) ON DELETE RESTRICT,
  actor_id        BIGINT           REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT events_lamp_matches_type CHECK ((event_type = 'SCHEDULE_CHANGE') = (streetlight_id IS NULL)),
  CONSTRAINT events_ticket_only_maintenance CHECK (ticket_id IS NULL OR event_type = 'MAINTENANCE')
);
CREATE INDEX events_lamp_time_idx ON streetlight_events (streetlight_id, occurred_at DESC, id DESC);
CREATE INDEX events_time_idx      ON streetlight_events (occurred_at DESC, id DESC);
CREATE INDEX events_ticket_idx    ON streetlight_events (ticket_id) WHERE ticket_id IS NOT NULL;

-- History is a record, not a working table: rows cannot be changed or deleted, whatever the application does.
-- (The one allowed change is the database clearing actor_id if a user row is ever removed.)
CREATE FUNCTION streetlight_events_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
     AND (NEW.id, NEW.streetlight_id, NEW.occurred_at, NEW.event_type, NEW.previous_status, NEW.new_status, NEW.raw_status, NEW.lux, NEW.description, NEW.source, NEW.ticket_id, NEW.created_at)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.streetlight_id, OLD.occurred_at, OLD.event_type, OLD.previous_status, OLD.new_status, OLD.raw_status, OLD.lux, OLD.description, OLD.source, OLD.ticket_id, OLD.created_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'streetlight_events is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER streetlight_events_no_change BEFORE UPDATE OR DELETE ON streetlight_events FOR EACH ROW EXECUTE FUNCTION streetlight_events_guard();
-- TRUNCATE skips row triggers, so it gets its own guard (a statement-level one).
CREATE FUNCTION streetlight_events_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'streetlight_events is append-only (TRUNCATE not allowed)';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER streetlight_events_no_truncate BEFORE TRUNCATE ON streetlight_events FOR EACH STATEMENT EXECUTE FUNCTION streetlight_events_no_truncate();

-- ---------------------------------------------------------------- lighting_schedule (one row)
-- The ON/OFF times the website shows and uses to decide whether a silent node is simply asleep.
-- The lamps themselves still follow the times in the firmware (LoraIntegrated.ino / ScheduledRelay.ino): keep them equal.
CREATE TABLE lighting_schedule (
  id         SMALLINT    PRIMARY KEY CHECK (id = 1),
  on_time    TEXT        NOT NULL CHECK (on_time  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  off_time   TEXT        NOT NULL CHECK (off_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND off_time <> on_time),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT      REFERENCES users (id) ON DELETE SET NULL
);
-- Starting values = the gateway firmware's shift (lamps ON 18:00, OFF 05:30, Philippine time).
INSERT INTO lighting_schedule (id, on_time, off_time) VALUES (1, '18:00', '05:30');
