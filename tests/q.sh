#!/bin/bash
# Run SurrealQL against the project's database and print one line per statement.
# usage: tests/q.sh 'SELECT ...'   or   tests/q.sh @file.surql
# Target: SURREAL_HTTP (CI: http://127.0.0.1:8000), else the local compose stack's published port.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${SURREAL_HTTP:-}" ]; then
  P="${ERP_COMPOSE_PROJECT:-vantage-dev-erp-vg-609e1c378d25b9b8}"
  SURREAL_HTTP="http://127.0.0.1:$(docker compose -p "$P" -f "$DIR/composer.yaml" port surrealdb 8000 | cut -d: -f2)"
fi
curl -s -X POST "$SURREAL_HTTP/sql" -u root:root -H "Accept: application/json" \
  -H "surreal-ns: app" -H "surreal-db: app" --data-binary "$1" |
  python3 -c 'import json,sys
d=json.load(sys.stdin)
if not isinstance(d,list): print(d); sys.exit(1)
for r in d: print(r["status"], json.dumps(r["result"])[:int(sys.argv[1])])' "${WIDTH:-600}"
