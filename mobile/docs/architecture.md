# Architecture

## Shape of the system

Papper is a two-tier system with no backend of its own:

```
Expo / React Native app  ──HTTPS──▶  Supabase (Postgres + Auth + PostgREST)
        │
        └──Bluetooth (ESC/POS)──▶  thermal printers
```

There is no application server. The app talks to Postgres directly through
PostgREST, and every rule that matters is enforced in the database with Row
Level Security and triggers. This is deliberate: a React Native bundle can be
extracted and modified, so client-side checks are treated as UX, not security.
See [security.md](security.md).

## Routing

`expo-router` with file-based routes. `app/_layout.tsx` holds the only
navigation decision in the app:

| Auth state | Destination |
| --- | --- |
| no session | `/(auth)/login` |
| session, `profile.role === 'admin'` or `'superadmin'` | `/(admin)/(tabs)` |
| session, `profile.role === 'cashier'` | `/(cashier)/(tabs)` |
| session, any other role | `/(auth)/login` |

`admin` and `superadmin` share the same route tree — there is no separate
`(superadmin)` group. Superadmin-only affordances (creating a stock item or
menu, editing cost mode, soft-delete/restore) are conditionally rendered
inside the existing admin screens based on `profile.role === 'superadmin'`
from `useAuth()`. See [security.md](security.md#role-model) for what each
tier can actually write.

Route groups mirror those roles:

```
app/
  _layout.tsx              root: providers + role-based redirect
  (auth)/login.tsx
  (cashier)/
    (tabs)/index.tsx       open + paid order lists
    (tabs)/availability.tsx  toggle menu items in/out of stock
    (tabs)/sales.tsx
    (tabs)/profile.tsx
    new-order.tsx
    order/[id].tsx         edit an open order; cancellation entry point
    payment/[id].tsx       take payment, close the order
  (admin)/(tabs)/
    index.tsx              stock: list, restock; superadmin: create/remove item types
    sales.tsx              revenue over time, top-selling menu
    purchase.tsx           expense history
    cogs/index.tsx         menu list with cost of goods; superadmin: create/remove menus
    cogs/[id].tsx          per-item recipe editor; id === 'new' is the create-menu form; cost mode is superadmin-only
    profile.tsx
```

The role split is presentational only. An admin and a cashier hold the same
Postgres role (`authenticated`); what actually separates them is RLS policies
that test `profiles.role`.

## State

Three React contexts, all mounted in `app/_layout.tsx`:

**`AuthContext`** — wraps the Supabase session and fetches the matching
`profiles` row. Exposes `{ session, profile, loading }`. Note it selects
explicit columns (`id, role, name`), never `select("*")`; `pin_hash` is not
readable by clients and a wildcard select would fail.

**`OrderContext`** — the bulk of the domain logic. Holds `orders` and `menu` in
memory and exposes:

| Method | Purpose |
| --- | --- |
| `addOrder(order, force?)` | create order + items, then deduct stock |
| `updateOrder(id, partial, force?)` | edit an open order |
| `cancelOrderWithPin(orderId, pin)` | manager-approved cancellation |
| `markPaid(id, discount, method, amount)` | close out an order |
| `toggleMenuAvailability(menuId)` | flip `menus.available`, via the `toggle_menu_availability` RPC |
| `refetch()` | reload from the database |

`force` on the first two bypasses the insufficient-stock guard when the user
explicitly confirms a shortage. `menu` only ever holds `is_active = true`
rows — `fetchMenu()` filters at the query, so a soft-deleted menu
disappears from ordering and availability without any extra client-side
filtering.

**`PrinterContext`** — remembers a Bluetooth device per role
(`"cashier" | "kitchen"`), so receipts and kitchen tickets can go to different
printers.

`hooks/useUser.ts` merges `session.user.email` into the profile for display.

## Order lifecycle

```
        addOrder                markPaid              cancel_order_with_pin_v2
  ──────────────▶  unpaid  ──────────────▶  paid                │
                     │                                          │
                     └──────────────────────────────────────────┴──▶ cancelled
```

`orders.status` is `'unpaid' | 'paid' | 'cancelled'`, defaulting to `'unpaid'`.

An **unpaid** order is an open tab: cashiers freely add, remove and edit line
items. Once it is **paid** or **cancelled** the line items are frozen by a
database trigger — see [security.md](security.md#the-order_items-lock).

Cancellation never happens by a direct write. A trigger rejects any update that
moves `status` to `'cancelled'` unless a transaction-local flag is set, and only
the PIN RPCs set it.

## Stock and cost

Stock is deducted **when an order is created or edited**, not at payment.
`OrderContext` calls two RPCs:

- `check_stock_for_order(p_items jsonb)` → returns a `shortages` array; the UI
  uses it to warn before committing
- `deduct_stock_for_order(p_order_id, p_force)` → decrements `stock.quantity`
  per `menu_ingredients` recipe and flags `order_items.is_stock_deducted`

`p_force := true` skips the shortage check, for when a manager decides to sell
anyway.

Increasing `stock.quantity` fires the `after_stock_change` trigger, which writes
a row into `expenses` — so purchases are recorded by restocking rather than by
separate data entry.

Menu cost of goods works two ways, chosen per item by `menus.cogs_mode`:

- `'ingredients'` — summed from `menu_ingredients` × `stock.price_per_unit`
- `'manual'` — a flat figure in `menus.manual_cogs`

## Money

`lib/constants.ts` holds `TAX_RATE = 0.1`, the single source of truth shared by
order totals, the sales screens and receipts. Totals are computed as:

```
subtotal = Σ (price × quantity)
total    = subtotal × (1 − discount/100) × (1 + TAX_RATE)
```

`orders.discount` is a whole-number percentage constrained to 0–100. All money
columns are integer Rupiah; there are no fractional currency units.

## Printing

`lib/printer.ts` drives `@vardrz/react-native-bluetooth-escpos-printer`:
`scanAndConnectPrinter()`, `connectToPrinter(address)`, `printReceipt(...)`.
`lib/printer.web.ts` is the web stub, picked up automatically by Metro's
platform-extension resolution.

The receipt logo is inlined as base64 in `lib/printerLogo.ts` rather than loaded
from `assets/`. On Android release builds a bundled image becomes an APK
drawable resource with no file URI, which the filesystem API cannot read — the
constant sidesteps that entirely. Details in
[troubleshooting.md](troubleshooting.md#receipt-logo-fails-on-release-builds-only).
