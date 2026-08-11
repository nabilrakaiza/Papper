# Troubleshooting

Every entry here is something that actually happened on this project. Symptoms
first, because that is what you will have.

## Database

### `function crypt(text, text) does not exist`

pgcrypto is installed in the `extensions` schema on Supabase, not `public`. A
bare `crypt()` inside a function with `search_path = public` cannot see it.

Fix: qualify the call as `extensions.crypt(...)` / `extensions.gen_salt(...)`
**and** include `extensions` in the function's `search_path`. Relying on the
search_path alone works until someone edits the `SET` clause.

This shipped undetected in `delete_order_with_pin` for a while — it failed on
every invocation, and nothing called it, so nobody noticed.

### A column-level `REVOKE SELECT` did nothing

Postgres will not let a column-level revoke subtract from a table-level grant.
If the role holds table-wide `SELECT`, `REVOKE SELECT (col)` is a silent no-op.

Fix: revoke at table level, then grant back the columns you want.

```sql
revoke select on public.profiles from authenticated, anon;
grant select (id, role, name) on public.profiles to authenticated, anon;
```

Consequence: any column added later is invisible to clients until added to that
grant.

### `SECURITY DEFINER` function suddenly cannot write

Definer functions bypass RLS because they run as the table owner and
`FORCE ROW LEVEL SECURITY` is off. Turning `FORCE` on breaks that silently —
`log_stock_expense` and the override-log writes both depend on it, and neither
table has an INSERT policy to fall back on.

### `search_path = ''` broke a function

An empty search_path requires every identifier to be schema-qualified.
`deduct_stock_for_order` and friends reference `stock`, `order_items` and
`menu_ingredients` unqualified, so they need `search_path = public`, not `''`.
`handle_new_user` can use `''` because it already writes `public.profiles`.

### Supabase CLI database commands fail

```
LegacyDbConfigLoginRoleStatusError
permission denied to alter role ... cli_login_postgres
```

`supabase link` succeeds and `supabase projects list` works, but `db dump`,
`db push` and `migration list` all fail — the CLI cannot provision its temporary
login role.

Workarounds: pass a direct connection string (`--db-url`), apply migrations
through the SQL Editor, or use the Supabase MCP server's `apply_migration`.

### `pg_dump` refuses to run

```
server version: 17.x; pg_dump version: 14.x; aborting
```

Homebrew's default `postgresql` formula is client 14; Supabase runs 17, and
`pg_dump` will not dump from a newer server. Use `supabase db dump` (which
bundles a matching binary) or install `postgresql@17`.

Also note Supabase has dropped direct-connection IPv4 — a manual `pg_dump` needs
the **pooler** host, not `db.<ref>.supabase.co`.

## Build and tooling

### `Cannot find module 'babel-preset-expo'`

`babel.config.js` names the preset directly, but nothing declared it as a
dependency, so npm nested it under `node_modules/expo/node_modules/` where Babel
— which resolves presets relative to the config file — cannot see it.

Fix: declare it explicitly, at the version `expo` itself depends on.

```sh
npx expo install --check    # or: npm i -D babel-preset-expo@~54.0.11
```

### npm fails with `EACCES` / `EEXIST` in `~/.npm` or `node_modules`

A past `sudo npm install` leaves root-owned files. npm then cannot manage the
tree as your user, and installs fail in confusing ways — partially pruned
`node_modules`, packages that vanish, temp-directory rename errors.

```sh
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /path/to/mobile/node_modules
npm install
```

You cannot `rm -rf node_modules` your way out: removing files inside a
root-owned directory needs write permission *on that directory*.

### EAS: `npm ci can only install packages when package.json and package-lock.json are in sync`

The lockfile does not satisfy `package.json`. If the listed missing packages are
at versions far newer than anything installed, the real cause is usually a
dependency set that cannot be resolved at all — for example Expo SDK 57 declared
alongside `react-native@0.81.5`, which needs SDK 54.

Check the actual pairing before regenerating:

```sh
node -e "const p=require('./package.json');console.log(p.dependencies.expo,p.dependencies['react-native'])"
```

Regenerate the lockfile without touching `node_modules` (useful when ownership
is broken):

```sh
npm install --package-lock-only
npm ci --include=dev --dry-run   # the exact check EAS runs
```

### Gradle exits 1 with no output at all

No stack trace, nothing in `~/.gradle/daemon/*/daemon-*.log`, and
`./gradlew --version` works fine.

This is the machine running out of memory. Gradle forks a daemon for the
configured heap (`org.gradle.jvmargs`), the OS kills it before it can log
anything, and the wrapper just returns 1.

```sh
vm_stat | head -3      # "Pages free" × 16384 = bytes actually free
sysctl vm.swapusage
```

Fixes, in order of effectiveness: close memory-heavy apps, kill stale daemons
(`pgrep -f GradleDaemon | xargs kill -9` — `gradlew --stop` skips daemons it
considers "incompatible"), lower `org.gradle.jvmargs`, set
`org.gradle.parallel=false`, or build on EAS instead.

`java -Xmx2048m -version` succeeding proves nothing — it exits before committing
the heap.

### `Failed to resolve the Android SDK path`

`android/local.properties` points at an SDK that is not there. Installing
`android-platform-tools` gives you `adb` only, not the SDK.

```sh
brew install --cask android-commandlinetools
sdkmanager --sdk_root=$HOME/Library/Android/sdk \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "cmake;3.22.1"
export ANDROID_HOME=$HOME/Library/Android/sdk
```

Homebrew **casks** work even when formulae fail to build against outdated Xcode
Command Line Tools, since casks are prebuilt binaries.

### An `npx`-launched MCP server will not start

If `~/.npm` is root-owned, `npx` cannot download the package and the server dies
with "Connection closed". Either fix ownership, or point that server at its own
cache with an `npm_config_cache` environment variable in its config.

## Runtime

### Receipt logo fails on release builds only

```
call to function 'ExponentFileSystem.readAsStringAsync' has been rejected
caused by java.io.IOException: Unsupported scheme for 'assets_images_logonabawi'
```

On Android release builds a bundled image is compiled into the APK as a drawable
resource. `Asset.localUri` is null and `Asset.uri` is a bare resource name with
no scheme, so the filesystem API cannot read it. Under Metro it works, because
dev assets are served over `http://`.

Fix: the logo is inlined as base64 in `lib/printerLogo.ts`. No asset resolution,
no filesystem call, identical in dev and release. Regeneration instructions are
in that file's header.

The same trap applies to any bundled asset read through `expo-file-system`.

### The app cannot reach Supabase in an EAS build

`EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` were undefined at build time. `.env` is
gitignored, so EAS never receives it — the values must exist as EAS environment
variables. See [development.md](development.md#building-an-installable-apk).

### A locked-out admin is told "PIN salah"

Fixed, but only in current builds. The legacy `cancel_order_with_pin` returns a
bare boolean, so the client cannot distinguish a wrong PIN from a lockout.
`cancel_order_with_pin_v2` returns a reason. Older installs still call v1.

### Expo Go crashes or the printer module is missing

Expected. `@vardrz/react-native-bluetooth-escpos-printer` is not in Expo Go —
use a development build or an EAS build.

### Web build hangs on the loading screen after a reload

Loads fine, then a later reload spins forever with no error. A hard refresh
(Cmd/Ctrl+Shift+R) or opening in a private window fixes it immediately.

`@supabase/supabase-js` v2 coordinates session refresh across tabs/reloads
using the browser's Web Locks API. A reload that interrupts a request
mid-flight (or a dev-server hot-reload) can leave a stale lock behind; the
next page load then waits on a lock nothing will ever release. Hit
repeatedly while testing on `expo start --web` with frequent reloads —
normal usage doesn't reload nearly often enough to trigger it in practice.

No code fix applied; if it starts happening in real usage rather than during
rapid manual testing, look at `auth.lock` in `createClient`'s options in
`lib/supabase.ts`.

### An old debug APK behaves strangely after dependency changes

Debug builds load JS from Metro but keep whatever native modules were compiled
in. If a native dependency was added since, the new JS calls into a module that
does not exist. Rebuild.
