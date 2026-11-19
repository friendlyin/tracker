#!/usr/bin/env bash
# Private-data guard for this public repository.
#
# Looks for the terms listed in .private-terms (git-ignored, one term per line, `#` for comments):
# real names, personal emails, workers.dev subdomain, Zero Trust team name, account ids...
# Matching is case-insensitive and whole-word.
#
#   scripts/check-private.sh staged   # pre-commit: staged changes, file names, author identity
#   scripts/check-private.sh all      # full scan: working tree, file names, git history (pre-push)
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
terms_file="$root/.private-terms"
mode="${1:-staged}"

if [[ ! -s "$terms_file" ]]; then
  echo "check-private: no .private-terms file, skipping. See README → Privacy to enable it." >&2
  exit 0
fi

patterns="$(mktemp)"
trap 'rm -f "$patterns"' EXIT
grep -v -E '^[[:space:]]*(#|$)' "$terms_file" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' >"$patterns" || true
[[ -s "$patterns" ]] || exit 0

match() { grep -i -w -F -f "$patterns"; }
failed=0
report() {
  echo "check-private: $1" >&2
  failed=1
}

cd "$root"

if [[ "$mode" == "staged" ]]; then
  if { git var GIT_AUTHOR_IDENT; git var GIT_COMMITTER_IDENT; } | match >/dev/null; then
    report "your git identity contains a private term. Use your GitHub noreply email:
  git config user.email <id>+<github-user>@users.noreply.github.com"
  fi
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if printf '%s\n' "$file" | match >/dev/null; then report "file name contains a private term: $file"; fi
    count="$({ git diff --cached --no-color -U0 -- "$file" | grep -E '^\+' | grep -v -E '^\+\+\+ ' | match || true; } | wc -l | tr -d ' ')"
    if [[ "$count" != "0" ]]; then report "$file: $count added line(s) contain a private term"; fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)
else
  while IFS= read -r file; do
    [[ -f "$file" ]] || continue
    if printf '%s\n' "$file" | match >/dev/null; then report "file name contains a private term: $file"; fi
    count="$(grep -I -c -i -w -F -f "$patterns" -- "$file" 2>/dev/null || true)"
    if [[ -n "$count" && "$count" != "0" ]]; then report "$file: $count line(s) contain a private term"; fi
  done < <(git ls-files -co --exclude-standard)
  if git rev-parse --verify -q HEAD >/dev/null; then
    if git log --all --format='%an <%ae>%n%cn <%ce>' | match >/dev/null; then
      report "git history: a commit author/committer contains a private term (rewrite before publishing)"
    fi
    if git log --all -p --no-color --format= | match >/dev/null; then
      report "git history: a past commit's content contains a private term (rewrite before publishing)"
    fi
  fi
fi

if [[ "$failed" == "1" ]]; then
  echo "check-private: blocked. Remove the personal data (do not bypass with --no-verify)." >&2
  exit 1
fi
