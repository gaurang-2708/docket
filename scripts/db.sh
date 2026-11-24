#!/usr/bin/env bash
# Manage the local Postgres cluster used by Docket. Reads settings from .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="${PGDATA_DIR:-./.pgdata}"
PORT="${PG_PORT:-54332}"
case "${1:-}" in
  init)
    if [ -f "$DIR/PG_VERSION" ]; then echo "Cluster already exists at $DIR"; else
      "$BIN/initdb" -D "$DIR" -U docket --auth=trust -E UTF8 >/dev/null; fi
    "$0" start
    "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U docket docket 2>/dev/null || echo "Database docket already exists"
    ;;
  start)
    "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT" -q && { echo "Postgres already running on $PORT"; exit 0; }
    "$BIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -w start
    ;;
  stop) "$BIN/pg_ctl" -D "$DIR" -m fast stop ;;
  *) echo "usage: db.sh init|start|stop"; exit 1 ;;
esac
