#!/usr/bin/env bash
#
# Tests for .githooks/commit-msg — OI-0148 orphan-flip enforcement.
#
# Each test creates a fresh temp git repo, copies the hook in, configures
# `core.hooksPath`, stages a controlled diff, then attempts a commit and
# asserts on exit status + stderr.
#
# Run via `npm run test:hooks` (preferred) or directly:
#   ./.githooks/test/commit-msg.test.sh
set -euo pipefail

# Resolve repo root from this script's location (works regardless of cwd).
script_dir="$(cd "$(dirname "$0")" && pwd)"
hooks_dir="$(dirname "$script_dir")"
hook_src="$hooks_dir/commit-msg"

if [ ! -x "$hook_src" ]; then
  echo "FATAL: $hook_src is not executable" >&2
  exit 2
fi

pass_count=0
fail_count=0

# Tracks the most recent test-repo path so the trap can clean it up even if
# a test aborts mid-run.
current_repo=""
cleanup() {
  if [ -n "$current_repo" ] && [ -d "$current_repo" ]; then
    rm -rf "$current_repo"
  fi
}
trap cleanup EXIT

# new_repo — create a fresh temp git repo wired up with the hook under test.
# Echoes the repo path on stdout for the caller to cd into.
new_repo() {
  local repo
  repo="$(mktemp -d)"
  current_repo="$repo"
  (
    cd "$repo"
    git init -q
    git config user.email "test@example.com"
    git config user.name "Test"
    git config commit.gpgsign false
    mkdir -p .githooks
    cp "$hook_src" .githooks/commit-msg
    chmod +x .githooks/commit-msg
    git config core.hooksPath .githooks
    # Seed an initial commit so subsequent commits aren't initial commits.
    echo "seed" > seed.txt
    git add seed.txt
    git commit -q -m "seed"
  )
  echo "$repo"
}

# assert_pass <test_name> <commit_exit_status>
assert_pass() {
  local name="$1" status="$2"
  if [ "$status" -eq 0 ]; then
    echo "PASS: $name"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL: $name — expected commit to succeed (exit 0), got exit $status"
    fail_count=$((fail_count + 1))
  fi
}

# assert_fail <test_name> <commit_exit_status> <captured_stderr>
assert_fail() {
  local name="$1" status="$2" captured="$3"
  if [ "$status" -eq 0 ]; then
    echo "FAIL: $name — expected commit to fail (exit 1), got exit 0"
    fail_count=$((fail_count + 1))
    return
  fi
  # Verify error message contents per acceptance criteria.
  local missing=""
  echo "$captured" | grep -q 'OPEN_ITEMS.md is not in the staged diff' || missing="$missing [missing-headline]"
  echo "$captured" | grep -q 'Closure Discipline' || missing="$missing [missing-rule-citation]"
  echo "$captured" | grep -q 'no-verify' || missing="$missing [missing-bypass-mention]"
  if [ -n "$missing" ]; then
    echo "FAIL: $name — error message incomplete:$missing"
    echo "------ captured stderr ------"
    echo "$captured"
    echo "-----------------------------"
    fail_count=$((fail_count + 1))
  else
    echo "PASS: $name"
    pass_count=$((pass_count + 1))
  fi
}

run_commit() {
  # Capture stderr; let stdout flow normally. Returns the commit exit status
  # in $?.
  local repo="$1"
  shift
  ( cd "$repo" && git commit "$@" 2>/tmp/commit-msg-stderr.$$ ) || true
  cat "/tmp/commit-msg-stderr.$$"
  rm -f "/tmp/commit-msg-stderr.$$"
}

# ---------------------------------------------------------------------------
# Case 1 (matrix Yes/Yes): OI ref present + OPEN_ITEMS.md staged → pass
# ---------------------------------------------------------------------------
run_case_1() {
  local repo
  repo="$(new_repo)"
  (
    cd "$repo"
    echo "first" > foo.txt
    echo "open-items v1" > OPEN_ITEMS.md
    git add foo.txt OPEN_ITEMS.md
  )
  ( cd "$repo" && git commit -q -m "feat: close OI-0148 — staged OPEN_ITEMS.md" ) && local rc=0 || local rc=$?
  assert_pass "case-1: OI ref + OPEN_ITEMS.md staged → commit succeeds" "$rc"
  rm -rf "$repo"; current_repo=""
}

# ---------------------------------------------------------------------------
# Case 2 (matrix Yes/No): OI ref present + OPEN_ITEMS.md NOT staged → fail
# ---------------------------------------------------------------------------
run_case_2() {
  local repo
  repo="$(new_repo)"
  (
    cd "$repo"
    echo "second" > bar.txt
    git add bar.txt
  )
  local err
  err="$( ( cd "$repo" && git commit -m "feat: touch OI-0148 without flipping" ) 2>&1 )" && local rc=0 || local rc=$?
  assert_fail "case-2: OI ref + no OPEN_ITEMS.md → commit fails with cited error" "$rc" "$err"
  # And confirm error names the specific OI ref.
  if echo "$err" | grep -q 'OI-0148'; then
    echo "PASS: case-2b: error message names the OI reference"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL: case-2b: error message did not name OI-0148"
    fail_count=$((fail_count + 1))
  fi
  rm -rf "$repo"; current_repo=""
}

# ---------------------------------------------------------------------------
# Case 3 (matrix No/Yes): no OI ref + OPEN_ITEMS.md staged → pass
# ---------------------------------------------------------------------------
run_case_3() {
  local repo
  repo="$(new_repo)"
  (
    cd "$repo"
    echo "third" > baz.txt
    echo "open-items v2" > OPEN_ITEMS.md
    git add baz.txt OPEN_ITEMS.md
  )
  ( cd "$repo" && git commit -q -m "chore: housekeeping with OPEN_ITEMS edit, no OI ref" ) && local rc=0 || local rc=$?
  assert_pass "case-3: no OI ref + OPEN_ITEMS.md staged → commit succeeds" "$rc"
  rm -rf "$repo"; current_repo=""
}

# ---------------------------------------------------------------------------
# Case 4 (matrix No/No): no OI ref + nothing OPEN_ITEMS.md → pass
# ---------------------------------------------------------------------------
run_case_4() {
  local repo
  repo="$(new_repo)"
  (
    cd "$repo"
    echo "fourth" > qux.txt
    git add qux.txt
  )
  ( cd "$repo" && git commit -q -m "chore: trivial change" ) && local rc=0 || local rc=$?
  assert_pass "case-4: no OI ref + no OPEN_ITEMS.md → commit succeeds" "$rc"
  rm -rf "$repo"; current_repo=""
}

# ---------------------------------------------------------------------------
# Case 5 (bypass): OI ref + no OPEN_ITEMS.md + --no-verify → pass
# ---------------------------------------------------------------------------
run_case_5() {
  local repo
  repo="$(new_repo)"
  (
    cd "$repo"
    echo "fifth" > quux.txt
    git add quux.txt
  )
  ( cd "$repo" && git commit -q --no-verify -m "feat: mention OI-0148 historically, --no-verify" ) && local rc=0 || local rc=$?
  assert_pass "case-5: --no-verify bypasses the hook" "$rc"
  rm -rf "$repo"; current_repo=""
}

# ---------------------------------------------------------------------------
# Case 6 (multi-ref error): two OI refs + no OPEN_ITEMS.md → both named
# ---------------------------------------------------------------------------
run_case_6() {
  local repo
  repo="$(new_repo)"
  (
    cd "$repo"
    echo "sixth" > corge.txt
    git add corge.txt
  )
  local err
  err="$( ( cd "$repo" && git commit -m "feat: piggyback OI-0148 + OI-0145 fix without OPEN_ITEMS edit" ) 2>&1 )" && local rc=0 || local rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: case-6: expected fail, got exit 0"
    fail_count=$((fail_count + 1))
  elif echo "$err" | grep -q 'OI-0145' && echo "$err" | grep -q 'OI-0148'; then
    echo "PASS: case-6: multi-OI error names every reference"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL: case-6: error did not name both OI refs"
    echo "------ captured stderr ------"
    echo "$err"
    echo "-----------------------------"
    fail_count=$((fail_count + 1))
  fi
  rm -rf "$repo"; current_repo=""
}

run_case_1
run_case_2
run_case_3
run_case_4
run_case_5
run_case_6

echo ""
echo "Hook tests: $pass_count passed, $fail_count failed"
if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
exit 0
