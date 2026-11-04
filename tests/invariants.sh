#!/bin/bash
# Business rules of the Northwind ERP, checked against the live database.
# usage: tests/invariants.sh      (exit code = number of failed checks)
DIR="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
# check "<name>" "<SurrealQL returning one value>" "<expected substring of the output>"
check() {
  local out; out=$(WIDTH=400 "$DIR/q.sh" "$2" | tail -1)
  if [[ "$out" == *"$3"* ]]; then echo "ok   $1"; else echo "FAIL $1 — got: $out"; FAIL=$((FAIL+1)); fi
}

check "ledger balances (debits = credits)" \
  'RETURN math::sum((SELECT VALUE debit FROM journal_line)) - math::sum((SELECT VALUE credit FROM journal_line));' 'OK 0'
check "every posted entry balances" \
  'RETURN count((SELECT id FROM journal_entry WHERE status = "posted" AND math::sum((SELECT VALUE debit - credit FROM journal_line WHERE entry = $parent.id)) != 0));' 'OK 0'
check "no stock below zero" \
  'RETURN count((SELECT p FROM (SELECT product AS p, warehouse AS w, math::sum(qty) AS q FROM stock_move GROUP BY p, w) WHERE q < 0));' 'OK 0'
check "every shipped order issued its goods" \
  'RETURN count((SELECT id FROM sales_order WHERE status = "shipped" AND count((SELECT id FROM stock_move WHERE reference = $parent.number)) = 0 AND count((SELECT id FROM sales_order_line WHERE sales_order = $parent.id AND product.kind != "service")) > 0));' 'OK 0'
check "every received PO put goods in stock" \
  'RETURN count((SELECT id FROM purchase_order WHERE status = "received" AND count((SELECT id FROM stock_move WHERE reference = $parent.number AND kind = "receipt")) = 0));' 'OK 0'
check "every issued invoice is in the ledger" \
  'RETURN count((SELECT id FROM invoice WHERE status = "issued" AND count((SELECT id FROM journal_entry WHERE memo = "Invoice " + $parent.number)) = 0));' 'OK 0'
check "every invoice's paid total matches its payments" \
  'RETURN count((SELECT id FROM invoice WHERE paid_amount != math::sum((SELECT VALUE amount FROM payment WHERE invoice = $parent.id))));' 'OK 0'
check "every bill's paid total matches its payments" \
  'RETURN count((SELECT id FROM bill WHERE paid_amount != math::sum((SELECT VALUE amount FROM bill_payment WHERE bill = $parent.id))));' 'OK 0'
check "a payment can't be deleted" \
  'BEGIN; DELETE (SELECT VALUE id FROM payment LIMIT 1)[0]; CANCEL;' "can't be changed or deleted"
check "no invoice overpaid" \
  'RETURN count((SELECT id FROM invoice WHERE math::sum((SELECT VALUE amount FROM payment WHERE invoice = $parent.id)) > amount));' 'OK 0'

# Refusals: each scenario runs in a transaction that is cancelled, so nothing is left behind.
check "a shipped order can't go back to confirmed" \
  'BEGIN; UPDATE (SELECT VALUE id FROM sales_order WHERE status = "shipped" LIMIT 1)[0] SET status = "confirmed"; CANCEL;' 'must conform'
check "a posted journal entry can't be deleted" \
  'BEGIN; DELETE (SELECT VALUE id FROM journal_entry WHERE status = "posted" LIMIT 1)[0]; CANCEL;' "can't be deleted"
check "an unbalanced entry can't be posted" \
  'BEGIN; LET $je = (CREATE journal_entry SET memo = "test", status = "draft")[0].id; CREATE journal_line SET entry = $je, account = gl_account:a1000, debit = 500, credit = 0; UPDATE $je SET status = "posted"; CANCEL;' "doesn't balance"
check "a line can't be both debit and credit" \
  'BEGIN; CREATE journal_line SET entry = journal_entry:opening, account = gl_account:a1000, debit = 5, credit = 5; CANCEL;' 'must conform'
check "an issued invoice can't be deleted" \
  'BEGIN; DELETE (SELECT VALUE id FROM invoice WHERE status = "issued" LIMIT 1)[0]; CANCEL;' 'void it instead'
check "leave can't end before it starts" \
  'BEGIN; CREATE leave_request SET employee = employee:e001, starts_on = "2027-01-10", ends_on = "2027-01-05"; CANCEL;' 'must conform'

check "a department can't sit under its own sub-department" \
  'BEGIN; UPDATE department:operations SET parent = department:assembly; CANCEL;' "own sub-departments"
check "a department with people can't be deleted" \
  'BEGIN; DELETE department:assembly; CANCEL;' "still has employees"
check "every department except the top has a parent" \
  'RETURN count((SELECT id FROM department WHERE parent = NONE OR parent = NULL));' 'OK 1'

echo "$FAIL failed"
exit $FAIL
