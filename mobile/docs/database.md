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
| `is_dine_in` | boolean | false = takeaway |
| `created_at` | timestamptz | |

`status` has no CHECK constraint — the allowed values are enforced by
convention and by the `OrderStatus` type in `types/order.ts`.

**There are no payment columns on `orders`.** How an order was paid lives in
[`order_payments`](#order_payments) and nowhere else. `orders` carried
`method_of_payment` and `payment_amount` until `20260906100100`; the latter is
why they went, because it held the cash *tendered* for `Cash` and the *bill* for
every other method, so it could not be summed into a revenue figure and the
receipt printed a recomputed total rather than trusting it. Neither column could
describe a split bill at all.

History was moved across by `20260906100000_backfill_order_payments.sql` before
the columns were dropped. **`20260906100100` is the one migration in this project
that is not backwards compatible**: builds predating the split-bill release write
both columns in `markPaid`, so any tablet still on such a build cannot take
payment against this schema.

### `order_items`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `order_id` | bigint | → `orders(id)` ON DELETE CASCADE |
| `menu_id` | bigint | → `menus(id)`, **nullable** — NULL marks a custom off-menu item priced by the cashier |
| `name`, `price`, `quantity` | | copied from the menu at order time, so later price changes do not rewrite history |
| `is_sent` | boolean | sent to the kitchen |
| `is_cancelled` | boolean | |
| `print_batch` | integer | groups items across repeated kitchen tickets |
| `notes` | text | |
| `is_stock_deducted` | boolean | NOT NULL, default `false`; guards against double-deducting |
| `customer_num` | integer | NOT NULL, default 1 — which payer settles this line on a split bill |

`is_stock_deducted` has to survive an edit. The screens keep it on lines they
carry over and leave it unset on lines they add, so `deduct_stock_for_order`
only ever sees genuinely new quantity. Resetting it made each re-save deduct the
entire order's ingredients again.

It is NOT NULL as of `20260906091500`. It was previously nullable with no
default, and `deduct_stock_for_order` selects `where is_stock_deducted = false`
— NULL is not false, so a row written without the column would silently never
consume stock and never be marked.

Line items are edited through `save_order_items`, **not** by replacing the whole
set. See [Editing line items](#editing-line-items).

**Stock is never returned.** Reducing a line's quantity does not credit stock
back, and neither does cancelling an order — `cancel_order_with_pin_v2` flips
the statuses and nothing touches `stock`. This is a deliberate decision, not an
oversight: by the time an order is cancelled or trimmed the food is usually
part-cooked, and there is no way to know whether it gets served to someone else
or thrown away. Assuming it is gone can only make recorded stock *lower* than
reality, which is the safe direction — the opposite error would have the app
promising ingredients that are not on the shelf.

The consequence to remember when reading any stock figure: recorded stock is a
floor, not an exact count, and periodic `correct_stock` reconciliation against
a physical count is the intended correction path.

A NULL `menu_id` is a custom line item: something sold that isn't on the menu,
with a name and price typed by the cashier. It has no row in `menus` and so no
recipe, which means the stock RPCs find no ingredients for it and it never
deducts stock or blocks an order for a shortage. It is otherwise an ordinary
line — it counts toward the subtotal, discount and tax, prints on kitchen
tickets and receipts, and appears in the sales reports, all of which read the
denormalised `name`/`price`/`quantity` rather than joining `menus`.

#### Editing line items

`save_order_items(p_order_id, p_items jsonb, p_force boolean)` is the only path
that edits an order's lines. A payload entry carrying an `id` updates that row,
one without an `id` is inserted, and any row absent from the payload is deleted.
**Columns the payload does not mention are left untouched.**

That last property is the point. It replaced a delete-everything-and-reinsert,
which had to restate every column and therefore destroyed any column it forgot.
That produced both of the bugs described above and below — `is_stock_deducted`
reset on every save, and a revert path that carried a `category` key
`order_items` has no column for. A wholesale rewrite re-arms that trap every
time a column is added, and `customer_num` is a column that was added.

The RPC calls `deduct_stock_for_order` as its final act, inside the same
transaction, so a shortage aborts the whole edit. This retired a hand-rolled
revert that issued its own compensating writes and could itself fail, logging
`CRITICAL: Failed to revert order items` and leaving the order in neither state.

It is `SECURITY INVOKER` — cashiers already hold every grant it needs, so RLS
and both `order_items` triggers apply to its writes exactly as to a direct one.
It is not a way around the paid-order lock or the per-payer lock.

### `order_payments`
**The record of how an order was paid.** One row for an ordinary order, one per
payer for a split bill, none at all while the order is still open.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `order_id` | bigint | → `orders(id)` ON DELETE CASCADE |
| `customer_num` | integer | matches `order_items.customer_num`; unique per order |
| `customer_label` | text | the name the cashier typed for this payer, for the receipt |
| `amount` | integer | this payer's share of the bill — the revenue figure. `>= 0`, because a 100% discount is a real bill of nothing |
| `amount_tendered` | integer | cash handed over, for change. NULL for every other method |
| `method_of_payment` | text | one of the four real methods; never `'Split'` |
| `created_at` | timestamptz | |

`amount` and `amount_tendered` are deliberately separate, which is the whole
point of the table. The `orders.payment_amount` it replaced conflated them: for
cash it held the tender, so it overstated takings by whatever change was given
and could not be summed. `order_payments.amount` is always the bill and is
directly summable; `amount_tendered` is only ever cash actually handed over.

Writing order for an ordinary payment is **payment row first, then close the
order**. `prevent_locked_order_payment_change` refuses any write against an
order that is already `paid`, so closing first would lock the order against the
very row that records how it was paid.

**A payment row locks that payer's line items**, even while the order as a whole
is still `unpaid`. Payment used to lock everything at once, but a split order
stays open until the last payer settles — without this, the first payer's items
would still be editable after they had paid and left, free to disagree with the
receipt in their hand. Fulfilment bookkeeping (`is_sent`, `print_batch`,
`notes`) stays open, exactly as on a fully paid order, because kitchen reprints
need it.

Splitting a bill never moves anything between orders: it is an `UPDATE` of
`order_items.customer_num`, so it reverses cleanly, stock is untouched and no
kitchen ticket is disturbed. Sibling orders were considered and rejected —
cashiers have no `DELETE` grant on `orders`, so carving an order into siblings
could never be undone at the till.

### `expenses`
Written by the `log_stock_expense` trigger; deleted only by `delete_expense_entry`
(superadmin-only, for removing an entry a mistaken restock created).

The trigger fires on `INSERT` as well as on a quantity increase. The insert
branch used to be unconditional, so creating a stock item type at quantity 0
wrote an expense row for 0 units at Rp 0 — a purchase that never happened,
sitting on Pembelian. It is now gated on `new.quantity > 0`: creating an item
*with* an opening quantity is a genuine purchase and still logs, creating an
empty one is not. Bulk imports should still set `app.stock_correction`.

Readable by `admin` **and** `superadmin`. The policy originally named `admin`
alone, which predated the superadmin role — a superadmin saw an empty Pembelian
screen with no error, because RLS filters rows rather than raising, and could
delete an expense they were not allowed to read.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity, BY DEFAULT |
| `stock_id` | bigint | → `stock(id)` ON DELETE RESTRICT, nullable — see below |
| `name` | text | the stock item's name **at purchase time**; does not follow a rename |
| `quantity`, `price_per_unit` | | as purchased |
| `total_cost` | numeric | generated: `quantity * price_per_unit` |
| `expense_date` | timestamptz | the purchase date, which may be backdated |
| `created_at` | timestamptz | when the row was written |

`stock_id` and `name` coexist on purpose. The id is the stable identity to
group by; the name is what the item was called then, denormalised the same way
`order_items.name` is. Before the id existed, expenses referenced stock by name
alone, so a rename split an item's purchase history in two with nothing
recording that the halves belonged together.

Nullable because the trigger always sets it for a restock, which leaves NULL
free to mean "not a stock purchase at all" if manual expense entry (rent,
wages, utilities) is ever added. `ON DELETE RESTRICT` rather than `SET NULL`:
stock removal is a soft delete and the table has no DELETE policy, so a hard
delete can only come from the SQL editor — refusing it while purchase history
exists is the useful outcome.

### `admin_correction_log`
Audit trail for `correct_stock` and `delete_expense_entry`. Written by those
RPCs, readable only by superadmins.

`stock_id` and `target_name` answer different questions and both are kept: the
id says *which row*, the name says *what it read as then*. Reading history by
name alone breaks at the first rename, which is why the id was added; the name
is still what a person recognises when reviewing the log months later.

It is nullable because entries written before the column existed have none, and
because an `expense_deleted` entry inherits the deleted expense's `stock_id`,
which is itself nullable. For `stock_correction` the RPC always sets it, and the
FK rejects a correction naming a stock row that does not exist.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity |
| `action` | text | `stock_correction` or `expense_deleted` |
| `superadmin_id` | uuid | who made the change |
| `stock_id` | bigint | → `stock(id)` ON DELETE RESTRICT, nullable — the row the entry is about |
| `target_name` | text | the stock item's or expense's `name` **at the time**; does not follow a rename |
| `old_quantity`, `new_quantity` | numeric | `new_quantity` is null for `expense_deleted` |
| `old_price_per_unit`, `new_price_per_unit` | integer | `new_price_per_unit` is null for `expense_deleted` |
| `note` | text | optional, entered by the superadmin |
| `created_at` | timestamptz | |

### `order_override_log`
Audit trail for PIN-gated actions. Written by the RPCs, readable by `admin` and
`superadmin`.

The read policy originally named `admin` alone — the same oversight as the
`expenses` policy above, and worse in effect: approving a cancellation is
superadmin-only, so the one person authorising every override was the one person
who could not read the record of them. It failed silently, as an empty screen.

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
| `log_stock_expense()` | trigger | logs an `expenses` row on insert, and on any quantity increase; skipped when `app.stock_correction` is set |
| `prevent_direct_cancel()` | trigger | blocks `status → 'cancelled'` without the PIN flag |
| `prevent_locked_order_item_change()` | trigger | freezes `order_items` on paid/cancelled orders |
| `pin_attempts_exhausted(uuid)` | boolean | 5 failures in 15 minutes |
| `cancel_order_with_pin(bigint, text)` | boolean | **legacy**, kept for older installs; superadmin PIN only |
| `cancel_order_with_pin_v2(bigint, text)` | jsonb | current; returns a reason on failure; superadmin PIN only |
| `delete_order_with_pin(bigint, text)` | boolean | hard delete; not wired to any UI; superadmin PIN only |
| `toggle_menu_availability(bigint)` | void | flips `menus.available`; callable by any authenticated staff account, since `cashier` has no general write access to `menus` |
| `correct_stock(bigint, numeric, integer, text)` | void | sets a `stock` row's quantity/price directly (not additive); superadmin-only; sets `app.stock_correction` so the restock trigger doesn't log it as a purchase |
| `delete_expense_entry(bigint, text)` | void | hard-deletes an `expenses` row; superadmin-only |
| `stock_usage_report(timestamptz, timestamptz)` | jsonb | ingredient consumption over a period, reconstructed from `order_items` × `menu_ingredients`; superadmin-only. Returns `{ items, unmapped }` — see below |

All are `SECURITY DEFINER` with a pinned `search_path`. Any function calling
pgcrypto uses `extensions.crypt(...)` explicitly — a bare `crypt()` fails, see
[troubleshooting.md](troubleshooting.md#function-crypttext-text-does-not-exist).

### `cancel_order_with_pin_v2` result shape

```jsonc
{ "ok": true }
{ "ok": false, "reason": "invalid_pin", "attempts_left": 3 }
{ "ok": false, "reason": "locked_out",  "retry_after_seconds": 420 }
```

### `stock_usage_report` result shape

```jsonc
{
  "items": [
    { "stock_id": 3, "stock_name": "Beras", "unit": "gr",
      "quantity_used": 7000, "price_per_unit": 450, "value_used": 3150000 }
  ],
  "unmapped": { "custom_lines": 2, "recipeless_lines": 0 }
}
```

Three properties of this report are deliberate and worth knowing before trusting
the number:

- It counts line items with `is_stock_deducted = true`, **including those on
  cancelled orders** — cancelling never returns stock, so counting them is what
  makes the figure reconcilable against the shelf.
- `unmapped` reports what could not be attributed to any ingredient: custom
  off-menu lines (no menu row) and menus costed manually (no ingredient rows).
  Neither consumes stock, and surfacing the count keeps the total from reading
  as complete when it isn't.
- Recipes are read **as they are now**. `menu_ingredients` keeps no history, so
  a recipe change retroactively alters past periods.

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
| `enforce_payments_locked_after_payment` | `order_payments` | `prevent_locked_order_payment_change` |

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

The full chain has been replayed onto an empty Postgres 17 once, in
`20260906091500`'s development, and applies cleanly in filename order. That run
had to be given the prerequisites Supabase normally provides: the `anon`,
`authenticated` and `service_role` roles, an `extensions` schema holding
`pgcrypto` and `uuid-ossp`, and an `auth` schema with a `users` table and stub
`auth.uid()` / `auth.role()`. So the migrations are known to be self-consistent,
but standing up a real project still needs a real Supabase.

The baseline covers `public` only: Auth settings, Storage config and anything
outside that schema must be recreated by hand.
