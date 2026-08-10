# Papper

Point-of-sale app for a cafe. Cashiers take orders on Android devices, print
kitchen tickets and receipts to Bluetooth thermal printers, and close out
payments; admins manage the menu, stock, recipes and sales reporting.

Expo / React Native front end, Supabase (Postgres) back end, no application
server of its own.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | how the app fits together — routing, state, order lifecycle, stock and cost, printing |
| [docs/database.md](docs/database.md) | every table, function and trigger; migration workflow |
| [docs/security.md](docs/security.md) | auth, roles, RLS, the PIN-gated cancellation design, hardening history |
| [docs/development.md](docs/development.md) | environment setup, running, building, dependency rules |
| [docs/operations.md](docs/operations.md) | runbook: accounts, manager PINs, auditing, recovery |
| [docs/troubleshooting.md](docs/troubleshooting.md) | every failure mode hit so far, with the actual fix |
| [supabase/README.md](supabase/README.md) | schema capture and migration notes |

## Quick start

```sh
npm install
# create .env with your Supabase project values — see docs/development.md
npx expo start
```

**Expo Go will not work** — the Bluetooth printer module is native. You need a
development build (`npx expo run:android`) or an EAS build. See
[docs/development.md](docs/development.md).

## Layout

```
app/           expo-router routes, grouped by role: (auth) (cashier) (admin)
components/    shared UI
context/       AuthContext, OrderContext, PrinterContext
hooks/         useUser
lib/           supabase client, printer drivers, constants
types/         domain types
supabase/      versioned SQL migrations
docs/          this documentation
data.sql       menu and stock seed rows — gitignored, local only
```

## Key facts

- **Roles** are `admin` and `cashier`, stored in `profiles.role`. New accounts
  are always cashiers; promotion is a manual SQL statement.
- **Cancelling an order requires a 6-digit manager PIN**, enforced by database
  triggers rather than by the client. See
  [docs/security.md](docs/security.md#pin-gated-cancellation).
- **Stock is deducted when an order is created or edited**, not at payment.
  Restocking automatically records an expense.
- **Money is integer Rupiah** throughout. `TAX_RATE` lives in
  `lib/constants.ts`.
- **User-facing strings are Indonesian**; code and comments are English.

## Conventions worth not relearning

- Never `select("*")` from `profiles` — `pin_hash` is not client-readable and
  the query will fail. Select explicit columns.
- Never run `npm audit fix --force` here; it has already broken the Expo /
  React Native version pairing once. Use `npx expo install --check`.
- Commit before running an EAS build — EAS builds from git, not your working
  directory.
