# Papper

Point-of-sale app built for a family-run cafe. Cashiers take orders, print
kitchen tickets and receipts to Bluetooth thermal printers, and take payment;
admins manage the menu, stock, recipes and sales reporting. A restricted
web build of the same app gives admins a browser-based version for
non-cashier tasks.

Expo / React Native, with Supabase (Postgres) as the only backend — there's
no separate application server.

## Where the code is

Everything lives in [`mobile/`](mobile/) — it's the only project in this
repo, despite the name. See [`mobile/README.md`](mobile/README.md) for setup,
architecture, database schema, security model, deployment, and
troubleshooting notes.
