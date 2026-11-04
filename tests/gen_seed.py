#!/usr/bin/env python3
"""Generate tests/seed.surql: a year of Northwind Manufacturing activity.

Deterministic (fixed random seed). Documents are created in their first state and then
moved forward with UPDATEs, so the database events (stock moves, journal entries) build
the inventory and the ledger exactly as they would in daily use.

usage: python3 -I tests/gen_seed.py > tests/seed.surql
"""
import random
from datetime import date, datetime, timedelta, timezone
from collections import defaultdict

R = random.Random(42)
TODAY = date(2026, 11, 4)
START = date(2025, 11, 5)
out = []


def emit(s):
    out.append(s)


def q(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def d(x):
    if isinstance(x, datetime):
        return 'd"' + x.strftime("%Y-%m-%dT%H:%M:%SZ") + '"'
    return 'd"' + x.isoformat() + 'T09:00:00Z"'


def dt(day, hour=None):
    h = hour if hour is not None else R.randint(8, 17)
    return datetime(day.year, day.month, day.day, h, R.randint(0, 59), tzinfo=timezone.utc)


def workday(x):
    while x.weekday() >= 5:
        x += timedelta(days=1)
    return x


# ───────────── header (tests/load.sh wipes and re-creates the schema first) ─────────────
emit("USE NS app DB app;")

# ───────────── GL accounts ─────────────
ACCOUNTS = [
    ("1000", "Bank – operating account", "asset"), ("1100", "Accounts receivable", "asset"),
    ("1200", "Inventory", "asset"), ("1500", "Plant & equipment", "asset"),
    ("2000", "Accounts payable", "liability"), ("2100", "Accrued liabilities", "liability"),
    ("3000", "Share capital", "equity"), ("3100", "Retained earnings", "equity"),
    ("4000", "Sales revenue", "revenue"), ("5000", "Cost of goods sold", "expense"),
    ("6000", "Salaries & wages", "expense"), ("6100", "Rent & facilities", "expense"),
    ("6200", "Utilities", "expense"), ("6300", "Marketing", "expense"),
    ("6400", "Travel", "expense"), ("6500", "IT & software", "expense"),
]
for code, name, kind in ACCOUNTS:
    emit(f"CREATE gl_account:a{code} SET code={q(code)}, name={q(name)}, kind={q(kind)};")

# ───────────── departments & employees ─────────────
# key, name, cost centre, parent (listed parent-first)
DEPTS = [
    ("management", "Executive Office", "CC-100", None),
    ("strategy", "Strategy & Projects", "CC-110", "management"),
    ("legal", "Legal & Compliance", "CC-120", "management"),
    ("commercial", "Commercial", "CC-200", "management"),
    ("sales", "Sales", "CC-210", "commercial"),
    ("sales_east", "Sales – East", "CC-211", "sales"),
    ("sales_west", "Sales – West", "CC-212", "sales"),
    ("key_accounts", "Key Accounts", "CC-213", "sales"),
    ("sales_ops", "Sales Operations", "CC-214", "sales"),
    ("marketing", "Marketing", "CC-220", "commercial"),
    ("digital", "Digital Marketing", "CC-221", "marketing"),
    ("product_mkt", "Product Marketing", "CC-222", "marketing"),
    ("service", "Customer Service", "CC-230", "commercial"),
    ("operations", "Operations", "CC-300", "management"),
    ("production", "Production", "CC-310", "operations"),
    ("assembly", "Assembly", "CC-311", "production"),
    ("metal", "Metal Shop", "CC-312", "production"),
    ("upholstery", "Upholstery", "CC-313", "production"),
    ("quality", "Quality Assurance", "CC-314", "production"),
    ("supply_chain", "Supply Chain", "CC-320", "operations"),
    ("purchasing", "Purchasing", "CC-321", "supply_chain"),
    ("warehouse", "Warehouse & Logistics", "CC-322", "supply_chain"),
    ("planning", "Production Planning", "CC-323", "supply_chain"),
    ("engineering", "Engineering & R&D", "CC-330", "operations"),
    ("finance", "Finance", "CC-400", "management"),
    ("accounting", "Accounting", "CC-410", "finance"),
    ("controlling", "Controlling", "CC-420", "finance"),
    ("treasury", "Treasury", "CC-430", "finance"),
    ("hr", "People & HR", "CC-500", "management"),
    ("recruiting", "Recruiting", "CC-510", "hr"),
    ("payroll_team", "Payroll & Benefits", "CC-520", "hr"),
    ("it", "IT", "CC-600", "management"),
    ("infrastructure", "Infrastructure", "CC-610", "it"),
    ("apps", "Business Applications", "CC-620", "it"),
]
DEPT_PARENT = {k: p for k, _, _, p in DEPTS}
rank_in = defaultdict(int)
for key, name, cc, parent in DEPTS:
    rank_in[parent] += 1
    emit(f"CREATE department:{key} SET name={q(name)}, cost_center={q(cc)}, rank={rank_in[parent] * 10}"
         + (f", parent=department:{parent}" if parent else "") + ";")

FIRST = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Ethan", "Leah", "Owen", "Ivy", "Lucas", "Nora",
         "Mason", "Ruby", "Caleb", "Hazel", "Elias", "Iris", "Jonah", "Clara", "Felix", "Maya",
         "Theo", "Elena", "Victor", "Priya", "Samuel", "Aisha", "Marco", "Hana", "Diego", "Freya",
         "Tomas", "Yara", "Oscar"]
LAST = ["Bennett", "Okafor", "Lindqvist", "Moreau", "Tanaka", "Reyes", "Fischer", "Kowalski",
        "Haddad", "Novak", "O'Brien", "Silva", "Brandt", "Castillo", "Nakamura", "Petrov",
        "Achebe", "Duarte", "Sorensen", "Varga", "Kaur", "Mendes", "Ibrahim", "Rossi",
        "Hughes", "Larsen", "Chen", "Abara", "Quinn", "Holm", "Ortega", "Weiss", "Patel", "Grant"]
# The first role of each department is its head. Annual salaries in dollars.
ROLES = {
    "management": [("Chief Executive Officer", 260000), ("Chief Operating Officer", 210000), ("Executive Assistant", 62000)],
    "strategy": [("Head of Strategy", 165000), ("Project Manager", 98000)],
    "legal": [("General Counsel", 190000), ("Compliance Officer", 96000)],
    "commercial": [("Chief Commercial Officer", 205000)],
    "sales": [("Head of Sales", 150000)],
    "sales_east": [("Regional Sales Manager", 120000)] + [("Account Executive", 82000)] * 2,
    "sales_west": [("Regional Sales Manager", 118000)] + [("Account Executive", 82000)] * 2,
    "key_accounts": [("Key Account Director", 140000), ("Account Executive", 84000)],
    "sales_ops": [("Sales Operations Lead", 76000), ("Sales Coordinator", 58000)],
    "marketing": [("Marketing Director", 145000)],
    "digital": [("Digital Marketing Manager", 92000), ("Content Specialist", 64000)],
    "product_mkt": [("Product Marketing Manager", 98000)],
    "service": [("Customer Service Lead", 72000)] + [("Service Agent", 48000)] * 3,
    "operations": [("Director of Operations", 185000)],
    "production": [("Production Manager", 124000)],
    "assembly": [("Assembly Supervisor", 70000)] + [("Assembly Technician", 52000)] * 4,
    "metal": [("Metal Shop Supervisor", 72000)] + [("Welder", 56000)] * 2,
    "upholstery": [("Upholstery Lead", 64000)] + [("Upholsterer", 50000)] * 2,
    "quality": [("QA Manager", 92000), ("QA Inspector", 58000)],
    "supply_chain": [("Supply Chain Director", 150000)],
    "purchasing": [("Purchasing Manager", 118000), ("Buyer", 68000), ("Buyer", 66000)],
    "warehouse": [("Warehouse Manager", 96000)] + [("Warehouse Operative", 46000)] * 4,
    "planning": [("Lead Production Planner", 82000), ("Production Planner", 72000)],
    "engineering": [("Head of Engineering", 160000)] + [("Product Engineer", 105000)] * 2 + [("Industrial Designer", 95000)],
    "finance": [("Finance Director", 168000)],
    "accounting": [("Chief Accountant", 115000), ("Accountant", 78000)] + [("AP/AR Clerk", 54000)] * 2,
    "controlling": [("Financial Controller", 125000), ("FP&A Analyst", 85000)],
    "treasury": [("Treasury Manager", 110000)],
    "hr": [("HR Director", 140000)],
    "recruiting": [("Talent Acquisition Lead", 88000), ("Recruiter", 66000)],
    "payroll_team": [("Payroll Specialist", 64000)],
    "it": [("IT Director", 155000)],
    "infrastructure": [("Systems Administrator", 92000), ("IT Support Technician", 58000)],
    "apps": [("ERP Analyst", 98000), ("Software Developer", 115000)],
}
employees = []
names = R.sample([(f, l) for f in FIRST for l in LAST], 90)
i = 0
dept_head = {}


def boss_of(dept):
    """Head of the nearest department above `dept` that has one."""
    p = DEPT_PARENT[dept]
    while p is not None and p not in dept_head:
        p = DEPT_PARENT[p]
    return dept_head.get(p)


for dept, roles in ROLES.items():   # parents come before children, so their heads exist
    for n, (title, sal) in enumerate(roles):
        f, l = names[i]
        i += 1
        key = f"e{i:03d}"
        email = f"{f.lower()}.{l.lower().replace(chr(39), '')}@northwind-mfg.com"
        hired = START - timedelta(days=R.randint(60, 3600))
        status = "active"
        if R.random() < 0.05:
            status = "on_leave"
        salary = int(sal * R.uniform(0.94, 1.08)) // 100 * 100 * 100
        mgr = boss_of(dept) if n == 0 else dept_head[dept]
        if dept == "management" and n > 0:
            mgr = dept_head["management"]
        emp = dict(key=key, name=f"{f} {l}", dept=dept, title=title, salary=salary)
        employees.append(emp)
        emit(f"CREATE employee:{key} SET name={q(emp['name'])}, email={q(email)}, department=department:{dept}, "
             f"title={q(title)}, salary={salary}, hired_on={d(hired)}, status={q(status)}, "
             f"phone={q('+1 313 555 %04d' % R.randint(100, 9999))}"
             + (f", manager=employee:{mgr}" if mgr else "") + ";")
        if n == 0:
            dept_head[dept] = key
by_dept = defaultdict(list)
for e in employees:
    by_dept[e["dept"]].append(e)
# Budget: own payroll plus 15–40% for running costs (cents).
for key, *_ in DEPTS:
    own = sum(e["salary"] for e in by_dept[key])
    budget = int(own * R.uniform(1.15, 1.4)) // 10000000 * 10000000 + 5000000
    emit(f"UPDATE department:{key} SET head=employee:{dept_head[key]}, budget={budget};")
reps = [e["key"] for e in employees if e["title"] == "Account Executive"]
buyers = [e["key"] for e in by_dept["purchasing"]]

# ───────────── customers & suppliers ─────────────
CITIES = [("Chicago", "USA"), ("Boston", "USA"), ("Austin", "USA"), ("Seattle", "USA"), ("Denver", "USA"),
          ("Atlanta", "USA"), ("New York", "USA"), ("San Diego", "USA"), ("Toronto", "Canada"),
          ("Montréal", "Canada"), ("Vancouver", "Canada"), ("Minneapolis", "USA"), ("Phoenix", "USA"),
          ("Columbus", "USA"), ("Portland", "USA")]
CUST_A = ["Blue Harbor", "Summit", "Ironwood", "Bright Path", "Cedar & Oak", "Lakeview", "Northstar",
          "Pioneer", "Redline", "Silverleaf", "Granite", "Horizon", "Keystone", "Maple Grove", "Brookfield",
          "Copperline", "Evergreen", "Falcon", "Harborview", "Juniper", "Riverside", "Westgate", "Oakmont",
          "Trailhead", "Union Square", "Clearwater", "Highland", "Sterling", "Beacon", "Atlas"]
CUST_B = ["Consulting", "Health Partners", "Logistics", "Law Group", "Architects", "Bank", "Labs",
          "Media", "University", "Insurance", "Software", "Hotels", "Co-working", "School District",
          "Engineering", "Realty", "Dental Group", "Analytics"]
SEGMENT_OF = {"University": "public", "School District": "public", "Bank": "enterprise", "Insurance": "enterprise",
              "Hotels": "enterprise", "Software": "enterprise", "Co-working": "retail", "Realty": "retail"}
customers = []
used = set()
for n in range(42):
    while True:
        nm = f"{R.choice(CUST_A)} {R.choice(CUST_B)}"
        if nm not in used:
            used.add(nm)
            break
    seg = SEGMENT_OF.get(nm.split(" ", 1)[1] if nm.count(" ") else "", None) or R.choice(["smb", "smb", "smb", "enterprise", "retail"])
    for b, s in SEGMENT_OF.items():
        if nm.endswith(b):
            seg = s
    city, country = R.choice(CITIES)
    key = f"c{n + 1:03d}"
    terms = R.choice([15, 30, 30, 30, 45, 60]) if seg != "retail" else R.choice([0, 15])
    limit = {"enterprise": R.choice([150000, 250000, 400000]), "public": R.choice([100000, 200000]),
             "smb": R.choice([25000, 50000, 75000]), "retail": R.choice([10000, 20000])}[seg] * 100
    weight = {"enterprise": 3.0, "public": 2.0, "smb": 1.0, "retail": 0.6}[seg] * R.uniform(0.5, 1.6)
    status = "blocked" if n in (17, 33) else "active"
    dom = nm.lower().replace(" & ", "").replace(" ", "")[:18]
    customers.append(dict(key=key, name=nm, seg=seg, terms=terms, weight=weight, rep=R.choice(reps), status=status))
    emit(f"CREATE customer:{key} SET code={q('C-%04d' % (1000 + n + 1))}, name={q(nm)}, segment={q(seg)}, "
         f"email={q('ap@' + dom + '.com')}, phone={q('+1 %03d 555 %04d' % (R.randint(200, 989), R.randint(100, 9999)))}, "
         f"city={q(city)}, country={q(country)}, credit_limit={limit}, payment_terms={terms}, "
         f"sales_rep=employee:{customers[-1]['rep']}, status={q(status)}, since={d(START - timedelta(days=R.randint(30, 2500)))};")

SUPPLIERS = [
    ("s01", "Great Lakes Steel Supply", "Raw materials", "Cleveland", "USA"),
    ("s02", "Appalachian Hardwoods", "Raw materials", "Asheville", "USA"),
    ("s03", "PanelCraft Laminates", "Raw materials", "Grand Rapids", "USA"),
    ("s04", "Fastenal Industrial", "Components", "Winona", "USA"),
    ("s05", "TexWeave Fabrics", "Raw materials", "Greensboro", "USA"),
    ("s06", "ComfortFoam Inc.", "Components", "Dalton", "USA"),
    ("s07", "RollRight Casters", "Components", "Elkhart", "USA"),
    ("s08", "LiftTech Pneumatics", "Components", "Monterrey", "Mexico"),
    ("s09", "Linak Motion Systems", "Components", "Louisville", "USA"),
    ("s10", "ColorCoat Powders", "Raw materials", "Toledo", "USA"),
    ("s11", "ErgoGear Wholesale", "Trading goods", "Toronto", "Canada"),
    ("s12", "Lumina Lighting Co.", "Trading goods", "Shenzhen", "China"),
    ("s13", "PackRight Packaging", "Packaging", "Memphis", "USA"),
    ("s14", "FreightLink Logistics", "Services", "Detroit", "USA"),
]
for key, nm, cat, city, country in SUPPLIERS:
    emit(f"CREATE supplier:{key} SET code={q('V-' + key[1:].zfill(4))}, name={q(nm)}, category={q(cat)}, "
         f"city={q(city)}, country={q(country)}, email={q('orders@' + nm.split()[0].lower() + '.com')}, "
         f"phone={q('+1 %03d 555 %04d' % (R.randint(200, 989), R.randint(100, 9999)))}, "
         f"payment_terms={R.choice([30, 30, 45, 60])}, rating={R.choice([3, 4, 4, 5, 5, 2])};")

# ───────────── products, warehouses, BOMs ─────────────
CATS = [("desks", "Desks & tables"), ("chairs", "Seating"), ("storage", "Storage"),
        ("accessories", "Accessories"), ("raw", "Raw materials"), ("components", "Components"),
        ("services", "Services")]
for key, nm in CATS:
    emit(f"CREATE product_category:{key} SET name={q(nm)};")
# key, sku, name, kind, category, uom, cost $, price $, reorder, supplier
PRODUCTS = [
    ("sdp", "FG-1001", "Standing Desk Pro", "finished", "desks", "pcs", 0, 1290, 25, None),
    ("sdl", "FG-1002", "Standing Desk Lite", "finished", "desks", "pcs", 0, 790, 30, None),
    ("exd", "FG-1003", "Executive Desk", "finished", "desks", "pcs", 0, 1650, 10, None),
    ("cft", "FG-1004", "Conference Table 10-seat", "finished", "desks", "pcs", 0, 3400, 4, None),
    ("erc", "FG-2001", "Ergonomic Chair", "finished", "chairs", "pcs", 0, 640, 40, None),
    ("tkc", "FG-2002", "Task Chair", "finished", "chairs", "pcs", 0, 290, 60, None),
    ("lgc", "FG-2003", "Lounge Chair", "finished", "chairs", "pcs", 0, 980, 8, None),
    ("fcb", "FG-3001", "Filing Cabinet 3-drawer", "finished", "storage", "pcs", 0, 420, 20, None),
    ("bks", "FG-3002", "Bookshelf 5-tier", "finished", "storage", "pcs", 0, 360, 15, None),
    ("mpd", "FG-3003", "Mobile Pedestal", "finished", "storage", "pcs", 0, 270, 25, None),
    ("stl", "RM-0101", "Steel tube 40mm", "raw", "raw", "m", 9, 0, 800, "s01"),
    ("oak", "RM-0102", "Oak panel 180×80", "raw", "raw", "pcs", 118, 0, 60, "s02"),
    ("lam", "RM-0103", "Laminate panel 160×80", "raw", "raw", "pcs", 46, 0, 120, "s03"),
    ("scr", "RM-0104", "Fixings kit", "raw", "components", "set", 4, 0, 500, "s04"),
    ("fab", "RM-0105", "Upholstery fabric", "raw", "raw", "m", 14, 0, 400, "s05"),
    ("fom", "RM-0106", "Seat foam block", "raw", "components", "pcs", 11, 0, 200, "s06"),
    ("cst", "RM-0107", "Caster wheel (set of 5)", "raw", "components", "set", 19, 0, 150, "s07"),
    ("gas", "RM-0108", "Gas lift cylinder", "raw", "components", "pcs", 16, 0, 150, "s08"),
    ("mot", "RM-0109", "Dual desk motor unit", "raw", "components", "pcs", 165, 0, 60, "s09"),
    ("pnt", "RM-0110", "Powder coat paint", "raw", "raw", "kg", 7, 0, 300, "s10"),
    ("drw", "RM-0111", "Drawer runner pair", "raw", "components", "set", 6, 0, 300, "s04"),
    ("mna", "TG-5001", "Dual monitor arm", "trading", "accessories", "pcs", 74, 189, 40, "s11"),
    ("lmp", "TG-5002", "LED desk lamp", "trading", "accessories", "pcs", 22, 69, 60, "s12"),
    ("cbt", "TG-5003", "Cable tray", "trading", "accessories", "pcs", 9, 39, 80, "s11"),
    ("ftr", "TG-5004", "Ergonomic footrest", "trading", "accessories", "pcs", 18, 59, 40, "s11"),
    ("wbd", "TG-5005", "Mobile whiteboard", "trading", "accessories", "pcs", 95, 249, 10, "s11"),
    ("ins", "SV-9001", "Installation", "service", "services", "hr", 0, 95, 0, None),
    ("dlv", "SV-9002", "White-glove delivery", "service", "services", "pcs", 0, 150, 0, None),
    ("dsg", "SV-9003", "Workspace design consultation", "service", "services", "hr", 0, 140, 0, None),
]
BOM = {
    "sdp": [("stl", 6), ("oak", 1), ("mot", 1), ("scr", 2), ("pnt", 2)],
    "sdl": [("stl", 5), ("lam", 1), ("mot", 1), ("scr", 2), ("pnt", 2)],
    "exd": [("oak", 3), ("drw", 3), ("scr", 3)],
    "cft": [("oak", 6), ("stl", 8), ("scr", 4), ("pnt", 3)],
    "erc": [("fab", 2), ("fom", 2), ("gas", 1), ("cst", 1), ("stl", 2), ("scr", 1)],
    "tkc": [("fab", 1), ("fom", 1), ("gas", 1), ("cst", 1), ("scr", 1)],
    "lgc": [("fab", 4), ("fom", 4), ("oak", 1), ("scr", 1)],
    "fcb": [("stl", 4), ("drw", 3), ("pnt", 2), ("scr", 1)],
    "bks": [("lam", 3), ("scr", 1)],
    "mpd": [("lam", 1), ("drw", 3), ("cst", 1), ("scr", 1)],
}
P = {}
for key, sku, nm, kind, cat, uom, cost, price, reorder, sup in PRODUCTS:
    P[key] = dict(key=key, kind=kind, cost=cost * 100, price=price * 100, sup=sup, name=nm)
for fg, comps in BOM.items():   # standard cost of finished goods = materials + 25% conversion
    P[fg]["cost"] = int(sum(P[c]["cost"] * n for c, n in comps) * 1.25) // 100 * 100
for key, sku, nm, kind, cat, uom, cost, price, reorder, sup in PRODUCTS:
    p = P[key]
    emit(f"CREATE product:{key} SET sku={q(sku)}, name={q(nm)}, kind={q(kind)}, category=product_category:{cat}, "
         f"uom={q(uom)}, cost_price={p['cost']}, sale_price={p['price']}, reorder_level={reorder}, active=true"
         + (f", supplier=supplier:{sup}" if sup else "") + ";")
for fg, comps in BOM.items():
    for c, n in comps:
        emit(f"CREATE bom_line SET product=product:{fg}, component=product:{c}, qty={n};")

WH = [("main", "MAIN", "Main plant", "Detroit, MI"), ("east", "EAST", "East distribution centre", "Newark, NJ"),
      ("west", "WEST", "West distribution centre", "Reno, NV")]
for key, code, nm, city in WH:
    emit(f"CREATE warehouse:{key} SET code={q(code)}, name={q(nm)}, city={q(city)};")

# ───────────── opening balances ─────────────
opening = datetime(2025, 11, 1, 6, 0, tzinfo=timezone.utc)
stock_value = 0
for p in P.values():
    if p["kind"] == "service":
        continue
    base = {"finished": 240, "raw": 900, "trading": 150}[p["kind"]]
    if p["kind"] == "raw" and p["cost"] > 5000:
        base = 160
    for wh, share in (("main", 1.0), ("east", 0.35), ("west", 0.25)):
        if p["kind"] == "raw" and wh != "main":
            continue
        qty = int(base * share * R.uniform(0.7, 1.3))
        if qty <= 0:
            continue
        stock_value += qty * p["cost"]
        emit(f"CREATE stock_move SET product=product:{p['key']}, warehouse=warehouse:{wh}, qty={qty}, kind=\"opening\", "
             f"reference=\"Opening balance\", moved_at={d(opening)};")
cash, ppe = 85000000, 42000000
emit(f'CREATE journal_entry:opening SET number="JE-100000", posted_on={d(opening)}, memo="Opening balances", source="opening", status="draft";')
for acc, dr, cr in (("1000", cash, 0), ("1200", stock_value, 0), ("1500", ppe, 0),
                    ("3000", 0, 50000000), ("3100", 0, cash + stock_value + ppe - 50000000)):
    emit(f"CREATE journal_line SET entry=journal_entry:opening, account=gl_account:a{acc}, debit={dr}, credit={cr};")
emit('UPDATE journal_entry:opening SET status="posted";')

# ───────────── sales orders ─────────────
days = [START + timedelta(days=k) for k in range((TODAY - START).days + 1)]
sellable = [p for p in P.values() if p["kind"] in ("finished", "trading")]
services = [p for p in P.values() if p["kind"] == "service"]
cust_w = [c["weight"] for c in customers]
so_n = 10001
sales = []          # dicts with lines
for day in days:
    if day.weekday() >= 5:
        continue
    growth = 0.75 + 0.5 * (day - START).days / 365          # business grows over the year
    season = 1.25 if day.month in (1, 3, 9) else (0.7 if day.month in (7, 8, 12) else 1.0)
    for _ in range(sum(1 for _ in range(6) if R.random() < 0.5 * growth * season)):
        c = R.choices(customers, weights=cust_w)[0]
        if c["status"] == "blocked" and day > TODAY - timedelta(days=120):
            continue
        lines = []
        big = {"enterprise": 3, "public": 2.2, "smb": 1, "retail": 0.6}[c["seg"]]
        for p in R.sample(sellable, R.choice([1, 1, 2, 2, 3, 4])):
            qty = max(1, int(R.expovariate(1 / (11 * big)) + 1))
            if p["price"] > 150000:
                qty = max(1, qty // 4)
            disc = R.choice([0, 0, 0, 5, 10]) if qty >= 10 else 0
            lines.append((p["key"], qty, p["price"], disc))
        if R.random() < 0.35:
            s = R.choice(services)
            lines.append((s["key"], R.randint(2, 16) if s["key"] != "dlv" else 1, s["price"], 0))
        age = (TODAY - day).days
        status = "shipped" if age > 6 else R.choice(["confirmed", "confirmed", "draft"])
        if R.random() < 0.03:
            status = "cancelled"
        R.random()
        wh = "main"   # production and receiving happen at the main plant; the DCs hold their opening stock
        sales.append(dict(number=f"SO-{so_n}", key=f"so{so_n}", cust=c, day=day, lines=lines, status=status, wh=wh,
                          rep=c["rep"], ship=workday(day + timedelta(days=R.randint(1, 5)))))
        so_n += 1

# ───────────── production planned from demand ─────────────
demand = defaultdict(lambda: defaultdict(int))   # month -> product -> qty
for s in sales:
    if s["status"] == "cancelled":
        continue
    for k, qty, _, _ in s["lines"]:
        if P[k]["kind"] == "finished":
            demand[(s["day"].year, s["day"].month)][k] += qty
wo_n = 60001
work_orders = []
for (y, m), prods in sorted(demand.items()):
    for k, qty in prods.items():
        remaining = int(qty * R.uniform(0.95, 1.2))
        while remaining > 0:
            batch = min(remaining, R.choice([20, 30, 40, 50]))
            remaining -= batch
            start = workday(date(y, m, R.randint(1, 24)))
            due = workday(start + timedelta(days=R.randint(4, 10)))
            if due < TODAY - timedelta(days=3):
                status = "done"
            elif start <= TODAY:
                status = R.choice(["in_progress", "released"])
            else:
                status = "planned"
            work_orders.append(dict(number=f"WO-{wo_n}", key=f"wo{wo_n}", prod=k, qty=batch, start=start,
                                    due=due, status=status, done=min(due, TODAY - timedelta(days=1))))
            wo_n += 1
# add the next few planned orders
for k in ("sdp", "erc", "tkc", "sdl"):
    start = workday(TODAY + timedelta(days=R.randint(2, 12)))
    work_orders.append(dict(number=f"WO-{wo_n}", key=f"wo{wo_n}", prod=k, qty=40, start=start,
                            due=workday(start + timedelta(days=7)), status="planned", done=None))
    wo_n += 1

# ───────────── purchasing planned from consumption and trading sales ─────────────
need = defaultdict(lambda: defaultdict(int))     # month -> material -> qty
for w in work_orders:
    for c, n in BOM[w["prod"]]:
        need[(w["start"].year, w["start"].month)][c] += n * w["qty"]
for s in sales:
    for k, qty, _, _ in s["lines"]:
        if P[k]["kind"] == "trading":
            need[(s["day"].year, s["day"].month)][k] += qty
po_n = 40001
purchases = []
for (y, m), mats in sorted(need.items()):
    by_sup = defaultdict(list)
    for k, qty in mats.items():
        by_sup[P[k]["sup"]].append((k, int(qty * R.uniform(1.0, 1.25)) + 5))
    for sup, lines in by_sup.items():
        od = workday(date(y, m, 1) - timedelta(days=R.randint(5, 14)))
        if od > TODAY:
            continue
        rec = workday(od + timedelta(days=R.randint(4, 12)))
        status = "received" if rec <= TODAY - timedelta(days=1) else "ordered"
        purchases.append(dict(number=f"PO-{po_n}", key=f"po{po_n}", sup=sup, day=od, rec=rec, status=status,
                              lines=[(k, qty, P[k]["cost"]) for k, qty in lines], buyer=R.choice(buyers)))
        po_n += 1
# a couple of drafts and a cancelled one
for sup, k, qty in (("s05", "fab", 600), ("s09", "mot", 80), ("s12", "lmp", 200)):
    purchases.append(dict(number=f"PO-{po_n}", key=f"po{po_n}", sup=sup, day=TODAY - timedelta(days=1), rec=None,
                          status="draft", lines=[(k, qty, P[k]["cost"])], buyer=R.choice(buyers)))
    po_n += 1
purchases[len(purchases) // 2]["status"] = "cancelled"

for p in purchases:
    emit(f"CREATE purchase_order:{p['key']} SET number={q(p['number'])}, supplier=supplier:{p['sup']}, warehouse=warehouse:main, "
         f"order_date={d(dt(p['day']))}, expected_on={d(p['rec'] or TODAY + timedelta(days=10))}, buyer=employee:{p['buyer']}, "
         f"status={q('ordered' if p['status'] in ('received', 'cancelled') else p['status'])};")
    for k, qty, cost in p["lines"]:
        emit(f"CREATE purchase_order_line SET purchase_order=purchase_order:{p['key']}, product=product:{k}, qty={qty}, unit_cost={cost};")

for w in work_orders:   # receive raw material that the work orders will consume first, then produce
    emit(f"CREATE work_order:{w['key']} SET number={q(w['number'])}, product=product:{w['prod']}, warehouse=warehouse:main, "
         f"qty={w['qty']}, start_on={d(w['start'])}, due_on={d(w['due'])}, status={q('released' if w['status'] == 'done' else w['status'])};")

events = []   # (when, statement) — state changes applied in time order
for p in purchases:
    if p["status"] == "received":
        events.append((dt(p["rec"], 10), f'UPDATE purchase_order:{p["key"]} SET status="received", received_on={d(dt(p["rec"], 10))};'))
    elif p["status"] == "cancelled":
        events.append((dt(p["day"], 16), f'UPDATE purchase_order:{p["key"]} SET status="cancelled";'))
for w in work_orders:
    if w["status"] == "done":
        events.append((dt(w["done"], 15), f'UPDATE work_order:{w["key"]} SET status="done", completed_on={d(dt(w["done"], 15))};'))

for s in sales:
    c = s["cust"]
    emit(f"CREATE sales_order:{s['key']} SET number={q(s['number'])}, customer=customer:{c['key']}, warehouse=warehouse:{s['wh']}, "
         f"order_date={d(dt(s['day']))}, requested_on={d(s['ship'])}, sales_rep=employee:{s['rep']}, "
         f"customer_ref={q('PO ' + str(R.randint(10000, 99999)))}, "
         f"status={q('confirmed' if s['status'] in ('shipped', 'cancelled') else s['status'])};")
    for k, qty, price, disc in s["lines"]:
        emit(f"CREATE sales_order_line SET sales_order=sales_order:{s['key']}, product=product:{k}, qty={qty}, unit_price={price}, discount_pct={disc};")
    if s["status"] == "shipped":
        events.append((dt(s["ship"], 14), f'UPDATE sales_order:{s["key"]} SET status="shipped", shipped_on={d(dt(s["ship"], 14))};'))
    elif s["status"] == "cancelled":
        events.append((dt(s["day"], 17), f'UPDATE sales_order:{s["key"]} SET status="cancelled";'))

# ───────────── invoices & customer payments ─────────────
inv_n = 90001
for s in sales:
    if s["status"] != "shipped":
        continue
    c = s["cust"]
    total = sum(qty * price * (100 - disc) // 100 for _, qty, price, disc in s["lines"])
    issued = s["ship"]
    if (TODAY - issued).days < 9 and R.random() < 0.6:
        continue                       # not yet invoiced: shows up on the "to invoice" worklist
    due = issued + timedelta(days=c["terms"])
    key = f"inv{inv_n}"
    status = "issued" if not ((TODAY - issued).days < 4 and R.random() < 0.5) else "draft"
    events.append((dt(issued, 15), f"CREATE invoice:{key} SET number=\"INV-{inv_n}\", customer=customer:{c['key']}, "
                   f"sales_order=sales_order:{s['key']}, issued_on={d(dt(issued, 15))}, due_on={d(due)}, amount={total}, status={q(status)};"))
    inv_n += 1
    if status != "issued":
        continue
    late_payer = c["seg"] == "retail" or c["key"] in ("c005", "c012", "c027") or c["status"] == "blocked"
    pay_day = due + timedelta(days=R.randint(-12, 6) + (R.randint(10, 40) if late_payer else 0))
    if pay_day <= issued:
        pay_day = issued + timedelta(days=1)
    if pay_day >= TODAY or (late_payer and R.random() < 0.25 and (TODAY - due).days < 160):
        if R.random() < 0.15 and pay_day < TODAY:   # partial payment
            events.append((dt(pay_day, 11), f'CREATE payment SET invoice=invoice:{key}, amount={total // 2}, paid_on={d(dt(pay_day, 11))}, method="bank_transfer";'))
        continue
    method = R.choices(["bank_transfer", "card", "cheque"], weights=[8, 2, 1])[0]
    events.append((dt(pay_day, 11), f"CREATE payment SET invoice=invoice:{key}, amount={total}, paid_on={d(dt(pay_day, 11))}, method={q(method)};"))

# ───────────── supplier bills & payments ─────────────
bill_n = 70001
sup_terms = {s[0]: 30 for s in SUPPLIERS}
for p in purchases:
    if p["status"] != "received":
        continue
    total = sum(qty * cost for _, qty, cost in p["lines"])
    rec = p["rec"] + timedelta(days=R.randint(0, 3))
    if rec >= TODAY:
        continue
    due = rec + timedelta(days=sup_terms[p["sup"]] + R.choice([0, 15, 30]))
    key = f"bill{bill_n}"
    status = "approved" if (TODAY - rec).days > 3 else "draft"
    events.append((dt(rec, 12), f"CREATE bill:{key} SET number=\"BILL-{bill_n}\", supplier=supplier:{p['sup']}, "
                   f"purchase_order=purchase_order:{p['key']}, supplier_ref={q('INV-' + str(R.randint(100000, 999999)))}, "
                   f"received_on={d(dt(rec, 12))}, due_on={d(due)}, amount={total}, status={q(status)};"))
    bill_n += 1
    pay = due - timedelta(days=R.randint(0, 5))
    if status == "approved" and pay < TODAY:
        events.append((dt(pay, 13), f'CREATE bill_payment SET bill=bill:{key}, amount={total}, paid_on={d(dt(pay, 13))}, method="bank_transfer";'))

# ───────────── monthly overheads ─────────────
payroll = sum(e["salary"] for e in employees) // 12
m = date(2025, 11, 1)
while m <= TODAY:
    nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    end = nxt - timedelta(days=1)
    if end < TODAY:
        when = dt(workday(end - timedelta(days=2)) if workday(end) > end else end, 18)
        for acc, memo, amt, src in (("6000", "Payroll", payroll, "payroll"), ("6100", "Rent – Detroit plant & DCs", 2850000, "manual"),
                                    ("6200", "Utilities", R.randint(520000, 880000), "manual"),
                                    ("6300", "Marketing campaigns", R.randint(300000, 1400000), "manual"),
                                    ("6400", "Travel & expenses", R.randint(150000, 450000), "manual"),
                                    ("6500", "Software subscriptions", R.randint(380000, 520000), "manual")):
            events.append((when, f'fn::post({d(when)}, "{memo} {m.strftime("%b %Y")}", "{src}", "{acc}", "1000", {amt});'))
    m = nxt
# a draft accrual waiting for review
events.append((dt(TODAY, 9), 'CREATE journal_entry:accrual SET memo="Accrued freight October 2026", posted_on=' + d(dt(TODAY, 9)) + ', source="manual", status="draft";'))
events.append((dt(TODAY, 9), 'CREATE journal_line SET entry=journal_entry:accrual, account=gl_account:a5000, debit=1240000, credit=0, memo="FreightLink October";'))
events.append((dt(TODAY, 9), 'CREATE journal_line SET entry=journal_entry:accrual, account=gl_account:a2100, debit=0, credit=1240000;'))

events.sort(key=lambda e: e[0])
for _, s in events:
    emit(s)

# ───────────── CRM pipeline ─────────────
OPP = ["Office refit", "New HQ fit-out", "Ergonomic upgrade", "Sit-stand rollout", "Meeting rooms refresh",
       "Campus expansion", "Branch openings", "Hybrid-work kit", "Executive floor", "Call-centre seating",
       "Library furniture", "Co-working floor", "Lab benches", "Reception redesign"]
opp_n = 501
for n in range(48):
    c = R.choice([c for c in customers if c["status"] == "active"])
    stage = R.choices(["lead", "qualified", "proposal", "negotiation", "won", "lost"], weights=[8, 8, 7, 5, 9, 6])[0]
    prob = {"lead": 10, "qualified": 25, "proposal": 50, "negotiation": 75, "won": 100, "lost": 0}[stage]
    created = TODAY - timedelta(days=R.randint(3, 200))
    close = created + timedelta(days=R.randint(20, 120)) if stage not in ("won", "lost") else created + timedelta(days=R.randint(10, 90))
    if stage not in ("won", "lost") and close < TODAY:
        close = TODAY + timedelta(days=R.randint(5, 90))
    val = R.choice([8, 12, 18, 25, 40, 60, 90, 140, 220]) * 100000
    emit(f"CREATE opportunity:o{opp_n} SET number=\"OPP-{opp_n}\", title={q(c['name'].split()[0] + ' – ' + R.choice(OPP))}, "
         f"customer=customer:{c['key']}, owner=employee:{c['rep']}, stage={q(stage)}, value={val}, probability={prob}, "
         f"expected_close={d(min(close, TODAY) if stage in ('won', 'lost') else close)}, created_at={d(dt(created))};")
    opp_n += 1

# ───────────── leave ─────────────
for n in range(46):
    e = R.choice(employees)
    start = workday(START + timedelta(days=R.randint(0, 400)))
    length = R.choice([1, 1, 2, 3, 5, 5, 10])
    end = start + timedelta(days=length - 1 + 2 * ((length - 1) // 5))
    kind = R.choices(["vacation", "sick", "personal", "parental"], weights=[10, 4, 2, 1])[0]
    status = "approved" if start < TODAY else R.choice(["pending", "pending", "approved", "rejected"])
    emit(f"CREATE leave_request SET employee=employee:{e['key']}, kind={q(kind)}, starts_on={d(start)}, ends_on={d(end)}, "
         f"days={length}, status={q(status)}, requested_on={d(start - timedelta(days=R.randint(1, 30)))};")

# ───────────── planners raised a few reorder levels: these items now need buying ─────────────
for k, level in (("mot", 420), ("fab", 1700), ("mna", 600), ("lmp", 560), ("tkc", 190)):
    emit(f"UPDATE product:{k} SET reorder_level = {level};")

# ───────────── number ranges continue after the seed ─────────────
for seq, nxt in (("seq_so", so_n), ("seq_po", po_n), ("seq_inv", inv_n), ("seq_bill", bill_n),
                 ("seq_wo", wo_n), ("seq_opp", opp_n)):
    emit(f"REMOVE SEQUENCE IF EXISTS {seq}; DEFINE SEQUENCE {seq} START {nxt};")

print("\n".join(out))
