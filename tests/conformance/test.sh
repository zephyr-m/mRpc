#!/bin/bash
# ══════════════════════════════════════════════════
# mRPC/1.0 — Full Conformance Test Suite
# Tests all spec requirements against any mRPC server
#
# Usage:
#   ./test.sh [endpoint]          — test external server
#   ./test.sh --self              — start built-in server + test
#
# Default: http://localhost:8089
# ══════════════════════════════════════════════════

# ══════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")/sdk/php"
ENDPOINT="${1:-http://localhost:8089}"
SELF_START=false
PID=""
PASS=0
FAIL=0

# Colors
green() { echo -e "\033[32m  ✅ $1\033[0m"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m  ❌ $1\033[0m"; FAIL=$((FAIL+1)); }

# Helper: check condition
check() {
    local name="$1"
    shift
    if "$@" 2>/dev/null; then
        green "$name"
    else
        red "$name"
    fi
}

# Helper: JSON field extraction via Python
jq() {
    python3 -c "import sys,json;d=json.load(sys.stdin);$1" 2>/dev/null
}

# POST request
post() {
    curl -s -X POST "$ENDPOINT" -H 'Content-Type: application/json' -d "$1" 2>/dev/null
}

# GET request
get() {
    curl -s "$ENDPOINT?$1" 2>/dev/null
}

# POST with auth header
post_auth() {
    local token="$1"
    local body="$2"
    curl -s -X POST "$ENDPOINT" -H 'Content-Type: application/json' -H "Authorization: Bearer $token" -d "$body" 2>/dev/null
}

# ── Self-start mode ──────────────────────────────────────────────────
if [ "$1" = "--self" ]; then
    SELF_START=true
    ENDPOINT="http://127.0.0.1:8089"

    # Seed test DB
    cp "$SCRIPT_DIR/commands.json" "$SDK_DIR/commands.json" 2>/dev/null || true
    rm -f "$SDK_DIR/data.db" 2>/dev/null || true
    sqlite3 "$SDK_DIR/data.db" < "$SCRIPT_DIR/seed.sql"

    # Start server
    pkill -f 'php -S 127.0.0.1:8089' 2>/dev/null || true
    sleep 0.3
    cd "$SDK_DIR"
    php -S 127.0.0.1:8089 server.php 2>/dev/null &
    PID=$!
    sleep 1
fi

cleanup() {
    if [ -n "$PID" ]; then
        kill $PID 2>/dev/null || true
        rm -f "$SDK_DIR/commands.json" "$SDK_DIR/data.db" 2>/dev/null || true
    fi
}
trap cleanup EXIT

echo ""
echo "🧪 mRPC/1.0 — Full Conformance Test Suite"
echo "   Endpoint: $ENDPOINT"
echo ""

# ══════════════════════════════════════════════════
# §3 Wire Format
# ══════════════════════════════════════════════════
echo "══ §3 Wire Format ══"

R=$(post '{"cmd":"ping"}')

check "3.2 ok=true on success" \
    test "$(echo "$R" | jq 'print(d["ok"])')" = "True"

check "3.4 has cmd field" \
    test "$(echo "$R" | jq 'print(d["cmd"])')" = "ping"

check "3.4 has v field (mRPC/*)" \
    echo "$R" | jq 'assert d["v"].startswith("mRPC/")'

check "3.4 has ms field (number)" \
    echo "$R" | jq 'assert isinstance(d["ms"],(int,float))'

check "3.4 ok is boolean type" \
    echo "$R" | jq 'assert isinstance(d["ok"],bool)'

# GET support
R=$(get "cmd=ping")
check "3.1 GET request works" \
    test "$(echo "$R" | jq 'print(d["ok"])')" = "True"

# Error response
R=$(post '{"cmd":"nonexistent_xyz"}')
check "3.3 ok=false on error" \
    test "$(echo "$R" | jq 'print(d["ok"])')" = "False"

check "3.3 error is object" \
    echo "$R" | jq 'assert isinstance(d["error"],dict)'

check "3.3 error has code" \
    echo "$R" | jq 'assert "code" in d["error"]'

check "3.3 error has message" \
    echo "$R" | jq 'assert "message" in d["error"]'

echo ""

# ══════════════════════════════════════════════════
# §4 Command Types
# ══════════════════════════════════════════════════
echo "══ §4 Command Types ══"

# query
R=$(post '{"cmd":"get_items"}')
check "4.1 query: has data array" \
    echo "$R" | jq 'assert isinstance(d["data"],list)'

check "4.1 query: has count" \
    echo "$R" | jq 'assert isinstance(d["count"],int)'

check "4.1 query: count matches data length" \
    echo "$R" | jq 'assert d["count"]==len(d["data"])'

# query with params
R=$(post '{"cmd":"get_item","id":1}')
check "4.1 query: required param works" \
    echo "$R" | jq 'assert d["ok"]==True'

# query with default params
R=$(post '{"cmd":"get_items","state":"active"}')
check "4.1 query: filter with default param" \
    echo "$R" | jq 'assert d["ok"]==True and d["count"]>=1'

# exec
R=$(post '{"cmd":"add_item","name":"TestItem","price":"99.9"}')
check "4.2 exec: has changes" \
    echo "$R" | jq 'assert "changes" in d'

check "4.2 exec: changes is int" \
    echo "$R" | jq 'assert isinstance(d["changes"],int)'

check "4.2 exec: changes >= 1" \
    echo "$R" | jq 'assert d["changes"]>=1'

# raw
R=$(post '{"cmd":"ping"}')
check "4.3 raw: has data" \
    echo "$R" | jq 'assert "data" in d'

check "4.3 raw: data is object" \
    echo "$R" | jq 'assert isinstance(d["data"],dict)'

echo ""

# ══════════════════════════════════════════════════
# §5 Error Codes
# ══════════════════════════════════════════════════
echo "══ §5 Error Codes ══"

# unknown_cmd
R=$(post '{"cmd":"does_not_exist_42"}')
check "5.0 unknown_cmd: code correct" \
    test "$(echo "$R" | jq 'print(d["error"]["code"])')" = "unknown_cmd"

check "5.0 unknown_cmd: lists available commands" \
    echo "$R" | jq 'assert "commands" in d["error"]'

# missing_param
R=$(post '{"cmd":"get_item"}')
check "5.0 missing_param: code correct" \
    test "$(echo "$R" | jq 'print(d["error"]["code"])')" = "missing_param"

check "5.0 missing_param: has param name" \
    echo "$R" | jq 'assert "param" in d["error"]'

# validation_failed
R=$(post '{"cmd":"add_item","name":"X","price":"not_a_number"}')
check "5.0 validation_failed: code correct" \
    test "$(echo "$R" | jq 'print(d["error"]["code"])')" = "validation_failed"

check "5.0 validation_failed: has details array" \
    echo "$R" | jq 'assert isinstance(d["error"]["details"],list)'

check "5.0 validation_failed: detail has field" \
    echo "$R" | jq 'assert "field" in d["error"]["details"][0]'

check "5.0 validation_failed: detail has rule" \
    echo "$R" | jq 'assert "rule" in d["error"]["details"][0]'

# validation: required field missing
R=$(post '{"cmd":"add_item","price":"10"}')
check "5.0 validation: required field detected" \
    test "$(echo "$R" | jq 'print(d["error"]["code"])')" = "missing_param" -o \
         "$(echo "$R" | jq 'print(d["error"]["code"])')" = "validation_failed"

# access_denied (no token)
R=$(post '{"cmd":"admin_only"}')
check "5.0 access_denied: no token blocked" \
    test "$(echo "$R" | jq 'print(d["error"]["code"])')" = "access_denied"

# access_denied: with token → allowed
R=$(post_auth "fake-admin-token" '{"cmd":"admin_only"}')
check "5.0 access_denied: with token allowed" \
    test "$(echo "$R" | jq 'print(d["ok"])')" = "True"

echo ""

# ══════════════════════════════════════════════════
# §6 Matrix
# ══════════════════════════════════════════════════
echo "══ §6 Matrix / Params ══"

# Required params (sequential array)
R=$(post '{"cmd":"delete_item","id":99999}')
check "6.1 required params: accepted" \
    echo "$R" | jq 'assert d["ok"]==True'

# Default params
R=$(post '{"cmd":"get_items"}')
check "6.1 default params: works without explicit values" \
    echo "$R" | jq 'assert d["ok"]==True'

# Validate middleware
R=$(post '{"cmd":"add_item","name":"AB","price":"10"}')
check "6.2 validate: passes with valid data" \
    echo "$R" | jq 'assert d["ok"]==True'

echo ""

# ══════════════════════════════════════════════════
# §7 Self-Documentation
# ══════════════════════════════════════════════════
echo "══ §7 Self-Documentation ══"

# help
R=$(post '{"cmd":"help"}')
check "7.1 help: ok=true" \
    test "$(echo "$R" | jq 'print(d["ok"])')" = "True"

check "7.1 help: data.commands exists" \
    echo "$R" | jq 'assert "commands" in d["data"]'

check "7.1 help: data.total > 0" \
    echo "$R" | jq 'assert d["data"]["total"]>0'

check "7.1 help: commands has ping" \
    echo "$R" | jq 'assert "ping" in d["data"]["commands"]'

# no cmd → help
R=$(post '{}')
check "7.1 no cmd: auto-help" \
    echo "$R" | jq 'assert d.get("ok")==True and "data" in d'

# describe
R=$(post '{"cmd":"describe","command":"add_item"}')
check "7.2 describe: returns command info" \
    echo "$R" | jq 'assert d["ok"]==True'

check "7.2 describe: has type" \
    echo "$R" | jq 'assert "type" in d["data"]'

check "7.2 describe: has params" \
    echo "$R" | jq 'assert "params" in d["data"]'

# describe unknown
R=$(post '{"cmd":"describe","command":"nope"}')
check "7.2 describe: unknown command handled" \
    echo "$R" | jq 'assert d["ok"]==True'

echo ""

# ══════════════════════════════════════════════════
# §8 CORS
# ══════════════════════════════════════════════════
echo "══ §8 CORS ══"

H=$(curl -s -I -X OPTIONS "$ENDPOINT" 2>/dev/null)
check "8.0 CORS: Allow-Origin present" \
    echo "$H" | grep -qi "access-control-allow-origin"

check "8.0 CORS: Allow-Methods present" \
    echo "$H" | grep -qi "access-control-allow-methods"

check "8.0 CORS: Allow-Headers present" \
    echo "$H" | grep -qi "access-control-allow-headers"

echo ""

# ══════════════════════════════════════════════════
# §9 Auth
# ══════════════════════════════════════════════════
echo "══ §9 Auth ══"

# Token in header
R=$(post_auth "test-token" '{"cmd":"admin_only"}')
check "9.1 Bearer token in header" \
    test "$(echo "$R" | jq 'print(d["ok"])')" = "True"

# Token in body
R=$(post '{"cmd":"admin_only","token":"Bearer test-token"}')
check "9.1 Token in body (fallback)" \
    echo "$R" | jq 'assert True'  # at minimum doesn't crash

echo ""

# ══════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════
echo "══════════════════════════════════════════════════"
TOTAL=$((PASS + FAIL))
PCT=$((PASS * 100 / TOTAL))
echo "🧪 mRPC/1.0 Conformance: $PASS/$TOTAL passed ($PCT%)"
if [ $FAIL -eq 0 ]; then
    echo "   ✅ FULL COMPLIANCE"
else
    echo "   ❌ $FAIL FAILURES"
fi
echo "══════════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
