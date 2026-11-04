#!/bin/bash
# Rebuild the database from scratch: drop every table, load the schema, then the seed.
# usage: tests/load.sh            (regenerates seed.surql first)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
python3 -I "$DIR/gen_seed.py" > "$DIR/seed.surql"
WIPE="USE NS app DB app;"
for t in journal_line journal_entry payment invoice bill_payment bill sales_order_line sales_order \
         purchase_order_line purchase_order work_order stock_move bom_line opportunity leave_request \
         product product_category warehouse customer supplier employee department gl_account; do
  WIPE="$WIPE REMOVE TABLE IF EXISTS $t;"
done
for s in seq_so seq_po seq_inv seq_bill seq_wo seq_je seq_opp; do WIPE="$WIPE REMOVE SEQUENCE IF EXISTS $s;"; done
"$DIR/q.sh" "$WIPE" | grep -v '^OK' || true
"$DIR/q.sh" "@$DIR/schema.surql" | grep -v '^OK' || true
# The server refuses requests over 1 MB: send the seed (one statement per line) in chunks, in order.
CHUNKS=$(mktemp -d)
split -l 1500 "$DIR/seed.surql" "$CHUNKS/part_"
for f in "$CHUNKS"/part_*; do
  WIDTH=300 "$DIR/q.sh" "@$f" | grep -v '^OK' || true
done | sort | uniq -c | head -20
rm -rf "$CHUNKS"
echo "loaded"
