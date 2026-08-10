# Papper

Point-of-sale app built for a family-run cafe. Cashiers take orders, print
kitchen tickets and receipts to Bluetooth thermal printers, and take payment;
admins manage the menu, stock, recipes and sales reporting. Staff-facing text
is Indonesian throughout.

Everything lives in [`mobile/`](mobile/) — it's the only project in this
repo, despite the name. This file is a top-level overview; the real depth is
in [`mobile/README.md`](mobile/README.md) and [`mobile/docs/`](mobile/docs/).

## What it does

**Cashier app (Android, phone/tablet)**
- Open a new order, add/edit line items, mark dine-in or takeaway
- Live stock-availability check while building an order, with an explicit
  override if a manager decides to sell through a shortage
- Take payment (cash, transfer, QRIS), apply a discount, close the order
- Print kitchen tickets and receipts to a paired Bluetooth ESC/POS printer
- Cancel an order — gated behind a 6-digit manager PIN, enforced in the
  database rather than the app

**Admin app (same binary, admin accounts)**
- Menu, recipes and cost-of-goods (per-ingredient or a flat manual figure)
- Stock levels and restocking — every restock automatically logs an expense
- Sales and expense reporting over time
- A restricted **web build** of the same app for browser-based admin work;
  cashier accounts cannot sign in on web at all

## How it's built

Expo / React Native (`expo-router` file-based routing, Expo SDK 54,
React Native 0.81, NativeWind/Tailwind for styling) talking directly to
Supabase (Postgres + Auth + PostgREST) over HTTPS. There is no application
server — every rule that actually matters (roles, the PIN gate, what can be
edited on a closed order) is enforced by Postgres Row Level Security and
triggers, not by the client. Local persistence (paired printer, session)
uses `AsyncStorage`.

Three React contexts carry all app state: `AuthContext` (session + role),
`OrderContext` (orders, menu, stock, the domain logic), and `PrinterContext`
(which Bluetooth printer is paired for cashier vs. kitchen tickets).

Details: [mobile/docs/architecture.md](mobile/docs/architecture.md).

## Security highlights

- Roles (`admin` / `cashier`) are assigned server-side only — new accounts
  are always cashiers, and clients cannot write their own role
- Cancelling a paid order requires a manager's PIN, checked against a bcrypt
  hash by a `SECURITY DEFINER` RPC; a database trigger rejects any direct
  attempt to set `status = 'cancelled'` that skips it
- Once an order is paid or cancelled, a trigger locks what can still change
  on its line items — what was sold, its price, and whether stock was
  deducted for it can't be altered, even by a client holding valid
  credentials
- PIN brute-force is rate-limited (5 attempts / 15 minutes) and logged

Full writeup, including known accepted risks: [mobile/docs/security.md](mobile/docs/security.md).

## Project structure

```
mobile/
  app/           expo-router routes, grouped by role: (auth) (cashier) (admin)
  components/    shared UI
  context/       AuthContext, OrderContext, PrinterContext
  hooks/         useUser
  lib/           supabase client, printer drivers, constants
  types/         domain types
  supabase/      versioned SQL migrations
  docs/          architecture, database, security, development, operations, troubleshooting
  data.sql       menu and stock seed rows — gitignored, local only
```

## Deployment

- **Mobile**: `eas build --platform android --profile preview` produces a
  sideloadable APK (this is an internal tool, not published to the Play
  Store). EAS builds from git, so commit and push first.
- **Web (admin only)**: `npx expo export --platform web` produces a static
  site in `mobile/dist/`, deployed as a normal static host (currently
  Vercel). Supabase env vars are configured in the host's project settings,
  separately from the local `.env`.

More detail: [mobile/docs/development.md](mobile/docs/development.md) and
[mobile/docs/operations.md](mobile/docs/operations.md).
