-- Phase 5, Step 3: the BASIC role (simplified, read-only dashboard). Requires 001_init.sql.
-- Never edit this file after it has been applied; add 004_*.sql instead.
--
-- 001 declared the role check inline, so PostgreSQL named it users_role_check. Replace it with one that also allows BASIC.
-- Existing accounts keep their roles; nobody is converted.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC'));
