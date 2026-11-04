-- Northwind ERP schema and business rules. Idempotent: re-run with OVERWRITE to change a rule.
-- Money is stored as integer cents. Dates are datetimes.
DEFINE NAMESPACE IF NOT EXISTS app; USE NS app; DEFINE DATABASE IF NOT EXISTS app; USE NS app DB app;

-- Date fields accept datetimes and text ("2026-12-03", "2026-12-03 10:00:00", RFC 3339): app scripts send text.
-- They carry no TYPE clause because the type check runs before VALUE; fn::dt rejects text that isn't a date.
DEFINE FUNCTION OVERWRITE fn::dt($v: any) {
    IF !type::is_string($v) { RETURN $v; };
    IF $v = "" { RETURN NONE; };
    LET $s = string::replace($v, " ", "T");
    RETURN IF string::len($s) = 19 THEN <datetime>($s + "Z") ELSE <datetime>$s END;
};

-- Compact money label for dashboards from cents: $8.56M, $824K, $950. Integer maths only
-- (a float cast to string prints a trailing "f").
DEFINE FUNCTION OVERWRITE fn::usd($c: any) {
    LET $a = <int> math::abs($c ?? 0);
    LET $s = IF $a >= 100000000 {
        LET $h = <int> math::floor($a / 1000000);
        string::concat("$", <string> <int> math::floor($h / 100), ".", IF $h % 100 < 10 { "0" } ELSE { "" }, <string> ($h % 100), "M")
    } ELSE IF $a >= 100000 {
        string::concat("$", <string> <int> math::round($a / 100000), "K")
    } ELSE {
        string::concat("$", <string> <int> math::round($a / 100))
    };
    RETURN IF ($c ?? 0) < 0 { "−" + $s } ELSE { $s };
};

-- Link fields carry REFERENCE so a parent can reach its children with `<~child` (an indexed lookup).
-- A subquery like `(SELECT … FROM child WHERE parent = $parent.id)` doesn't use the index in SurrealDB 3.2 and
-- scans the whole child table for every parent row (measured: 6 s for one page of sales orders).
-- References are only recorded on write, so they must be declared before the data is loaded.

-- ───────────── Number ranges ─────────────
DEFINE SEQUENCE IF NOT EXISTS seq_so START 10001;
DEFINE SEQUENCE IF NOT EXISTS seq_po START 40001;
DEFINE SEQUENCE IF NOT EXISTS seq_inv START 90001;
DEFINE SEQUENCE IF NOT EXISTS seq_bill START 70001;
DEFINE SEQUENCE IF NOT EXISTS seq_wo START 60001;
DEFINE SEQUENCE IF NOT EXISTS seq_je START 100001;
DEFINE SEQUENCE IF NOT EXISTS seq_opp START 501;

-- ───────────── Audit log (written by Vantage, application.yaml log_changes) ─────────────
DEFINE TABLE IF NOT EXISTS audit_event SCHEMALESS;
DEFINE INDEX IF NOT EXISTS audit_at ON audit_event FIELDS at;

-- ───────────── Organisation & HR ─────────────
DEFINE TABLE IF NOT EXISTS department SCHEMALESS;
DEFINE FIELD OVERWRITE name ON department TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE cost_center ON department TYPE string;
-- Org structure: each department sits under a parent (none for the top). Empty is NONE or NULL (forms send NULL).
DEFINE FIELD OVERWRITE parent ON department TYPE none | null | record<department>
    ASSERT $value = NONE OR $value = NULL OR $value != id;
DEFINE FIELD OVERWRITE head ON department TYPE none | null | record<employee>;
DEFINE FIELD OVERWRITE rank ON department TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE budget ON department TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE INDEX IF NOT EXISTS department_parent ON department FIELDS parent;
-- No loops: a department can't be placed under one of its own sub-departments (checked 8 levels up).
DEFINE EVENT OVERWRITE dept_no_cycle ON TABLE department
    WHEN $event IN ["CREATE", "UPDATE"] AND $after.parent != NONE AND $after.parent != NULL THEN {
    LET $p = $after.parent;
    IF [$p, $p.parent, $p.parent.parent, $p.parent.parent.parent, $p.parent.parent.parent.parent,
        $p.parent.parent.parent.parent.parent, $p.parent.parent.parent.parent.parent.parent,
        $p.parent.parent.parent.parent.parent.parent.parent] CONTAINS $after.id {
        THROW $after.name + " can't be placed under one of its own sub-departments";
    };
};
DEFINE EVENT OVERWRITE dept_delete ON TABLE department WHEN $event = "DELETE" THEN {
    IF count((SELECT id FROM department WHERE parent = $before.id)) > 0 { THROW $before.name + " still has sub-departments; move or delete them first"; };
    IF count((SELECT id FROM employee WHERE department = $before.id)) > 0 { THROW $before.name + " still has employees; move them first"; };
};

DEFINE TABLE IF NOT EXISTS employee SCHEMALESS;
DEFINE FIELD OVERWRITE name ON employee TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE email ON employee TYPE string ASSERT string::is_email($value);
DEFINE FIELD OVERWRITE department ON employee TYPE record<department> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE salary ON employee TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE status ON employee TYPE string DEFAULT "active" ASSERT $value IN ["active", "on_leave", "terminated"];
DEFINE FIELD OVERWRITE hired_on ON employee VALUE fn::dt($value);
DEFINE INDEX IF NOT EXISTS employee_email ON employee FIELDS email UNIQUE;

DEFINE TABLE IF NOT EXISTS leave_request SCHEMALESS;
DEFINE FIELD OVERWRITE employee ON leave_request TYPE record<employee>;
DEFINE FIELD OVERWRITE kind ON leave_request TYPE string DEFAULT "vacation" ASSERT $value IN ["vacation", "sick", "personal", "parental"];
DEFINE FIELD OVERWRITE starts_on ON leave_request VALUE fn::dt($value);
DEFINE FIELD OVERWRITE ends_on ON leave_request VALUE fn::dt($value) ASSERT $value >= fn::dt(starts_on);
DEFINE FIELD OVERWRITE requested_on ON leave_request DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE status ON leave_request TYPE string DEFAULT "pending" ASSERT $value IN ["pending", "approved", "rejected"];
DEFINE INDEX IF NOT EXISTS leave_employee ON leave_request FIELDS employee;

-- ───────────── Business partners ─────────────
DEFINE TABLE IF NOT EXISTS customer SCHEMALESS;
DEFINE FIELD OVERWRITE name ON customer TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE segment ON customer TYPE string DEFAULT "smb" ASSERT $value IN ["enterprise", "smb", "public", "retail"];
DEFINE FIELD OVERWRITE credit_limit ON customer TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE payment_terms ON customer TYPE int DEFAULT 30 ASSERT $value IN [0, 15, 30, 45, 60];
DEFINE FIELD OVERWRITE status ON customer TYPE string DEFAULT "active" ASSERT $value IN ["active", "blocked"];
DEFINE FIELD OVERWRITE since ON customer DEFAULT time::now() VALUE fn::dt($value);

DEFINE TABLE IF NOT EXISTS supplier SCHEMALESS;
DEFINE FIELD OVERWRITE name ON supplier TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE payment_terms ON supplier TYPE int DEFAULT 30 ASSERT $value IN [0, 15, 30, 45, 60];
DEFINE FIELD OVERWRITE rating ON supplier TYPE int DEFAULT 3 ASSERT $value >= 1 AND $value <= 5;

-- ───────────── Materials & warehouses ─────────────
DEFINE TABLE IF NOT EXISTS product_category SCHEMALESS;
DEFINE FIELD OVERWRITE name ON product_category TYPE string;

DEFINE TABLE IF NOT EXISTS product SCHEMALESS;
DEFINE FIELD OVERWRITE sku ON product TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE name ON product TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE kind ON product TYPE string DEFAULT "finished" ASSERT $value IN ["finished", "raw", "trading", "service"];
DEFINE FIELD OVERWRITE uom ON product TYPE string DEFAULT "pcs" ASSERT $value IN ["pcs", "m", "kg", "l", "set", "hr"];
DEFINE FIELD OVERWRITE cost_price ON product TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE sale_price ON product TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE reorder_level ON product TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE active ON product TYPE bool DEFAULT true;
DEFINE INDEX IF NOT EXISTS product_sku ON product FIELDS sku UNIQUE;

DEFINE TABLE IF NOT EXISTS warehouse SCHEMALESS;
DEFINE FIELD OVERWRITE code ON warehouse TYPE string;
DEFINE FIELD OVERWRITE name ON warehouse TYPE string;

-- Every quantity change is a movement; stock on hand is their sum (never stored).
DEFINE TABLE IF NOT EXISTS stock_move SCHEMALESS;
DEFINE FIELD OVERWRITE product ON stock_move TYPE record<product> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE warehouse ON stock_move TYPE record<warehouse> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE qty ON stock_move TYPE int ASSERT $value != 0;
DEFINE FIELD OVERWRITE kind ON stock_move TYPE string DEFAULT "adjustment" ASSERT $value IN ["opening", "receipt", "issue", "production", "consumption", "adjustment"];
DEFINE FIELD OVERWRITE moved_at ON stock_move DEFAULT time::now() VALUE fn::dt($value);
DEFINE INDEX IF NOT EXISTS move_product ON stock_move FIELDS product;
DEFINE INDEX IF NOT EXISTS move_warehouse ON stock_move FIELDS warehouse;

DEFINE TABLE IF NOT EXISTS bom_line SCHEMALESS;
DEFINE FIELD OVERWRITE product ON bom_line TYPE record<product> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE component ON bom_line TYPE record<product> ASSERT $value != product;
DEFINE FIELD OVERWRITE qty ON bom_line TYPE int DEFAULT 1 ASSERT $value > 0;
DEFINE INDEX IF NOT EXISTS bom_product ON bom_line FIELDS product;

-- ───────────── Finance master data ─────────────
DEFINE TABLE IF NOT EXISTS gl_account SCHEMALESS;
DEFINE FIELD OVERWRITE code ON gl_account TYPE string;
DEFINE FIELD OVERWRITE name ON gl_account TYPE string;
DEFINE FIELD OVERWRITE kind ON gl_account TYPE string ASSERT $value IN ["asset", "liability", "equity", "revenue", "expense"];

DEFINE TABLE IF NOT EXISTS journal_entry SCHEMALESS;
DEFINE FIELD OVERWRITE number ON journal_entry TYPE string VALUE IF $value THEN $value ELSE "JE-" + <string>sequence::nextval("seq_je") END;
DEFINE FIELD OVERWRITE posted_on ON journal_entry DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE source ON journal_entry TYPE string DEFAULT "manual" ASSERT $value IN ["manual", "sales", "purchasing", "inventory", "payroll", "opening"];
DEFINE FIELD OVERWRITE status ON journal_entry TYPE string DEFAULT "draft" ASSERT $value IN ["draft", "posted"];
DEFINE INDEX IF NOT EXISTS je_posted ON journal_entry FIELDS posted_on;

DEFINE TABLE IF NOT EXISTS journal_line SCHEMALESS;
DEFINE FIELD OVERWRITE entry ON journal_line TYPE record<journal_entry> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE account ON journal_line TYPE record<gl_account> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE debit ON journal_line TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE credit ON journal_line TYPE int DEFAULT 0 ASSERT $value >= 0 AND ($value = 0 OR debit = 0);
DEFINE INDEX IF NOT EXISTS jl_entry ON journal_line FIELDS entry;
DEFINE INDEX IF NOT EXISTS jl_account ON journal_line FIELDS account;

-- A posted entry must balance, and stays posted.
DEFINE EVENT OVERWRITE je_guard ON TABLE journal_entry WHEN $event = "UPDATE" AND $after.status = "posted" AND $before.status = "draft" THEN {
    LET $d = math::sum((SELECT VALUE debit FROM journal_line WHERE entry = $after.id));
    LET $c = math::sum((SELECT VALUE credit FROM journal_line WHERE entry = $after.id));
    IF $d != $c OR $d = 0 { THROW "Entry " + $after.number + " doesn't balance: debits " + <string>$d + " ≠ credits " + <string>$c; };
};
DEFINE EVENT OVERWRITE je_locked ON TABLE journal_entry WHEN $event = "UPDATE" AND $before.status = "posted" AND ($after.status != "posted" OR $after.posted_on != $before.posted_on) THEN {
    THROW "Entry " + $before.number + " is posted and can't be changed; post a reversing entry instead";
};
-- The lines of a posted entry are locked too, or the ledger would stop balancing.
DEFINE EVENT OVERWRITE jl_locked ON TABLE journal_line WHEN $event IN ["CREATE", "UPDATE", "DELETE"] THEN {
    IF $before.entry.status = "posted" OR $after.entry.status = "posted" {
        THROW "Lines of a posted entry can't be changed; post a reversing entry instead";
    };
};
DEFINE EVENT OVERWRITE je_cascade ON TABLE journal_entry WHEN $event = "DELETE" THEN {
    IF $before.status = "posted" { THROW "Posted entries can't be deleted; post a reversing entry instead"; };
    DELETE journal_line WHERE entry = $before.id;
};
DEFINE EVENT OVERWRITE jl_touch ON TABLE journal_line WHEN $event IN ["CREATE", "UPDATE", "DELETE"] THEN {
    UPDATE (IF $event = "DELETE" THEN $before.entry ELSE $after.entry END) SET deps_last_updated = time::now();
};

-- Helper: post a balanced two-line entry.
DEFINE FUNCTION OVERWRITE fn::post($date: datetime, $memo: string, $source: string, $dr: string, $cr: string, $amount: int) {
    IF $amount <= 0 { RETURN NONE; };
    LET $je = (CREATE journal_entry SET posted_on = $date, memo = $memo, source = $source, status = "draft")[0].id;
    -- Account record keys are "a" + code (text keys: Vantage can't read numeric record ids).
    CREATE journal_line SET entry = $je, account = type::record("gl_account", "a" + $dr), debit = $amount, credit = 0;
    CREATE journal_line SET entry = $je, account = type::record("gl_account", "a" + $cr), debit = 0, credit = $amount;
    UPDATE $je SET status = "posted";
    RETURN $je;
};

-- ───────────── CRM ─────────────
DEFINE TABLE IF NOT EXISTS opportunity SCHEMALESS;
DEFINE FIELD OVERWRITE number ON opportunity TYPE string VALUE IF $value THEN $value ELSE "OPP-" + <string>sequence::nextval("seq_opp") END;
DEFINE FIELD OVERWRITE title ON opportunity TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE customer ON opportunity TYPE record<customer>;
DEFINE FIELD OVERWRITE stage ON opportunity TYPE string DEFAULT "lead" ASSERT $value IN ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
DEFINE FIELD OVERWRITE value ON opportunity TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE probability ON opportunity TYPE int DEFAULT 10 ASSERT $value >= 0 AND $value <= 100;
DEFINE FIELD OVERWRITE created_at ON opportunity DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE expected_close ON opportunity VALUE fn::dt($value);

-- ───────────── Sales (order to cash) ─────────────
DEFINE TABLE IF NOT EXISTS sales_order SCHEMALESS;
DEFINE FIELD OVERWRITE number ON sales_order TYPE string VALUE IF $value THEN $value ELSE "SO-" + <string>sequence::nextval("seq_so") END;
DEFINE FIELD OVERWRITE customer ON sales_order TYPE record<customer> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE warehouse ON sales_order TYPE record<warehouse> DEFAULT warehouse:main;
DEFINE FIELD OVERWRITE order_date ON sales_order DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE status ON sales_order TYPE string DEFAULT "draft"
    ASSERT $value IN ["draft", "confirmed", "shipped", "cancelled"]
       AND ($before != "shipped" OR $value = "shipped")
       AND ($before != "cancelled" OR $value = "cancelled");
DEFINE FIELD OVERWRITE requested_on ON sales_order VALUE fn::dt($value);
DEFINE FIELD OVERWRITE shipped_on ON sales_order VALUE fn::dt($value);
DEFINE INDEX IF NOT EXISTS so_customer ON sales_order FIELDS customer;
DEFINE INDEX IF NOT EXISTS so_date ON sales_order FIELDS order_date;

DEFINE TABLE IF NOT EXISTS sales_order_line SCHEMALESS;
DEFINE FIELD OVERWRITE sales_order ON sales_order_line TYPE record<sales_order> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE product ON sales_order_line TYPE record<product>;
DEFINE FIELD OVERWRITE qty ON sales_order_line TYPE int DEFAULT 1 ASSERT $value > 0;
DEFINE FIELD OVERWRITE unit_price ON sales_order_line TYPE int VALUE IF $value THEN $value ELSE product.sale_price END;
DEFINE FIELD OVERWRITE discount_pct ON sales_order_line TYPE int DEFAULT 0 ASSERT $value >= 0 AND $value <= 100;
-- COMPUTED: fields are processed alphabetically, so a VALUE on `amount` would run before `qty`.
DEFINE FIELD OVERWRITE amount ON sales_order_line COMPUTED math::round(qty * unit_price * (100 - discount_pct) / 100);
DEFINE INDEX IF NOT EXISTS sol_order ON sales_order_line FIELDS sales_order;
DEFINE INDEX IF NOT EXISTS sol_product ON sales_order_line FIELDS product;

DEFINE EVENT OVERWRITE sol_touch ON TABLE sales_order_line WHEN $event IN ["CREATE", "UPDATE", "DELETE"] THEN {
    UPDATE (IF $event = "DELETE" THEN $before.sales_order ELSE $after.sales_order END) SET deps_last_updated = time::now();
};
DEFINE EVENT OVERWRITE so_cascade ON TABLE sales_order WHEN $event = "DELETE" THEN {
    IF $before.status = "shipped" { THROW "Shipped orders can't be deleted"; };
    DELETE sales_order_line WHERE sales_order = $before.id;
};
-- Shipping issues the goods from the warehouse and books cost of goods sold.
DEFINE EVENT OVERWRITE so_ship ON TABLE sales_order
    WHEN $event = "UPDATE" AND $before.status != "shipped" AND $after.status = "shipped" THEN {
    LET $when = $after.shipped_on ?? time::now();
    IF $after.shipped_on = NONE { UPDATE $after.id SET shipped_on = $when; };
    LET $lines = SELECT product, qty, product.cost_price AS cost, product.kind AS kind FROM sales_order_line WHERE sales_order = $after.id;
    -- Availability check: refuse to ship what the warehouse doesn't hold.
    FOR $l IN $lines {
        IF $l.kind != "service" {
            LET $have = math::sum((SELECT VALUE qty FROM stock_move WHERE product = $l.product AND warehouse = $after.warehouse));
            IF $have < $l.qty { THROW "Not enough " + $l.product.name + " in " + $after.warehouse.name + ": " + <string>$have + " on hand, " + <string>$l.qty + " needed"; };
        };
    };
    FOR $l IN $lines {
        IF $l.kind != "service" {
            CREATE stock_move SET product = $l.product, warehouse = $after.warehouse, qty = -$l.qty, kind = "issue", reference = $after.number, moved_at = $when;
        };
    };
    LET $cogs = math::sum((SELECT VALUE qty * cost FROM $lines WHERE kind != "service"));
    fn::post($when, "Cost of goods sold " + $after.number, "inventory", "5000", "1200", $cogs);
};

DEFINE TABLE IF NOT EXISTS invoice SCHEMALESS;
DEFINE FIELD OVERWRITE number ON invoice TYPE string VALUE IF $value THEN $value ELSE "INV-" + <string>sequence::nextval("seq_inv") END;
DEFINE FIELD OVERWRITE customer ON invoice TYPE record<customer> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE sales_order ON invoice TYPE option<record<sales_order>> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE issued_on ON invoice DEFAULT time::now() VALUE fn::dt($value);
-- Due date follows the customer's payment terms unless given (`customer` is processed before `due_on`).
DEFINE FIELD OVERWRITE due_on ON invoice DEFAULT time::now() + duration::from_days(customer.payment_terms ?? 30) VALUE fn::dt($value);
DEFINE FIELD OVERWRITE amount ON invoice TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE status ON invoice TYPE string DEFAULT "draft"
    ASSERT $value IN ["draft", "issued", "void"] AND ($before != "void" OR $value = "void");
DEFINE INDEX IF NOT EXISTS inv_customer ON invoice FIELDS customer;
DEFINE INDEX IF NOT EXISTS inv_order ON invoice FIELDS sales_order;
-- Issuing books the receivable; voiding reverses it.
DEFINE EVENT OVERWRITE inv_issue ON TABLE invoice
    WHEN ($event = "CREATE" AND $after.status = "issued") OR ($event = "UPDATE" AND $before.status = "draft" AND $after.status = "issued") THEN {
    fn::post($after.issued_on, "Invoice " + $after.number, "sales", "1100", "4000", $after.amount);
};
DEFINE EVENT OVERWRITE inv_void ON TABLE invoice
    WHEN $event = "UPDATE" AND $before.status = "issued" AND $after.status = "void" THEN {
    fn::post(time::now(), "Void invoice " + $after.number, "sales", "4000", "1100", $after.amount);
};
DEFINE EVENT OVERWRITE inv_delete ON TABLE invoice WHEN $event = "DELETE" THEN {
    IF $before.status != "draft" { THROW "Only draft invoices can be deleted; void it instead"; };
};
-- Refresh the order's live row so its "Billing" column follows.
DEFINE EVENT OVERWRITE inv_touch_order ON TABLE invoice WHEN $event IN ["CREATE", "UPDATE", "DELETE"] THEN {
    LET $so = IF $event = "DELETE" THEN $before.sales_order ELSE $after.sales_order END;
    IF $so != NONE { UPDATE $so SET deps_last_updated = time::now(); };
};

DEFINE TABLE IF NOT EXISTS payment SCHEMALESS;
DEFINE FIELD OVERWRITE invoice ON payment TYPE record<invoice> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE amount ON payment TYPE int ASSERT $value > 0;
DEFINE FIELD OVERWRITE paid_on ON payment DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE method ON payment TYPE string DEFAULT "bank_transfer" ASSERT $value IN ["bank_transfer", "card", "cheque", "cash"];
DEFINE INDEX IF NOT EXISTS pay_invoice ON payment FIELDS invoice;
-- Running total of payments on the invoice. Payments are immutable (no update or delete through the app), so
-- adding on create keeps it exact; it makes paid/outstanding/overdue filters cheap instead of a sum per row.
DEFINE FIELD OVERWRITE paid_amount ON invoice TYPE int DEFAULT 0;
DEFINE INDEX IF NOT EXISTS inv_status ON invoice FIELDS status;
DEFINE EVENT OVERWRITE pay_post ON TABLE payment WHEN $event = "CREATE" THEN {
    fn::post($after.paid_on, "Payment for " + $after.invoice.number, "sales", "1000", "1100", $after.amount);
    UPDATE $after.invoice SET paid_amount += $after.amount, deps_last_updated = time::now();
};
DEFINE EVENT OVERWRITE pay_immutable ON TABLE payment WHEN $event IN ["UPDATE", "DELETE"] THEN {
    THROW "Payments can't be changed or deleted; record a correcting entry instead";
};

-- ───────────── Purchasing (procure to pay) ─────────────
DEFINE TABLE IF NOT EXISTS purchase_order SCHEMALESS;
DEFINE FIELD OVERWRITE number ON purchase_order TYPE string VALUE IF $value THEN $value ELSE "PO-" + <string>sequence::nextval("seq_po") END;
DEFINE FIELD OVERWRITE supplier ON purchase_order TYPE record<supplier> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE warehouse ON purchase_order TYPE record<warehouse> DEFAULT warehouse:main;
DEFINE FIELD OVERWRITE order_date ON purchase_order DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE status ON purchase_order TYPE string DEFAULT "draft"
    ASSERT $value IN ["draft", "ordered", "received", "cancelled"]
       AND ($before != "received" OR $value = "received")
       AND ($before != "cancelled" OR $value = "cancelled");
DEFINE FIELD OVERWRITE expected_on ON purchase_order DEFAULT time::now() + 10d VALUE fn::dt($value);
DEFINE FIELD OVERWRITE received_on ON purchase_order VALUE fn::dt($value);
DEFINE INDEX IF NOT EXISTS po_supplier ON purchase_order FIELDS supplier;

DEFINE TABLE IF NOT EXISTS purchase_order_line SCHEMALESS;
DEFINE FIELD OVERWRITE purchase_order ON purchase_order_line TYPE record<purchase_order> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE product ON purchase_order_line TYPE record<product>;
DEFINE FIELD OVERWRITE qty ON purchase_order_line TYPE int DEFAULT 1 ASSERT $value > 0;
DEFINE FIELD OVERWRITE unit_cost ON purchase_order_line TYPE int VALUE IF $value THEN $value ELSE product.cost_price END;
DEFINE FIELD OVERWRITE amount ON purchase_order_line COMPUTED qty * unit_cost;
DEFINE INDEX IF NOT EXISTS pol_order ON purchase_order_line FIELDS purchase_order;
DEFINE INDEX IF NOT EXISTS pol_product ON purchase_order_line FIELDS product;

DEFINE EVENT OVERWRITE pol_touch ON TABLE purchase_order_line WHEN $event IN ["CREATE", "UPDATE", "DELETE"] THEN {
    UPDATE (IF $event = "DELETE" THEN $before.purchase_order ELSE $after.purchase_order END) SET deps_last_updated = time::now();
};
DEFINE EVENT OVERWRITE po_cascade ON TABLE purchase_order WHEN $event = "DELETE" THEN {
    IF $before.status = "received" { THROW "Received orders can't be deleted"; };
    DELETE purchase_order_line WHERE purchase_order = $before.id;
};
-- Receiving puts the goods into the warehouse.
DEFINE EVENT OVERWRITE po_receive ON TABLE purchase_order
    WHEN $event = "UPDATE" AND $before.status != "received" AND $after.status = "received" THEN {
    LET $when = $after.received_on ?? time::now();
    IF $after.received_on = NONE { UPDATE $after.id SET received_on = $when; };
    FOR $l IN (SELECT product, qty FROM purchase_order_line WHERE purchase_order = $after.id) {
        IF $l.product.kind != "service" {
            CREATE stock_move SET product = $l.product, warehouse = $after.warehouse, qty = $l.qty, kind = "receipt", reference = $after.number, moved_at = $when;
        };
    };
};

DEFINE TABLE IF NOT EXISTS bill SCHEMALESS;
DEFINE FIELD OVERWRITE number ON bill TYPE string VALUE IF $value THEN $value ELSE "BILL-" + <string>sequence::nextval("seq_bill") END;
DEFINE FIELD OVERWRITE supplier ON bill TYPE record<supplier> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE received_on ON bill DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE due_on ON bill DEFAULT time::now() + duration::from_days(supplier.payment_terms ?? 30) VALUE fn::dt($value);
DEFINE FIELD OVERWRITE amount ON bill TYPE int DEFAULT 0 ASSERT $value >= 0;
DEFINE FIELD OVERWRITE status ON bill TYPE string DEFAULT "draft"
    ASSERT $value IN ["draft", "approved", "void"] AND ($before != "void" OR $value = "void");
DEFINE INDEX IF NOT EXISTS bill_supplier ON bill FIELDS supplier;
DEFINE EVENT OVERWRITE bill_approve ON TABLE bill
    WHEN ($event = "CREATE" AND $after.status = "approved") OR ($event = "UPDATE" AND $before.status = "draft" AND $after.status = "approved") THEN {
    fn::post($after.received_on, "Supplier bill " + $after.number, "purchasing", "1200", "2000", $after.amount);
};
DEFINE EVENT OVERWRITE bill_void ON TABLE bill
    WHEN $event = "UPDATE" AND $before.status = "approved" AND $after.status = "void" THEN {
    fn::post(time::now(), "Void bill " + $after.number, "purchasing", "2000", "1200", $after.amount);
};

DEFINE TABLE IF NOT EXISTS bill_payment SCHEMALESS;
DEFINE FIELD OVERWRITE bill ON bill_payment TYPE record<bill> REFERENCE ON DELETE IGNORE;
DEFINE FIELD OVERWRITE amount ON bill_payment TYPE int ASSERT $value > 0;
DEFINE FIELD OVERWRITE paid_on ON bill_payment DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE method ON bill_payment TYPE string DEFAULT "bank_transfer" ASSERT $value IN ["bank_transfer", "card", "cheque", "cash"];
DEFINE INDEX IF NOT EXISTS bpay_bill ON bill_payment FIELDS bill;
DEFINE FIELD OVERWRITE paid_amount ON bill TYPE int DEFAULT 0;
DEFINE INDEX IF NOT EXISTS bill_status ON bill FIELDS status;
DEFINE EVENT OVERWRITE bpay_post ON TABLE bill_payment WHEN $event = "CREATE" THEN {
    fn::post($after.paid_on, "Payment of " + $after.bill.number, "purchasing", "2000", "1000", $after.amount);
    UPDATE $after.bill SET paid_amount += $after.amount, deps_last_updated = time::now();
};
DEFINE EVENT OVERWRITE bpay_immutable ON TABLE bill_payment WHEN $event IN ["UPDATE", "DELETE"] THEN {
    THROW "Payments can't be changed or deleted; record a correcting entry instead";
};

-- ───────────── Production ─────────────
DEFINE TABLE IF NOT EXISTS work_order SCHEMALESS;
DEFINE FIELD OVERWRITE number ON work_order TYPE string VALUE IF $value THEN $value ELSE "WO-" + <string>sequence::nextval("seq_wo") END;
DEFINE FIELD OVERWRITE product ON work_order TYPE record<product>;
DEFINE FIELD OVERWRITE warehouse ON work_order TYPE record<warehouse> DEFAULT warehouse:main;
DEFINE FIELD OVERWRITE qty ON work_order TYPE int DEFAULT 1 ASSERT $value > 0;
DEFINE FIELD OVERWRITE start_on ON work_order DEFAULT time::now() VALUE fn::dt($value);
DEFINE FIELD OVERWRITE due_on ON work_order DEFAULT time::now() + 7d VALUE fn::dt($value);
DEFINE FIELD OVERWRITE status ON work_order TYPE string DEFAULT "planned"
    ASSERT $value IN ["planned", "released", "in_progress", "done", "cancelled"]
       AND ($before != "done" OR $value = "done");
DEFINE FIELD OVERWRITE completed_on ON work_order VALUE fn::dt($value);
-- Completing a work order consumes the bill of materials and puts finished goods into stock.
DEFINE EVENT OVERWRITE wo_done ON TABLE work_order
    WHEN $event = "UPDATE" AND $before.status != "done" AND $after.status = "done" THEN {
    LET $when = $after.completed_on ?? time::now();
    IF $after.completed_on = NONE { UPDATE $after.id SET completed_on = $when; };
    LET $bom = SELECT component, qty FROM bom_line WHERE product = $after.product;
    FOR $b IN $bom {
        LET $have = math::sum((SELECT VALUE qty FROM stock_move WHERE product = $b.component AND warehouse = $after.warehouse));
        IF $have < $b.qty * $after.qty { THROW "Not enough " + $b.component.name + " to complete " + $after.number + ": " + <string>$have + " on hand, " + <string>($b.qty * $after.qty) + " needed"; };
    };
    FOR $b IN $bom {
        CREATE stock_move SET product = $b.component, warehouse = $after.warehouse, qty = -($b.qty * $after.qty), kind = "consumption", reference = $after.number, moved_at = $when;
    };
    CREATE stock_move SET product = $after.product, warehouse = $after.warehouse, qty = $after.qty, kind = "production", reference = $after.number, moved_at = $when;
};
