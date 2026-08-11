# Database

Postgres 17 on Supabase. Everything lives in the `public` schema; `pgcrypto`
and `uuid-ossp` are installed in `extensions`.

The full schema is versioned under [`../supabase/migrations/`](../supabase/migrations).
`20260101000000_baseline.sql` is a reconstruction of the schema as it stood
before it was put under version control; every file after it is an incremental
change.

## Tables

### `profiles`
One row per auth user, created automatically by the `on_auth_user_created`
trigger on `auth.users`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | text | `'cashier'` (default), `'admin'` or `'superadmin'` — see [security.md](security.md#role-model) |
| `name` | text | display name |
| `pin_hash` | text | bcrypt hash of a 6-digit manager PIN; **not client-readable** |

Clients are granted `select (id, role, name)` only. A `select("*")` will fail —
this is intentional, see [security.md](security.md#pin-storage).

### `menus`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `name` | text | |
| `price` | integer | Rupiah, `> 0` |
| `category` | text | see `MenuCategory` in `types/order.ts` |
| `available` | boolean | default `true`; toggled from the cashier availability tab via `toggle_menu_availability` |
| `cogs_mode` | text | `'ingredients'` or `'manual'`; `superadmin`-only to change |
| `manual_cogs` | numeric | null unless `cogs_mode = 'manual'`; `>= 0`; `superadmin`-only to change |
| `is_active` | boolean | default `true`; `false` = soft-deleted, hidden from ordering/availability/COGS lists |

### `stock`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `name`, `unit` | text | |
| `quantity` | numeric | default 0 |
| `price_per_unit` | integer | Rupiah |
| `updated_at`, `last_purchase_date` | timestamptz | |
| `is_active` | boolean | default `true`; `false` = soft-deleted, hidden from restock/recipe pickers |

Raising `quantity` fires `after_stock_change`, which logs an `expenses` row.

### `menu_ingredients`
Recipe join table. `menu_id` → `menus`, `stock_id` → `stock`, both
ON DELETE CASCADE. `quantity` is stock units consumed per one menu item.

### `orders`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `customer_name`, `seat` | text | |
| `discount` | integer | percentage, 0–100 |
| `status` | text | `'unpaid'` (default), `'paid'`, `'cancelled'` |
| `method_of_payment` | text | `'QRIS'`, `'Bank Transfer'` or `'Cash'` |
| `is_dine_in` | boolean | false = takeaway |
| `payment_amount` | integer | tendered amount |
| `created_at` | timestamptz | |

`status` has no CHECK constraint — the allowed values are enforced by
convention and by the `OrderStatus` type in `types/order.ts`.

### `order_items`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `order_id` | bigint | → `orders(id)` ON DELETE CASCADE |
| `menu_id` | bigint | → `menus(id)` |
| `name`, `price`, `quantity` | | copied from the menu at order time, so later price changes do not rewrite history |
| `is_sent` | boolean | sent to the kitchen |
| `is_cancelled` | boolean | |
| `print_batch` | integer | groups items across repeated kitchen tickets |
| `notes` | text | |
| `is_stock_deducted` | boolean | guards against double-deducting |

### `expenses`
Written by the `log_stock_expense` trigger, never by the app.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity, BY DEFAULT |
| `name`, `quantity`, `price_per_unit` | | |
| `total_cost` | numeric | generated: `quantity * price_per_unit` |
| `expense_date`, `created_at` | timestamptz | |

### `order_override_log`
Audit trail for PIN-gated actions. Written by the RPCs, readable only by admins.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `order_id` | bigint | nulled out if the order is hard-deleted, so the trail survives |
| `cashier_id` | uuid | who attempted it (`auth.uid()`) |
| `admin_id` | uuid | whose PIN matched; null on failure |
| `action` | text | `cancel`, `delete`, `cancel_blocked`, `delete_blocked` |
| `success` | boolean | |
| `created_at` | timestamptz | |

Failed attempts are recorded deliberately — the lockout counts them.

## Functions

| Function | Returns | Notes |
| --- | --- | --- |
| `handle_new_user()` | trigger | creates a `profiles` row, always as `'cashier'` |
| `check_stock_for_order(jsonb)` | jsonb | `{shortages: [...]}`, no writes |
| `deduct_stock_for_order(int, bool)` | void | decrements stock; `p_force` skips the shortage check |
| `log_stock_expense()` | trigger | logs an `expenses` row when stock rises |
| `prevent_direct_cancel()` | trigger | blocks `status → 'cancelled'` without the PIN flag |
| `prevent_locked_order_item_change()` | trigger | freezes `order_items` on paid/cancelled orders |
| `pin_attempts_exhausted(uuid)` | boolean | 5 failures in 15 minutes |
| `cancel_order_with_pin(bigint, text)` | boolean | **legacy**, kept for older installs |
| `cancel_order_with_pin_v2(bigint, text)` | jsonb | current; returns a reason on failure |
| `delete_order_with_pin(bigint, text)` | boolean | hard delete; not wired to any UI |
| `toggle_menu_availability(bigint)` | void | flips `menus.available`; callable by any authenticated staff account, since `cashier` has no general write access to `menus` |

All are `SECURITY DEFINER` with a pinned `search_path`. Any function calling
pgcrypto uses `extensions.crypt(...)` explicitly — a bare `crypt()` fails, see
[troubleshooting.md](troubleshooting.md#function-crypttext-text-does-not-exist).

### `cancel_order_with_pin_v2` result shape

```jsonc
{ "ok": true }
{ "ok": false, "reason": "invalid_pin", "attempts_left": 3 }
{ "ok": false, "reason": "locked_out",  "retry_after_seconds": 420 }
```

Added alongside the boolean v1 rather than replacing it. There is no OTA update
channel, so older installs are still running code that does `if (!data)` — and a
jsonb object is always truthy, which would make a rejected PIN read as success.
Retire v1 once every device is on a current build.

## Triggers

| Trigger | Table | Function |
| --- | --- | --- |
| `on_auth_user_created` | `auth.users` | `handle_new_user` |
| `after_stock_change` | `stock` | `log_stock_expense` |
| `enforce_cancel_via_rpc` | `orders` | `prevent_direct_cancel` |
| `enforce_items_locked_after_payment` | `order_items` | `prevent_locked_order_item_change` |

## Migrations

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file into the Supabase SQL Editor in filename order. The CLI's
database commands may fail on some projects — see
[troubleshooting.md](troubleshooting.md#supabase-cli-database-commands-fail).

Migrations are written to be idempotent (`if not exists`, `create or replace`,
`drop trigger if exists`) so they can be replayed over an existing database.
The one exception is `CREATE POLICY`, which has no `IF NOT EXISTS` in Postgres —
the baseline deliberately omits policies that later migrations create.

The baseline has **not** been verified by replaying it onto an empty database.
It covers `public` only: Auth settings, Storage config and anything outside that
schema must be recreated by hand.
