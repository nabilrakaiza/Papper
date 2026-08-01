# Supabase schema

## The baseline is missing

`migrations/` currently contains **only** the PIN-override change. The rest of the
schema — `profiles`, `orders`, `order_items`, `stock`, `menus`, their RLS policies,
functions and triggers — exists only inside the hosted Supabase project. It is not
in git and cannot be recreated from this repo.

Until a baseline is captured, a fresh Supabase project cannot be stood up from
source, and `20260801120000_pin_override.sql` will not apply to one (it references
`public.orders` and `public.profiles`).

### Capturing it

Use the CLI, not a local `pg_dump`:

```sh
supabase db dump --schema public -f supabase/migrations/20260101000000_baseline.sql
```

The timestamp must sort **before** the PIN-override migration.

Do not reach for a local `pg_dump` here. Homebrew's default `postgresql` is
client 14, and `pg_dump` refuses to dump from a server newer than itself — Supabase
runs Postgres 15+, so it aborts with a version-mismatch error. `supabase db dump`
uses a version-matched binary. (Also note Supabase has dropped direct-connection
IPv4; a manual `pg_dump` needs the *pooler* host, not `db.<ref>.supabase.co`.)

The dump omits row data — `data.sql` at the repo root holds the `stock` and `menus`
seed inserts separately. It also omits Auth and Storage configuration and anything
outside the `public` schema; those still have to be reproduced by hand.

## Applying migrations

```sh
supabase link --project-ref <your-project-ref>   # once
supabase db push
```

Or paste each migration into Dashboard → SQL Editor in filename order.

## Promoting someone to admin

Every new account is created as a `cashier`. `handle_new_user()` used to copy the
role out of `raw_user_meta_data`, which is client-supplied at signup — so anyone
with the publishable key could register themselves as an admin. That is now
hardcoded, and roles are changed deliberately from the SQL Editor:

```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

`profiles` has no UPDATE policy, so clients cannot change a role themselves.

## Setting, changing and removing a PIN

Always from the SQL Editor, never from the app — clients cannot write `pin_hash`
and must not be able to.

First find the admin. `auth.users` is not exposed to the API, so this join only
works from the SQL Editor:

```sql
select p.id, p.name, u.email, (p.pin_hash is not null) as has_pin
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
order by p.name;
```

Set or change a PIN — the same statement does both, since it overwrites:

```sql
update public.profiles
set pin_hash = extensions.crypt('<6-digit-pin>', extensions.gen_salt('bf'))
where id = '<admin-uuid>';
```

Remove one:

```sql
update public.profiles set pin_hash = null where id = '<admin-uuid>';
```

Three rules:

1. **Exactly 6 digits.** `PinOverrideModal` only enables its confirm button at
   `pin.length === 6`, so a 4-digit PIN hashes fine but can never be submitted —
   that admin would be permanently unable to approve anything. Nothing
   server-side enforces the length.
2. **Give each admin a different PIN.** The RPC finds the approver by testing the
   submitted PIN against every admin hash and taking `limit 1`. Two admins sharing
   a PIN means both hashes match and Postgres picks arbitrarily, so
   `order_override_log.admin_id` would name someone who was not there.
3. **Never hardcode a real PIN in this repo.** It is public.

`gen_salt('bf')` generates a fresh random salt per call, so identical PINs still
produce different hashes — the hash cannot be used to tell whether two admins
share a PIN.
