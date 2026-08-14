# Security model

## Premise

The app ships with a publishable Supabase key compiled into the bundle. Anyone
holding an APK can extract it and call the API directly. So the working
assumption is:

> Every client-side check is a convenience. If a rule matters, it lives in the
> database.

## Authentication and roles

Supabase Auth issues the session. A `profiles` row is created for every new
account by the `on_auth_user_created` trigger, always with `role = 'cashier'`.

**Roles are not client-assignable.** `handle_new_user()` previously copied the
role out of `raw_user_meta_data`, which is whatever the client passes to
`signUp()` — meaning anyone with the publishable key could register themselves
as an admin and bypass the entire PIN system. It is now hardcoded. Promotion is
a deliberate act:

```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
-- or 'superadmin'
```

`profiles` has no UPDATE policy, so clients cannot change their own role either.

All three roles authenticate as the same Postgres role (`authenticated`). What
separates them is RLS policies testing `profiles.role`.

### Role model

| Role | Can do |
| --- | --- |
| `cashier` | Add/edit/pay orders; cancel with manager PIN (same as everyone); toggle menu availability (via `toggle_menu_availability`, not a direct table write) |
| `admin` | Everything `cashier` can do, plus: restock existing items (`stock` update), edit menu recipes (`menu_ingredients`), read sales/expense reports |
| `superadmin` | Everything `admin` can do, plus: create new stock item types, create/soft-delete/restore menu items, edit a menu's cost mode (`cogs_mode` / `manual_cogs`), correct a stock item's quantity/price directly (`correct_stock`), delete a bad `expenses` row (`delete_expense_entry`) |

`admin` deliberately has **no** write access to `menus` itself — only to
`menu_ingredients` (recipe rows) and `stock`. Cost mode and menu
creation/removal are `superadmin`-only. This is enforced by RLS, not just
hidden in the UI — an `admin` account cannot pass a crafted request to change
`menus` either. `stock` and `menu_ingredients` writes, by contrast, follow the
app's existing coarser convention (see "Known-permissive by design" below):
RLS gates by role, and the UI is trusted not to expose fields a role
shouldn't touch.

"Removing" a `stock` or `menus` row is a soft delete (`is_active = false`,
added in `20260810140939_add_superadmin_role.sql`) rather than a real
`DELETE` — neither table has a DELETE policy, matching `orders`. This keeps
`order_items` and `menu_ingredients` resolvable for historical orders and
recipes after an item is removed from active use.

### Stock corrections

Ordinary restocking is additive and always logs an `expenses` row via the
`log_stock_expense` trigger — it's designed to represent a real purchase.
`correct_stock` exists for fixing a data-entry mistake (wrong quantity or
price), not recording a purchase, so it needs to bypass that side effect
rather than trigger it.

It does this the same way `enforce_cancel_via_rpc` does — a transaction-local
flag checked inside the trigger (`app.stock_correction`, set via
`set_config(..., is_local => true)` for the duration of the RPC's
transaction, same mechanism as `app.pin_verified`). Both `correct_stock` and
`delete_expense_entry` are `superadmin`-only and write to
`admin_correction_log` instead of `expenses`, so there's still a trail of
what changed, without it reading as a real purchase in sales/expense
reporting.

## PIN-gated cancellation

Cancelling an order voids a sale, so it needs manager approval. Enforcement is
in two parts:

1. `enforce_cancel_via_rpc`, a BEFORE UPDATE trigger on `orders`, rejects any
   transition into `status = 'cancelled'` unless the transaction-local setting
   `app.pin_verified` is `'true'`.
2. Only `cancel_order_with_pin_v2` (and the legacy v1, and
   `delete_order_with_pin`) set that flag, and only after matching the submitted
   PIN against an admin's bcrypt hash.

A cashier calling `UPDATE orders SET status='cancelled'` directly gets `42501`.

The flag is set with `set_config(..., is_local => true)`, so it is scoped to the
transaction, and it is cleared immediately after the update so no later
statement in the same transaction inherits it.

### The `order_items` lock

Guarding `orders.status` alone left a hole: cashiers hold UPDATE and DELETE
policies on `order_items`, so they could void a paid sale by flipping every line
to `is_cancelled` or deleting the lines outright — no PIN, no audit record.

`enforce_items_locked_after_payment` closes it. On a **paid or cancelled** order:

- `INSERT` and `DELETE` are refused outright — adding or removing lines is the
  attack itself
- `UPDATE` is refused if it changes `order_id`, `menu_id`, `name`, `price`,
  `quantity`, `is_cancelled` or `is_stock_deducted` — what was sold, what it
  cost, and what stock it consumed
- `UPDATE` is allowed if it only touches fulfilment bookkeeping: `is_sent`,
  `print_batch`, `notes`

`is_stock_deducted` is locked because resetting it to `false` on a closed order
and re-running `deduct_stock_for_order` would decrement stock twice. The
resulting shortfall is indistinguishable from ordinary consumption, so it could
hide ingredients going missing. Nothing legitimately writes that column after
payment — both `deduct_stock_for_order` call sites run while the order is open.

The PIN RPCs are exempt via the same `app.pin_verified` flag.

That last allowance exists because reprinting a kitchen ticket marks its lines
as sent, and the reprint button is available on closed orders. A blanket lock
broke it. Marking an item as sent says nothing about what was charged, so it is
outside the threat this guards against.

Verified against the existing flows before it shipped:

- `deduct_stock_for_order` writes `order_items.is_stock_deducted`, but both call
  sites run while the order is unpaid — stock is deducted at creation/edit, not
  at payment
- `markPaid` touches only the `orders` row

One flow was missed and had to be fixed afterwards: kitchen reprints on closed
orders. Worth remembering that `updateOrder` replaces the entire item set with a
delete + reinsert, so any path routed through it counts as an INSERT/DELETE, not
an UPDATE. `markItemsSent` exists to avoid exactly that.

### PIN storage

PINs are bcrypt hashes (`extensions.crypt(pin, extensions.gen_salt('bf'))`) in
`profiles.pin_hash`. `gen_salt` produces a fresh random salt per call, so two
admins with the same PIN still get different hashes.

The hash is **not readable by clients**. A 6-digit PIN behind bcrypt falls to
offline brute force quickly, so the column is excluded from the client grant:

```sql
revoke select on public.profiles from authenticated, anon;
grant select (id, role, name) on public.profiles to authenticated, anon;
```

A column-level `REVOKE SELECT (pin_hash)` alone would have been a silent no-op —
column revokes cannot subtract from a table-level grant. Any column added to
`profiles` later must be added to that grant to be readable.

### Lockout

`pin_attempts_exhausted()` counts failed `cancel`/`delete` attempts by the
current user in the last 15 minutes; at 5 the RPCs refuse and log a
`cancel_blocked` / `delete_blocked` row. Those blocked rows are excluded from the
count, so a locked-out user cannot extend their own lockout indefinitely.

Failures **return** rather than `RAISE`. Raising would roll back the audit insert
and destroy the very counter the lockout reads.

With 10⁶ combinations and 5 attempts per 15 minutes, exhausting the space takes
years.

### PIN rules

0. **Only a superadmin PIN approves.** All three PIN RPCs match
   `role = 'superadmin'`. A PIN on an `admin` account is inert — it hashes and
   stores without complaint but never matches, so the failure looks like a
   mistyped PIN rather than a misconfiguration. At least one superadmin PIN must
   exist or nothing can be cancelled at all.
1. **Exactly 6 digits.** `PinOverrideModal` only enables its confirm button at
   `pin.length === 6`. A 4-digit PIN hashes fine but can never be submitted, so
   that superadmin could never approve anything. Nothing server-side enforces
   length.
2. **A different PIN per superadmin.** The RPC identifies the approver by testing
   the submitted PIN against every superadmin hash and taking `limit 1`. Shared
   PINs make `order_override_log.admin_id` name the wrong person.

## Row Level Security

RLS is enabled on every table in `public`.

| Table | Effective policy |
| --- | --- |
| `profiles` | read own row only; no INSERT/UPDATE/DELETE policy, so clients cannot write |
| `menus` | anyone authenticated reads; only `superadmin` writes (insert or update); **no DELETE policy** — removal is `is_active = false` |
| `menu_ingredients` | anyone authenticated reads; `admin` and `superadmin` manage |
| `stock` | `admin` and `superadmin` read and update (restock); only `superadmin` inserts; **no DELETE policy** — removal is `is_active = false` |
| `orders` | authenticated read/insert/update; **no DELETE policy** |
| `order_items` | authenticated full access, narrowed by the trigger above |
| `expenses` | admins read only; writes come from the trigger; deletes come only from `delete_expense_entry` |
| `order_override_log` | admins read only; writes come from the definer functions |
| `admin_correction_log` | `superadmin` read only; writes come from `correct_stock` / `delete_expense_entry` |

`toggle_menu_availability(p_menu_id)` is a `SECURITY DEFINER` RPC any
authenticated staff account can call — it exists because `cashier` needs to
flip `menus.available` but has no general write access to `menus`. It only
ever touches that one boolean.

`order_override_log` and `expenses` have no INSERT policy at all. Their writers
are `SECURITY DEFINER` functions owned by `postgres`, which also owns the tables,
and `FORCE ROW LEVEL SECURITY` is off — so the owner bypasses RLS. **If anyone
enables `FORCE` on those tables, both silently break.**

### Known-permissive by design

`orders` has an UPDATE policy of `using (true)` for `authenticated`. Any
signed-in user can edit any order. That matches how a shared-terminal POS is
used, and the cancellation path is separately gated. Supabase's advisor flags it;
it is a deliberate accepted risk.

`orders` also carries duplicated policy pairs (two SELECT, two UPDATE) from
earlier iterations. Permissive policies OR together, so the `using (true)` pair
is what applies and the `auth.role()` pair is dead weight. Worth collapsing.

## Hardening applied

Recorded here because the reasoning is easy to lose:

| Issue | Fix |
| --- | --- |
| Signup could self-assign `role: 'admin'` | `handle_new_user` hardcodes `'cashier'` |
| `deduct_stock_for_order` / `check_stock_for_order` callable by `anon` | EXECUTE revoked; `p_force := true` would otherwise have let anyone drain inventory unauthenticated |
| Those plus `log_stock_expense` ran with a mutable `search_path` | pinned to `public` — **not** `''`, since their bodies reference tables unqualified |
| Trigger functions exposed as RPC endpoints | EXECUTE revoked from `anon` and `authenticated` |
| `expenses` world-readable and world-writable (`WITH CHECK (true)` to `public`) | replaced with an admin-scoped read; `anon` grants revoked |
| `pin_hash` readable by clients | table grant replaced with a column grant |
| `delete_order_with_pin` had `search_path = public` | its bare `crypt()` failed on every call; now `public, extensions` |
| `toggle_menu_availability` callable by `anon` (unauthenticated) | this project grants new `public` functions EXECUTE for `anon` by default, so `revoke ... from public` alone doesn't touch it — needs `revoke ... from anon` by name, same as the row above |

Re-check any time with:

```sh
# via the Supabase MCP server, or the Advisors tab in the dashboard
get_advisors(type: "security")
```

## Outstanding

- Retire `cancel_order_with_pin` (v1) once every device runs a current build
- Most accounts are admins; the PIN gate only constrains non-admins, so shrinking
  that set matters more than setting more PINs
- Delete the `TEST Admin` / `TEST Kasir` production accounts
- Enable leaked-password protection in Auth settings
- Collapse the duplicate `orders` policies
