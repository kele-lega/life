-- Phase 16A infrastructure only. No live Moment/Diary/LifeEvent cloud tables.
BEGIN;
CREATE SCHEMA IF NOT EXISTS life_cloud;
CREATE TABLE IF NOT EXISTS life_cloud.schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS life_cloud.accounts (
  id uuid PRIMARY KEY, auth_provider text NOT NULL, auth_subject text NOT NULL,
  email text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (auth_provider, auth_subject)
);
CREATE TABLE IF NOT EXISTS life_cloud.sessions (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES life_cloud.accounts(id), token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS life_cloud.auth_limits (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts > 0)
);
CREATE TABLE IF NOT EXISTS life_cloud.libraries (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES life_cloud.accounts(id), installation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,id)
);
CREATE TABLE IF NOT EXISTS life_cloud.backups (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES life_cloud.accounts(id), library_id uuid NOT NULL,
  manifest_bytes bytea NOT NULL, manifest_sha256 text NOT NULL CHECK(length(manifest_sha256)=64),
  format_version integer NOT NULL CHECK(format_version=1), dexie_version integer NOT NULL CHECK(dexie_version=6),
  captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','verifying','complete','failed')),
  total_bytes bigint NOT NULL CHECK(total_bytes>=0), table_counts jsonb NOT NULL,
  error_code text, manifest_object_version text,
  lease_token uuid, lease_until timestamptz, UNIQUE(account_id,id),
  FOREIGN KEY(account_id,library_id) REFERENCES life_cloud.libraries(account_id,id)
);
CREATE INDEX IF NOT EXISTS backups_account_time ON life_cloud.backups(account_id,received_at DESC);
CREATE TABLE IF NOT EXISTS life_cloud.backup_files (
  account_id uuid NOT NULL, backup_id uuid NOT NULL, path text NOT NULL,
  table_name text, byte_length bigint NOT NULL CHECK(byte_length>=0), sha256 text NOT NULL CHECK(length(sha256)=64),
  verified boolean NOT NULL DEFAULT false, PRIMARY KEY(account_id,backup_id,path),
  FOREIGN KEY(account_id,backup_id) REFERENCES life_cloud.backups(account_id,id)
);
CREATE TABLE IF NOT EXISTS life_cloud.backup_parts (
  account_id uuid NOT NULL, backup_id uuid NOT NULL, path text NOT NULL, part_index integer NOT NULL CHECK(part_index>=0),
  object_key text NOT NULL UNIQUE, byte_length integer NOT NULL CHECK(byte_length BETWEEN 0 AND 4194304),
  sha256 text NOT NULL CHECK(length(sha256)=64), object_version text, verified boolean NOT NULL DEFAULT false,
  PRIMARY KEY(account_id,backup_id,path,part_index),
  FOREIGN KEY(account_id,backup_id,path) REFERENCES life_cloud.backup_files(account_id,backup_id,path)
);
CREATE TABLE IF NOT EXISTS life_cloud.backup_verifications (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, backup_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('upload','restore','replica')), validator_version text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(), result jsonb NOT NULL,
  FOREIGN KEY(account_id,backup_id) REFERENCES life_cloud.backups(account_id,id)
);

-- Web traffic uses tenant transactions. A separate worker/migration role owns this schema;
-- the runtime role must be non-owner, non-superuser and have no BYPASSRLS permission.
ALTER TABLE life_cloud.libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.backup_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.backup_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.backup_verifications ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['libraries','backups','backup_files','backup_parts','backup_verifications'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='life_cloud' AND tablename=name AND policyname='account_scope') THEN
      EXECUTE format('CREATE POLICY account_scope ON life_cloud.%I USING (account_id::text = current_setting(''life.account_id'', true)) WITH CHECK (account_id::text = current_setting(''life.account_id'', true))', name);
    END IF;
  END LOOP;
END $$;
INSERT INTO life_cloud.schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
COMMIT;
