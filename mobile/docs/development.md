# Development

## Requirements

| Tool | Version used | Notes |
| --- | --- | --- |
| Node | 22.x | |
| npm | 11.x | |
| JDK | 21 | Android builds only |
| Android SDK | platform 36, build-tools 36.0.0, NDK 27.1.12297006, cmake 3.22.1 | local builds only |
| Expo SDK | 54 | pinned with React Native 0.81.5 |

**Expo Go will not work.** The app depends on
`@vardrz/react-native-bluetooth-escpos-printer`, a native module Expo Go does
not bundle. You need a development build or an EAS build.

## Environment

Create `mobile/.env` — it is gitignored and must stay that way:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

`EXPO_PUBLIC_*` variables are inlined into the JS bundle at build time. They end
up inside the shipped app and are not secret — that is by design, and why the
database enforces its own rules. They are still kept out of the repository.

Expo loads `.env` automatically; you will see it echo `env: load .env` on start.

## Running

Metro only, against an already-installed build:

```sh
npx expo start
adb reverse tcp:8081 tcp:8081   # USB devices
```

Full build, install and launch on a connected device:

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
npx expo run:android
```

Enable USB debugging on the phone first and confirm with `adb devices`.

Debug builds load JS from Metro at runtime, so JS-only changes need no rebuild.
Native dependency changes do.

## Building an installable APK

Local Android builds need several GB of RAM. On a constrained machine, build in
the cloud instead:

```sh
npx eas-cli build --platform android --profile preview
```

`preview` produces an `.apk` (`buildType: apk`, `distribution: internal`) — a
download link and QR code you can install directly. `production` produces an
`.aab`, which is Play Store only and **cannot** be sideloaded.

Two things to know:

**EAS builds from git, not your working directory.** Uncommitted changes are
silently excluded. Commit before building.

**`.env` is not uploaded**, because it is gitignored. The Supabase variables must
exist as EAS environment variables in the `preview` environment, which
`eas.json` points at via `"environment": "preview"`. Check with:

```sh
npx eas-cli env:list preview
```

To set them:

```sh
npx eas-cli env:push preview --path .env
```

If they already exist as *secret*, that push fails — EAS will not downgrade a
secret to plaintext. Secrets still work at build time; either leave them, or
`env:delete` both and push again.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Metro |
| `npm run android` | `expo run:android` |
| `npm run web` | web target |
| `npm run lint` | `expo lint` |
| `npx tsc --noEmit` | typecheck |

There is no test suite.

## Dependency hygiene

**Do not run `npm audit fix --force` on this project.** It performs breaking
major upgrades and has already pushed Expo from SDK 54 to 57 while leaving
`react-native` pinned at 0.81.5 — an incoherent tree that no lockfile can
satisfy, which fails EAS's `npm ci`.

Use Expo's resolver instead, which only moves packages to versions compatible
with the installed SDK:

```sh
npx expo install --check
```

After changing dependencies, verify the lockfile is in sync the same way EAS
does, before committing:

```sh
npm ci --include=dev --dry-run
```

## Code conventions

- TypeScript throughout; domain types in `types/`
- NativeWind (Tailwind classes on React Native components)
- Path alias `@/` → project root
- User-facing strings are Indonesian; code and comments are English
- Money is integer Rupiah everywhere — no floats, no minor units
- Shared numbers live in `lib/constants.ts` (currently `TAX_RATE`)
