#!/bin/sh
set -eu

host="${POSTGRES_HOST:-postgres}"
user="${POSTGRES_USER:-postgres}"
db="${POSTGRES_DB:-life_cloud}"
export PGPASSWORD="${POSTGRES_PASSWORD:?postgres password required}"

i=0
until psql -h "$host" -U "$user" -d "$db" -c 'SELECT 1' >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "postgres was not ready"
    exit 1
  fi
  sleep 1
done

for file in 001-foundation.sql 002-roles.sql 003-immutable-snapshots.sql 004-replica.sql; do
  psql -v ON_ERROR_STOP=1 -h "$host" -U "$user" -d "$db" -f "/sql/$file"
done

psql -v ON_ERROR_STOP=1 -h "$host" -U "$user" -d "$db" \
  -v app_password="${CLOUD_APP_PASSWORD:?}" \
  -v worker_password="${CLOUD_WORKER_PASSWORD:?}" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='life_cloud_app_login') THEN
    CREATE ROLE life_cloud_app_login LOGIN INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='life_cloud_worker_login') THEN
    CREATE ROLE life_cloud_worker_login LOGIN INHERIT;
  END IF;
END $$;
ALTER ROLE life_cloud_app_login PASSWORD :'app_password';
ALTER ROLE life_cloud_worker_login PASSWORD :'worker_password';
GRANT life_cloud_app TO life_cloud_app_login;
GRANT life_cloud_worker TO life_cloud_worker_login;
GRANT CONNECT ON DATABASE life_cloud TO life_cloud_app_login, life_cloud_worker_login;
SQL

echo "Cloud schema and restricted logins are ready."
