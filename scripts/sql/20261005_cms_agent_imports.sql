-- Backend-owned additive migration. Apply deliberately using the database owner.
-- Do not run prisma db push/migrate with the CMS's partial Prisma schema.
BEGIN;
CREATE SCHEMA IF NOT EXISTS cms_agent_private;
REVOKE ALL ON SCHEMA cms_agent_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS cms_agent_private.imports (
  id uuid PRIMARY KEY, actor text NOT NULL, hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 150000),
  state text NOT NULL DEFAULT 'PREPARED' CHECK (state IN ('PREPARED','DRAFT','APPROVED','DISCARDED')),
  operation_id uuid, receipt jsonb, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by text,
  UNIQUE (actor, operation_id), CHECK ((operation_id IS NULL) = (receipt IS NULL))
);
CREATE TABLE IF NOT EXISTS cms_agent_private.drafts (
  ref text PRIMARY KEY CHECK (length(ref) <= 400), revision uuid NOT NULL,
  content jsonb NOT NULL CHECK (octet_length(content::text) <= 80000),
  base_version text NOT NULL CHECK (base_version ~ '^[a-f0-9]{64}$'),
  actor text NOT NULL, import_id uuid NOT NULL REFERENCES cms_agent_private.imports(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imports_pending ON cms_agent_private.imports (created_at DESC) WHERE state = 'DRAFT';
CREATE INDEX IF NOT EXISTS drafts_import ON cms_agent_private.drafts (import_id);
ALTER TABLE cms_agent_private.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_agent_private.drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA cms_agent_private FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA cms_agent_private FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA cms_agent_private FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
