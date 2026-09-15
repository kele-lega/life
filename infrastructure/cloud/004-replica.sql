BEGIN;

CREATE TABLE IF NOT EXISTS life_cloud.replica_writers (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  library_id uuid,
  installation_id uuid,
  epoch integer NOT NULL CHECK (epoch >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  fenced_at timestamptz,
  UNIQUE (account_id, id)
);

CREATE TABLE IF NOT EXISTS life_cloud.replica_state (
  account_id uuid PRIMARY KEY REFERENCES life_cloud.accounts(id),
  writer_id uuid NOT NULL,
  epoch integer NOT NULL CHECK (epoch >= 1),
  head_commit_seq bigint NOT NULL DEFAULT 0 CHECK (head_commit_seq >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, writer_id) REFERENCES life_cloud.replica_writers(account_id, id)
);

CREATE TABLE IF NOT EXISTS life_cloud.replica_mutations (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  mutation_id uuid NOT NULL,
  writer_id uuid NOT NULL,
  epoch integer NOT NULL,
  payload_sha256 text NOT NULL CHECK (length(payload_sha256)=64),
  payload jsonb NOT NULL,
  commit_seq bigint NOT NULL CHECK (commit_seq > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, mutation_id),
  UNIQUE (account_id, commit_seq)
);

CREATE TABLE IF NOT EXISTS life_cloud.replica_objects (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  object_key text NOT NULL UNIQUE,
  attachment_id text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256)=64),
  byte_length bigint NOT NULL CHECK (byte_length >= 0 AND byte_length <= 33554432),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, object_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS replica_objects_verified_attachment
  ON life_cloud.replica_objects(account_id, attachment_id, sha256)
  WHERE verified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS life_cloud.replica_moments (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS life_cloud.replica_moment_appends (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS life_cloud.replica_attachments (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS life_cloud.replica_diaries (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS life_cloud.replica_life_events (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS life_cloud.replica_jobs (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS life_cloud.replica_proposals (
  account_id uuid NOT NULL REFERENCES life_cloud.accounts(id),
  id text NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE OR REPLACE FUNCTION life_cloud.guard_replica_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable_replica_mutation';
END $$;
DROP TRIGGER IF EXISTS replica_mutations_immutable ON life_cloud.replica_mutations;
CREATE TRIGGER replica_mutations_immutable BEFORE UPDATE OR DELETE ON life_cloud.replica_mutations
  FOR EACH ROW EXECUTE FUNCTION life_cloud.guard_replica_mutation();

CREATE OR REPLACE FUNCTION life_cloud.guard_verified_replica_object() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.verified_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'immutable_verified_object';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS replica_objects_verified_immutable ON life_cloud.replica_objects;
CREATE TRIGGER replica_objects_verified_immutable BEFORE UPDATE ON life_cloud.replica_objects
  FOR EACH ROW EXECUTE FUNCTION life_cloud.guard_verified_replica_object();

ALTER TABLE life_cloud.replica_writers ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_moment_appends ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_life_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_cloud.replica_proposals ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY[
    'replica_writers','replica_state','replica_mutations','replica_objects',
    'replica_moments','replica_moment_appends','replica_attachments','replica_diaries',
    'replica_life_events','replica_jobs','replica_proposals'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='life_cloud' AND tablename=name AND policyname='account_scope') THEN
      EXECUTE format(
        'CREATE POLICY account_scope ON life_cloud.%I USING (account_id::text = current_setting(''life.account_id'', true)) WITH CHECK (account_id::text = current_setting(''life.account_id'', true))',
        name
      );
    END IF;
  END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE ON
  life_cloud.replica_writers, life_cloud.replica_state, life_cloud.replica_objects,
  life_cloud.replica_moments, life_cloud.replica_moment_appends, life_cloud.replica_attachments,
  life_cloud.replica_diaries, life_cloud.replica_life_events, life_cloud.replica_jobs, life_cloud.replica_proposals
  TO life_cloud_app;
GRANT SELECT,INSERT ON life_cloud.replica_mutations TO life_cloud_app;

INSERT INTO life_cloud.schema_migrations(version) VALUES (4) ON CONFLICT DO NOTHING;
COMMIT;
