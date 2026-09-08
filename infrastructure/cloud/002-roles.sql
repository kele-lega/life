BEGIN;
REVOKE ALL ON SCHEMA life_cloud FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='life_cloud_app') THEN CREATE ROLE life_cloud_app NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='life_cloud_worker') THEN CREATE ROLE life_cloud_worker NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA life_cloud TO life_cloud_app, life_cloud_worker;
GRANT SELECT,INSERT,UPDATE ON life_cloud.accounts,life_cloud.sessions,life_cloud.auth_limits TO life_cloud_app;
GRANT SELECT,INSERT,UPDATE ON life_cloud.libraries,life_cloud.backups,life_cloud.backup_files,life_cloud.backup_parts,life_cloud.backup_verifications TO life_cloud_app;
GRANT SELECT,UPDATE ON life_cloud.backups,life_cloud.backup_files,life_cloud.backup_parts TO life_cloud_worker;
GRANT SELECT,INSERT ON life_cloud.backup_verifications TO life_cloud_worker;
GRANT SELECT ON life_cloud.schema_migrations TO life_cloud_app,life_cloud_worker;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['backups','backup_files','backup_parts','backup_verifications'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='life_cloud' AND tablename=name AND policyname='verification_worker') THEN
      EXECUTE format('CREATE POLICY verification_worker ON life_cloud.%I TO life_cloud_worker USING (true) WITH CHECK (true)', name);
    END IF;
  END LOOP;
END $$;
INSERT INTO life_cloud.schema_migrations(version) VALUES (2) ON CONFLICT DO NOTHING;
COMMIT;
-- These are NOLOGIN group roles by design. The migration does not require app/worker
-- connection strings to exist yet. After migrations, a DBA creates two DIFFERENT
-- restricted LOGIN roles and grants one group role to each through the secret manager.
-- Do not grant the worker role to the web login. No application role can delete snapshots.
