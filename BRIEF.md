# Brief

## Who uses it
Office staff of a mid-sized trading and light-manufacturing company: sales, purchasing,
warehouse, production, finance and HR, plus managers who want the overview.

## What it's for
A back-office ERP in the spirit of SAP, but friendlier: one desktop app covering sales,
CRM pipeline, purchasing, inventory, production, finance (receivables, payables, general
ledger) and HR. Essentials first; custom components come later.

2026-11-04: a web admin (api/admin.yaml, web/admin/) for the same office staff, in the browser. Familiar to SAP
users (Fiori launchpad, list reports, object pages, My Inbox) but friendlier, and each area uses its own page
pattern instead of the same table-and-form everywhere.

## The data
Starting fresh in the project's own SurrealDB (already set up by the connect wizard), seeded
with a year of realistic sample data. Business rules live in the database (`tests/schema.surql`).

## Organisation and design guide
None named. Fictional company "Northwind Manufacturing" used for sample data.

## Look and feel
Professional and compact: many rows on screen, colour-coded statuses, a manager cockpit as the
home page.

2026-11-04: web admin is Professional and compact, styled after SAP Fiori Horizon (white shell bar, blue accent,
semantic status colours) with more white space. Plain CSS, no component library.

## Defaults taken
- Who uses it: back-office staff across all departments (no answer, "use your own judgement")
- Purpose: full back-office ERP, SAP-inspired module set (no answer)
- The data: the existing SurrealDB, fresh schema with sample data (no answer)
- Currency: US dollars, stored as cents (no answer)
- Look and feel: Professional and compact (no answer)
- Theme: default theme (no answer)
- Web admin sign-in: none while developing locally; add `auth: session` before deploying (no answer)
  2026-11-04: deployed as a public demo with no sign-in, at the owner's request ("no need for auth").
- Web admin library: plain CSS, no component library (no answer)
