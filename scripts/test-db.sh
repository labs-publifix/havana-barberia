#!/usr/bin/env bash
# Applies supabase/migrations + seed on a throwaway local Postgres and runs the
# RLS tests in supabase/tests/*.test.sql. Needs Postgres server binaries.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
DIR=$(mktemp -d)
PORT=${PGTEST_PORT:-54329}
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
# Postgres refuses to run as root: use the postgres system user when needed.
AS=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; AS=(runuser -u postgres --); fi
"${AS[@]}" "$BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start -w >/dev/null
export PGHOST=$DIR PGPORT=$PORT PGUSER=postgres
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
$PSQL -c 'create database test' >/dev/null
for f in supabase/tests/supabase-stub.sql supabase/migrations/*.sql supabase/seed.sql; do
  $PSQL -d test -f "$f" >/dev/null
done
for f in supabase/tests/*.test.sql; do
  echo "· $f"
  $PSQL -d test -f "$f"
done
echo "Base de datos OK"
