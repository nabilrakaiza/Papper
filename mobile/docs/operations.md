# Operations runbook

Everything here runs in the Supabase SQL Editor. None of it can be done from the
app, by design.

## Accounts

### List staff and PIN status

```sql
select p.id, p.name, u.email, p.role,
       (p.pin_hash is not null) as has_pin
from public.profiles p
join auth.users u on u.id = p.id
order by p.role, p.name;
```

`auth.users` is not exposed to the API, so this join only works here.

### Create an account

Add the user in Dashboard → Authentication → Users. A `profiles` row appears
automatically as a **cashier**. Signup metadata cannot set a role.

### Promote to admin or superadmin

```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
-- or
update public.profiles set role = 'superadmin' where id = '<user-uuid>';
```

Only do this for people who genuinely administer the system. The PIN gate
constrains cashiers, not admins/superadmins — every extra admin is one more
person who can cancel sales without approval. `superadmin` additionally
writes to `menus` directly (cost mode, creating/removing menu items) and
creates new stock item types — see
[security.md](security.md#role-model).

### Remove someone

Delete the user in Dashboard → Authentication → Users. `profiles` cascades. Their
`order_override_log` rows keep the now-dangling `cashier_id`, preserving history.

## Manager PINs

**Only a `superadmin` PIN approves an override.** All three PIN RPCs match
`role = 'superadmin'`. A PIN set on an `admin` account is inert — it is not
rejected at the point of setting, it simply never matches, so the cashier sees
"PIN salah", burns attempts, and gets locked out for 15 minutes. If overrides
suddenly stop working, check this first.

There must be at least one superadmin PIN at all times, or **no order can be
cancelled by anyone**.

### Set or change

The same statement does both — it overwrites:

```sql
update public.profiles
set pin_hash = extensions.crypt('<6-digit-pin>', extensions.gen_salt('bf'))
where id = '<superadmin-uuid>';
```

Find the uuid with the account listing at the top of this file, and check the
`role` column says `superadmin` before running it.

### Verify

```sql
select pin_hash = extensions.crypt('<the-pin>', pin_hash) as matches
from public.profiles where id = '<superadmin-uuid>';
```

### Revoke

```sql
update public.profiles set pin_hash = null where id = '<superadmin-uuid>';
```

Check afterwards that a superadmin PIN still exists somewhere:

```sql
select count(*) from public.profiles
where role = 'superadmin' and pin_hash is not null;
```

Rules, repeated because getting them wrong is quiet and costly:

1. **Set it on a superadmin** — a PIN on an admin account does nothing at all.
2. **Exactly 6 digits** — the keypad cannot submit anything shorter, so a
   4-digit PIN locks that superadmin out of approving anything.
3. **A different PIN per superadmin** — shared PINs make the audit log name the
   wrong approver, since the RPC takes the first hash that matches.
4. Note the `extensions.` prefix on both functions.

## Auditing overrides

Recent cancellation attempts, successful and not:

```sql
select l.created_at, l.action, l.success,
       c.name as cashier, a.name as approved_by, l.order_id
from public.order_override_log l
left join public.profiles c on c.id = l.cashier_id
left join public.profiles a on a.id = l.admin_id
order by l.created_at desc
limit 50;
```

`action = 'cancel_blocked'` means the cashier was locked out after 5 failures in
15 minutes. A run of those is worth asking about.

Who is currently locked out:

```sql
select c.name, count(*) as failures, max(l.created_at) as last_attempt
from public.order_override_log l
join public.profiles c on c.id = l.cashier_id
where l.action in ('cancel','delete') and not l.success
  and l.created_at > now() - interval '15 minutes'
group by c.name having count(*) >= 5;
```

A lockout expires on its own; there is no manual reset short of deleting log
rows, which would destroy audit history. Wait it out.

## Auditing stock corrections

Recent stock corrections and deleted expense entries — both are
`superadmin`-only, see [security.md](security.md#stock-corrections):

```sql
select l.created_at, l.action, l.target_name, s.name as by,
       l.old_quantity, l.new_quantity, l.old_price_per_unit, l.new_price_per_unit, l.note
from public.admin_correction_log l
left join public.profiles s on s.id = l.superadmin_id
order by l.created_at desc
limit 50;
```

There's no in-app history view for this, same as `order_override_log` —
check it here if a stock quantity or an expense total looks off and someone
mentions "I fixed a typo."

For one item's history, filter on `stock_id` rather than the name — `target_name`
is a snapshot of what the item was called at the time, so it misses everything
logged before a rename:

```sql
select l.created_at, l.action, l.target_name, s.name as current_name,
       l.old_quantity, l.new_quantity, l.note
from public.admin_correction_log l
join public.stock s on s.id = l.stock_id
where l.stock_id = <stock-id>
order by l.created_at desc;
```

## Menu and stock

Menu items, prices, availability and recipes are all managed in the admin tabs.
Two things are worth knowing:

- **Restocking is how expenses get recorded.** Raising `stock.quantity` fires a
  trigger that writes an `expenses` row using `price_per_unit` and
  `last_purchase_date`. There is no separate expense entry screen, and manual
  inserts into `expenses` are blocked by RLS.
- **Cost of goods is per item.** `cogs_mode = 'ingredients'` computes from the
  recipe; `'manual'` uses a flat `manual_cogs`. Items with no recipe and no
  manual figure have no cost basis and will distort margin reporting.

Both `menus` and `stock` have an `is_active` flag. "Removing" either is a
soft delete (superadmin-only, from the Stok and HPP tabs) — the row stays so
past orders and recipes still resolve, it just stops appearing in ordering,
availability, restock and recipe pickers. Restoring is the same toggle in
reverse, from the same screens.

## Printers

Configured in-app per device via `PrinterContext`, which stores one Bluetooth
device for the `cashier` role (receipts) and one for `kitchen` (tickets). The
pairing lives on the device, not in the database — a replacement phone needs
re-pairing.

Android needs `BLUETOOTH_CONNECT` and `BLUETOOTH_SCAN`, declared in `app.json`
and requested at runtime.

## Recovering the database

The schema is in [`../supabase/migrations/`](../supabase/migrations). To rebuild
from scratch: create a project, run the migrations in filename order, then
`data.sql` for the menu and stock seed rows.

`data.sql` is **gitignored** — it holds menu pricing and is not in the
repository. Keep a copy somewhere you control, or the seed is unrecoverable.

Caveats: the baseline has never been replay-verified, and it covers `public`
only. Auth configuration, Storage and anything outside that schema must be
recreated by hand. Row data other than the seed is not backed up anywhere in
this repository — use Supabase's own backups for that.
