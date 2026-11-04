# Vantage 1.12.0

## Page row actions that open a form are in the API schema but fail when called
- **Wanted:** reuse the desktop's "Add line" / "Record payment" row actions from the web admin.
- **Tried:** a binder `row_actions` entry whose body calls a `kind: form` action (`let r = actions.add_order_line(row); …`) on a table served by `api/admin.yaml`.
- **Happened:** `/v1/schema` lists it and the generated client gets a typed method (`add_line(input: { product: string; qty?: number; … })`), but invoking it fails: `actions.add_order_line: action `add-order-line` is not exposed`. Nothing at load time says the action can't run over the API.
- **Workaround:** the web page writes the rows itself (`db.sales_order_lines.create(…)`, `db.payments.create(…)`); the database rules still apply.

## No cheap row count for a filtered collection
- **Wanted:** a count on a tab ("Shipped 670") without loading the rows.
- **Tried:** `useWindow(collection, 0, 1).length`, then `useCollection(collection).total`.
- **Happened:** the one-row window's `length` is the rows that arrived (it showed 2 everywhere); `total` is only exact once the whole collection has been sent, so counting a 670-row view loads up to 500 full rows with their computed columns (7–12 s on `sales_order`).
- **Workaround:** counts only on small worklist tabs.

## The skills' rollup pattern (`$parent.id` subquery) scans the whole child table on SurrealDB
- **Wanted:** order totals, stock on hand and account balances as `expr:` columns, as `vantage-persistence-surrealdb` and its helpdesk example show (`(SELECT VALUE count() FROM reply WHERE ticket = $parent.id GROUP ALL)`).
- **Tried:** `math::sum((SELECT VALUE amount FROM sales_order_line WHERE sales_order = $parent.id))` with an index on `sales_order_line.sales_order`.
- **Happened:** SurrealDB 3.2 doesn't use the index for a `$parent` predicate (`EXPLAIN FULL`: table scan, "pre_decode_filter: no (unsupported predicate)"). One page of sales orders took 6.1 s in the database on every run; the database itself doesn't cache. While those queries ran, writes queued behind them: web `flash` frames took up to 17.8 s and the `app` feed logged `audit entry not written … error=timed out`.
- **Workaround:** `REFERENCE` on the link fields and `math::sum(<~sales_order_line.amount)` / `<~invoice[WHERE status != 'void']` in the `expr:` columns: the same page takes 0.1 s, and the write delays and audit timeouts stopped. References are recorded only on write, so they must be declared before the data is loaded. Worth recommending in the SurrealDB skill.

## Slow queries measured in this project (SurrealDB 3.2.4, local Docker)
- **Wanted:** pages that open in well under a second over ~800 orders, ~2,000 order lines, ~4,000 stock movements.
- **Tried:** the `expr:` rollups above, then measured each layer: the query `preview_query` renders, run straight against SurrealDB over HTTP; the `api:admin` feed's `open_table … ms`; and `EXPLAIN FULL`.
- **Happened:**

  | What | Before (`$parent` subqueries) | After (`<~` references) |
  |---|---|---|
  | Query `preview_query` renders for `table("sales_order").where("status","shipped").sort("order_date","desc").limit(20)`, run in SurrealDB | 6,122 ms / 6,245 ms (two runs: no cache) | 96 ms for all 774 orders |
  | Same query with `LIMIT 20` added by hand | 244 ms | — |
  | Only the `total` column (`math::sum((SELECT VALUE amount FROM sales_order_line WHERE sales_order = $parent.id))`) over all orders | 2,211 ms | 96 ms (with `line_count` and `billing` too) |
  | Only `billing` (`count((SELECT id FROM invoice WHERE sales_order = $parent.id AND status != 'void'))`) | 802 ms | (included above) |
  | Dotted columns (`customer.name`, `warehouse.name`, `sales_rep.name`) over all orders | 87 ms | 87 ms |
  | Invoices filtered by computed `state = 'overdue'` (sum of payments per invoice) | 427–475 ms | 7 ms (stored `paid_amount`) |
  | `api:admin` feed, `open_table sales_orders` window 0–20 | 3,014 ms alone, 8,290 ms with other opens queued | 64–125 ms |
  | `api:admin` feed, the same collection unwindowed (500 rows, used for counts) | 7,300–11,787 ms | not used any more |
  | `api:admin` feed, `flash bill_payments` (each payment of a payment run, in sequence) | 82 ms, 5,041 ms, 17,769 ms; `audit entry not written … timed out` | no timeouts since |

  `preview_query` renders no `LIMIT` for `.limit(20)`; the 3 s windowed `open_table` (between the 0.24 s limited and 6.1 s unlimited database times) suggests the window isn't pushed down as `LIMIT` either. The `EXPLAIN FULL` of the subquery shows a table scan with "pre_decode_filter: no (unsupported predicate)" despite the index on `sales_order_line.sales_order`.
- **Workaround:** record references for every parent→child rollup, and a stored running total where a filter needs it.
- **Benchmark** (`docs/benchmark.md`, script `bench/bench.py`; same synthetic data and indexes, row counts checked equal; engine-reported median ms). "Totals for every order":

  | Orders | SurrealDB `$parent` subquery | SurrealDB `<~` references | PostgreSQL 17 | SQLite 3.53 |
  |---:|---:|---:|---:|---:|
  | 1,000 | 4,088 | 15.6 | 2.2 | 1.0 |
  | 4,000 | 67,230 | 63.2 | 13.9 | 4.8 |
  | 10,000 | not run (minutes) | 151.3 | 28.4 | 11.1 |

  A 40-row page with totals: `$parent` 166 → 666 → 1,484 ms as the table grows; references ~2 ms flat; PostgreSQL 0.2–0.3 ms. The `$parent` form is quadratic, references make it linear, and the relational engines stay 5–15× ahead with a plain correlated subquery. Suggest the SurrealDB skill recommend `REFERENCE` + `<~` for rollups and warn about `$parent`.

## A dotted column can't be sorted
- **Wanted:** sort a list of orders by customer name.
- **Tried:** `.sort("customer.name", "asc")` (and the same from the web client).
- **Happened:** ``Step can't be applied (step: Sort { col: "customer.name", … }): Column is not orderable``; the API still lists `customer.name` under `sortable` in `/v1/schema`.
- **Workaround:** an `expr:` alias column `customer_name: 'surreal::expr("customer.name")'`, which sorts.
