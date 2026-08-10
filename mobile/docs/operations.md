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

### Promote to admin

```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

Only do this for people who genuinely administer the system. The PIN gate
constrains cashiers, not admins — every extra admin is one more person who can
cancel sales without approval.

### Remove someone

Delete the user in Dashboard → Authentication → Users. `profiles` cascades. Their
`order_override_log` rows keep the now-dangling `cashier_id`, preserving history.

## Manager PINs

### Set or change

The same statement does both — it overwrites:

```sql
update public.profiles
set pin_hash = extensions.crypt('<6-digit-pin>', extensions.gen_salt('bf'))
where id = '<admin-uuid>';
```

### Verify

```sql
select pin_hash = extensions.crypt('<the-pin>', pin_hash) as matches
from public.profiles where id = '<admin-uuid>';
```

### Revoke

```sql
update public.profiles set pin_hash = null where id = '<admin-uuid>';
```

Rules, repeated because getting them wrong is quiet and costly:

1. **Exactly 6 digits** — the keypad cannot submit anything shorter, so a
   4-digit PIN locks that admin out of approving anything.
2. **A different PIN per admin** — shared PINs make the audit log name the wrong
   approver.
3. Note the `extensions.` prefix on both functions.

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
