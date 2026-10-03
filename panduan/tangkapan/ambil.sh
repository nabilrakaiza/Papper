#!/bin/bash
# Take the guide screenshots against made-up data, then rebuild the PDFs.
#
#   ./ambil.sh            # every photo
#   ./ambil.sh K-02 A-03  # some photos
#
# The app never talks to the real database here: for the length of the run,
# mobile/lib/supabase.ts is replaced by supabase.mock.ts (an in-memory database
# of made-up orders), and AuthContext lets any role into the web build. Both
# files are restored from git when the script ends, however it ends.
#
# Needs: Google Chrome, Python 3.10+ with websocket-client and Pillow, and the
# app's npm dependencies installed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../mobile"
PORT=8091

cd "$APP"
if ! git diff --quiet -- lib/supabase.ts context/AuthContext.tsx; then
  echo "lib/supabase.ts atau context/AuthContext.tsx punya perubahan yang belum di-commit. Batal." >&2
  exit 1
fi

restore() {
  [ -n "${SERVER:-}" ] && kill "$SERVER" 2>/dev/null || true
  git -C "$APP" checkout -- lib/supabase.ts context/AuthContext.tsx
  echo "File asli dipulihkan."
}
trap restore EXIT

cp "$HERE/supabase.mock.ts" lib/supabase.ts
python3 - <<'PY'
p = "context/AuthContext.tsx"
s = open(p).read()
a = "      const rejection =\n        Platform.OS === \"web\""
b = "      const rejection = (globalThis as any).__PAPPER_MOCK__\n        ? null\n        : Platform.OS === \"web\""
assert a in s, "AuthContext changed; update ambil.sh"
open(p, "w").write(s.replace(a, b, 1))
PY

npm run --silent preview:receipt >/dev/null

npx expo start --web --port "$PORT" </dev/null >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://localhost:$PORT" && break
  sleep 2
done
# The first request triggers the web bundle; let it finish before shooting.
curl -s -o /dev/null "http://localhost:$PORT" || true
sleep 15

python3 "$HERE/ambil.py" "$@"
python3 "$HERE/../build.py"
