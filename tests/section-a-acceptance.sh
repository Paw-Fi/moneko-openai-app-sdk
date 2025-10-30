#!/usr/bin/env bash
set -euo pipefail

# Section A backend contract tests
# Requirements:
# - curl
# - python3

BASE_URL=${BASE_URL:-"https://budgeting.moneko.io"}
API_KEY=${API_KEY:-""}
CONV_ID=${CONV_ID:-"test-conv-$(date +%s)"}
ACCEPT_HEADER="application/json"

hdr() {
  echo -e "\n==== $1 ===="
}

curl_json() {
  local path="$1"; shift
  local data="$1"; shift
  local extra_headers=("$@")
  local headers=(
    -H "Accept: ${ACCEPT_HEADER}"
    -H "Content-Type: application/json"
    -H "OpenAI-Conversation-Id: ${CONV_ID}"
  )
  if [[ -n "${API_KEY}" ]]; then
    headers+=( -H "apikey: ${API_KEY}" )
  fi
  curl -sS -X POST "${BASE_URL}${path}" "${headers[@]}" "${extra_headers[@]}" -d "${data}"
}

assert_has_keys() {
  local json="$1"; shift
  local keys=("$@")
  python3 - "$json" "${keys[@]}" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
missing=[]
def has_path(obj, path):
    cur=obj
    for part in path.split('.'):
        if isinstance(cur, dict) and part in cur:
            cur=cur[part]
        else:
            return False
    return True
for k in sys.argv[2:]:
    if not has_path(payload, k):
        missing.append(k)
if missing:
    print("Missing keys:", ','.join(missing))
    sys.exit(2)
print("OK")
PY
}

assert_all_currency() {
  local json="$1"; shift
  local code="$1"; shift
  python3 - "$json" "$code" <<'PY'
import json,sys
data=json.loads(sys.argv[1])
code=sys.argv[2]
rows=data.get('data',[])
for i,r in enumerate(rows):
    if r.get('currency')!=code:
        print(f"Row {i} has currency {r.get('currency')} != {code}")
        sys.exit(3)
print("OK")
PY
}

# 1) set-budget creates/continues guest + returns JSON
hdr "SET BUDGET"
SET_PAY='{ "amount": 30, "date": "2025-10-30", "currency": "EUR" }'
SET_RES=$(curl_json "/set-budget" "$SET_PAY")
echo "$SET_RES" | python3 -c 'import sys,json;print(json.loads(sys.stdin.read()).get("ok"))'
assert_has_keys "$SET_RES" ok results.date results.currency results.daysInMonth results.dayApplied results.dailyBudgetCents results.totals.spentToDateCents results.totals.remainingToDateCents results.totals.projectedMonthRemainingCents

# 2) get-budget responds JSON with pacing fields
hdr "GET BUDGET"
GET_PAY='{ "date": "2025-10-30", "currency": "EUR" }'
GET_RES=$(curl_json "/get-budget" "$GET_PAY")
assert_has_keys "$GET_RES" ok results.dailyBudgetCents results.totals.projectedMonthRemainingCents

# 3) list-expenses currency filter
hdr "LIST EXPENSES"
LIST_PAY='{ "startDate":"2025-10-01", "endDate":"2025-10-31", "currency":"EUR", "limit": 50 }'
LIST_RES=$(curl_json "/list-expenses" "$LIST_PAY")
assert_has_keys "$LIST_RES" success data meta.filters.currency
assert_all_currency "$LIST_RES" "EUR"

# 4) expenses-summary returns JSON (not markdown) and includes breakdown
hdr "EXPENSES SUMMARY"
SUM_PAY='{ "startDate":"2025-10-01", "endDate":"2025-10-31", "currency":"EUR" }'
SUM_RES=$(curl_json "/expenses-summary" "$SUM_PAY")
assert_has_keys "$SUM_RES" success data.breakdown data.timeWindow.startDate data.timeWindow.endDate

# 5) analyze-expense includes resolvedUserId + meta
hdr "ANALYZE EXPENSE"
ANL_PAY='{ "text": "€12 ramen dinner yesterday", "currency": "EUR", "date": "2025-10-29" }'
ANL_RES=$(curl_json "/analyze-expense" "$ANL_PAY")
assert_has_keys "$ANL_RES" success data.items resolvedUserId meta

echo "\nAll Section A checks passed for conversation ${CONV_ID}."
