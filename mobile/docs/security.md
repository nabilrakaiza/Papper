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
```

`profiles` has no UPDATE policy, so clients cannot change their own role either.

Both roles authenticate as the same Postgres role (`authenticated`). What
separates them is RLS policies testing `profiles.role`.

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

`enforce_items_locked_after_payment` closes it by enforcing what the UI already
did: **line items may only change while the parent order is unpaid.** The
cashier edit button is hidden for paid orders, so nothing legitimate regressed.
The PIN RPCs are exempt via the same `app.pin_verified` flag.

Verified against the existing flows before it shipped:

- `deduct_stock_for_order` writes `order_items.is_stock_deducted`, but both call
  sites run while the order is unpaid — stock is deducted at creation/edit, not
  at payment
- `markPaid` touches only the `orders` row

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

1. **Exactly 6 digits.** `PinOverrideModal` only enables its confirm button at
   `pin.length === 6`. A 4-digit PIN hashes fine but can never be submitted, so
   that admin could never approve anything. Nothing server-side enforces length.
2. **A different PIN per admin.** The RPC identifies the approver by testing the
   submitted PIN against every admin hash and taking `limit 1`. Shared PINs make
   `order_override_log.admin_id` name the wrong person.

## Row Level Security

RLS is enabled on every table in `public`.

| Table | Effective policy |
| --- | --- |
| `profiles` | read own row only; no INSERT/UPDATE/DELETE policy, so clients cannot write |
| `menus`, `menu_ingredients` | anyone authenticated reads; admins manage |
| `stock` | admins manage |
| `orders` | authenticated read/insert/update; **no DELETE policy** |
| `order_items` | authenticated full access, narrowed by the trigger above |
| `expenses` | admins read only; writes come from the trigger |
| `order_override_log` | admins read only; writes come from the definer functions |

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
