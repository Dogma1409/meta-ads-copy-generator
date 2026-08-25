#!/usr/bin/env bash
#
# scripts/test-generate.sh
#
# Manual smoke test for POST /api/generate.
# Gate 2 deliverable.
#
# Usage:  npm run test:generate
#
# Behavior:
#   - Loads .env if present (so GROQ_API_KEY is available without exporting).
#   - If GROQ_API_KEY is missing or still the placeholder from .env.example,
#     exits 0 with a clear SKIP message (does NOT fail the script).
#   - Otherwise: starts the server in the background, waits for /health,
#     POSTs the WideStep BareFlex Pro request, asserts the response shape,
#     kills the server, exits 0 on success / non-zero on any failure.
#
# Assertions (must all pass for exit 0):
#   1. HTTP status is 200.
#   2. Response is parseable JSON.
#   3. Top-level keys present: variations, model_used, tokens_in, tokens_out, duration_ms.
#   4. variations.length === requested_count (3 for this fixture).
#   5. Each variation has primary_text, headline, description (non-empty strings).

set -u

# --- Setup paths ----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Load .env if present (best effort) -----------------------------------

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# --- Skip if no real key --------------------------------------------------

KEY="${GROQ_API_KEY:-}"
if [ -z "$KEY" ] || [ "$KEY" = "your_groq_api_key_here" ]; then
  echo "=== SKIP: npm run test:generate ==="
  echo "GROQ_API_KEY is missing or still the placeholder from .env.example."
  echo "To run the live test:"
  echo "  1. cp .env.example .env"
  echo "  2. edit .env and paste your real GROQ_API_KEY"
  echo "  3. npm run test:generate"
  exit 0
fi

PORT="${PORT:-3001}"
BASE_URL="http://localhost:${PORT}"

# --- Start server in background -------------------------------------------

echo "=== Starting server on port ${PORT} ==="

# Use ts-node so we don't need to build first. Run from project root.
# `setsid` puts the server in its own process group so we can kill the whole
# tree (npm -> npx -> ts-node -> node) on cleanup, not just the npx shell.
setsid npx ts-node src/index.ts >/tmp/meta-ads-test-server.log 2>&1 &
SERVER_PID=$!

# Always kill the entire process group of the server on exit, even on
# assertion failure. `kill -- -PID` targets the group whose leader is PID.
cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  # Belt-and-suspenders: any leftover ts-node src/index.ts child from a
  # previous run that didn't get reaped (shouldn't happen but cheap).
  pkill -f 'ts-node src/index.ts' 2>/dev/null
}
trap cleanup EXIT

# Wait for /health (max 30s — ts-node + groq-sdk load takes ~10s on this box).
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/health" 2>/dev/null | grep -q '^200$'; then
    echo "Server up after $((i * 500))ms."
    break
  fi
  sleep 0.5
  if [ "$i" = "60" ]; then
    echo "FAIL: server did not become healthy within 30s."
    echo "--- server log ---"
    cat /tmp/meta-ads-test-server.log
    cleanup
    exit 1
  fi
done

# --- POST /api/generate ---------------------------------------------------

REQUEST_BODY=$(cat <<'JSON'
{
  "product_name": "WideStep BareFlex Pro",
  "product_description": "Zapatilla barefoot de caña baja, suela de 4 mm de goma flexible, upper de piel sintética transpirable y plantilla extraíble de 3 mm. Diseño minimalista unisex, drop cero, horma ancha.",
  "audience": "Mujeres y hombres de 30-55 años con dolor crónico de espalda o rodillas que buscan alternativas minimalistas a las zapatillas deportivas convencionales; runners principiantes que quieren transición gradual al barefoot; profesionales de oficina que pasan 8+ horas de pie (enfermeras, maestras, cocineros).",
  "variations_count": 3
}
JSON
)

echo "=== POST /api/generate (WideStep BareFlex Pro, 3 variations) ==="

RESPONSE=$(curl -sS -w '\n%{http_code}' \
  -X POST "${BASE_URL}/api/generate" \
  -H 'Content-Type: application/json' \
  -d "$REQUEST_BODY")

HTTP_CODE=$(printf '%s' "$RESPONSE" | tail -n1)
BODY=$(printf '%s' "$RESPONSE" | sed '$d')

echo "HTTP $HTTP_CODE"
echo "--- response (first 500 chars) ---"
printf '%s\n' "$BODY" | head -c 500
echo
echo "---------------------------------"

# --- Assertions (run in node for reliable JSON shape checks) -------------

ASSERT_RESULT=$(HTTP_CODE="$HTTP_CODE" BODY="$BODY" node -e '
  const httpCode = process.env.HTTP_CODE;
  const body = process.env.BODY;
  const failures = [];

  if (httpCode !== "200") failures.push(`expected HTTP 200, got ${httpCode}`);

  let parsed;
  try { parsed = JSON.parse(body); }
  catch (e) { failures.push(`response is not valid JSON: ${e.message}`); process.exit(1); }

  for (const k of ["variations", "model_used", "tokens_in", "tokens_out", "duration_ms"]) {
    if (!(k in parsed)) failures.push(`missing top-level key: ${k}`);
  }
  if (!Array.isArray(parsed.variations)) failures.push("variations is not an array");
  if (parsed.variations && parsed.variations.length !== 3) {
    failures.push(`variations.length = ${parsed.variations && parsed.variations.length}, expected 3`);
  }
  if (Array.isArray(parsed.variations)) {
    parsed.variations.forEach((v, i) => {
      for (const k of ["primary_text", "headline", "description"]) {
        if (typeof v[k] !== "string" || v[k].trim().length === 0) {
          failures.push(`variations[${i}].${k} missing or empty`);
        }
      }
    });
  }

  if (failures.length === 0) {
    console.log("ASSERT_OK");
  } else {
    console.log("ASSERT_FAIL");
    failures.forEach(f => console.log("  - " + f));
    process.exit(2);
  }
')

ASSERT_EXIT=$?

if [ "$ASSERT_RESULT" = "ASSERT_OK" ]; then
  echo "=== PASS: all assertions passed ==="
  echo "Variations returned: $(printf '%s' "$BODY" | node -e 'process.stdin.on("data",d=>{const j=JSON.parse(d);console.log(j.variations.length)})')"
  exit 0
fi

echo "=== FAIL ==="
printf '%s\n' "$ASSERT_RESULT"
exit "$ASSERT_EXIT"
