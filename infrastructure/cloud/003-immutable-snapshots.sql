BEGIN;
CREATE OR REPLACE FUNCTION life_cloud.guard_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.status='complete' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'immutable_backup';
  END IF;
  IF (NEW.id,NEW.account_id,NEW.library_id,NEW.manifest_bytes,NEW.manifest_sha256,NEW.format_version,NEW.dexie_version,NEW.captured_at,NEW.received_at,NEW.total_bytes,NEW.table_counts)
    IS DISTINCT FROM
    (OLD.id,OLD.account_id,OLD.library_id,OLD.manifest_bytes,OLD.manifest_sha256,OLD.format_version,OLD.dexie_version,OLD.captured_at,OLD.received_at,OLD.total_bytes,OLD.table_counts) THEN
    RAISE EXCEPTION 'immutable_manifest';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION life_cloud.guard_verified_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.verified AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'immutable_verified_object'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER snapshot_immutable BEFORE UPDATE ON life_cloud.backups FOR EACH ROW EXECUTE FUNCTION life_cloud.guard_snapshot();
CREATE OR REPLACE TRIGGER verified_file_immutable BEFORE UPDATE ON life_cloud.backup_files FOR EACH ROW EXECUTE FUNCTION life_cloud.guard_verified_file();
CREATE OR REPLACE TRIGGER verified_part_immutable BEFORE UPDATE ON life_cloud.backup_parts FOR EACH ROW EXECUTE FUNCTION life_cloud.guard_verified_file();
INSERT INTO life_cloud.schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING;
COMMIT;
