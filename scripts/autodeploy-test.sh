#!/usr/bin/env bash
# Тест deploy/autodeploy/deploy.sh без сервера: bash scripts/autodeploy-test.sh
# Локальный git-репозиторий вместо GitHub, заглушки docker и curl в PATH. Проверяет: нет нового
# коммита — ничего не делает; CI идёт — ждёт; CI красный — не разворачивает и не повторяет;
# CI зелёный — fast-forward и пересборка; изменён Caddyfile — рестарт caddy; конфликт — стоп.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEPLOY="$ROOT/deploy/autodeploy/deploy.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

failures=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (expected '$3', got '$2')"; failures=$((failures + 1)); fi
}

# «GitHub»: голый репозиторий и рабочая копия разработчика.
git init -q --bare -b main "$WORK/origin.git"
git clone -q "$WORK/origin.git" "$WORK/dev" 2> /dev/null
cd "$WORK/dev"
git config user.email t@example.ru && git config user.name test
mkdir -p deploy && echo 'site {}' > deploy/Caddyfile && echo one > app.txt
git add -A && git commit -qm one && git push -q origin main 2> /dev/null

# «Сервер».
git clone -q "$WORK/origin.git" "$WORK/server"
printf "DOMAIN=example.test\n" > "$WORK/server/deploy/.env"

# Заглушки: docker пишет вызовы в журнал; curl отдаёт статус CI из файла и 200 для главной.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/docker" << 'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
[ "${DOCKER_FAIL:-0}" = 1 ] && [ "$1" = compose ] && [[ " $* " == *" up "* ]] && exit 1
exit 0
STUB
cat > "$WORK/bin/curl" << 'STUB'
#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in
    *check-runs*) cat "$CHECKS_FILE"; exit 0 ;;
  esac
done
printf 200
STUB
chmod +x "$WORK/bin/docker" "$WORK/bin/curl"

export PATH="$WORK/bin:$PATH"
export REPO_DIR="$WORK/server" STATE_DIR="$WORK/state" LOCK_FILE="$WORK/lock"
export STUB_LOG="$WORK/docker.log" CHECKS_FILE="$WORK/checks.json"
export GITHUB_API=https://api.github.invalid/repos/x/y

run() { : > "$STUB_LOG"; bash "$DEPLOY" > "$WORK/out.log" 2>&1 || echo "exit $?" >> "$WORK/out.log"; }
head_of() { git -C "$1" rev-parse HEAD; }
push_commit() {
  cd "$WORK/dev"
  echo "$1" > "${2:-app.txt}"
  git add -A && git commit -qm "$1" && git push -q origin main 2> /dev/null
}
checks() { printf '{"check_runs":[%s]}' "$1" > "$CHECKS_FILE"; }
run_ok='{"status":"completed","conclusion":"success"}'

# 1. Нет нового коммита.
checks "$run_ok"
run
check 'no new commit: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0

# 2. Новый коммит, CI ещё идёт.
push_commit two
checks '{"status":"in_progress","conclusion":null},'"$run_ok"
run
check 'CI pending: server stays' "$(head_of "$WORK/server")" "$(git -C "$WORK/server" rev-parse origin/main~1)"
check 'CI pending: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0

# 3. CI зелёный: обновление и пересборка, Caddy не трогаем.
checks "$run_ok,$run_ok"
run
check 'CI green: fast-forward to main' "$(head_of "$WORK/server")" "$(head_of "$WORK/dev")"
check 'CI green: compose up --build' "$(grep -c 'compose .* up -d --build' "$STUB_LOG")" 1
check 'CI green: caddy not restarted' "$(grep -c 'restart caddy' "$STUB_LOG" || true)" 0
check 'CI green: deployed sha recorded' "$(cat "$WORK/state/deployed")" "$(head_of "$WORK/dev")"

# 4. Изменён Caddyfile: рестарт caddy.
push_commit 'new {}' deploy/Caddyfile
run
check 'Caddyfile changed: caddy restarted' "$(grep -c 'restart caddy' "$STUB_LOG")" 1

# 5. CI красный: не разворачиваем и не пробуем повторно.
push_commit three
checks '{"status":"completed","conclusion":"failure"},'"$run_ok"
before=$(head_of "$WORK/server")
run
check 'CI red: server stays' "$(head_of "$WORK/server")" "$before"
check 'CI red: commit marked failed' "$(cat "$WORK/state/failed")" "$(head_of "$WORK/dev")"
checks "$run_ok"
run
check 'CI red: same commit not retried' "$(head_of "$WORK/server")" "$before"

# 6. Следующий коммит с зелёным CI разворачивается, но сборка падает: помечаем, не повторяем.
push_commit four
DOCKER_FAIL=1 run
check 'build failure: exit code reported' "$(grep -c '^exit 1' "$WORK/out.log")" 1
check 'build failure: commit marked failed' "$(cat "$WORK/state/failed")" "$(head_of "$WORK/dev")"
DOCKER_FAIL=1 run
check 'build failure: not retried' "$(grep -c 'compose .* up' "$STUB_LOG" || true)" 0

# 7. Локальная правка на сервере мешает fast-forward: стоп без пересборки.
echo local > "$WORK/server/app.txt"
git -C "$WORK/server" -c user.email=s@example.ru -c user.name=s commit -qam local
push_commit five
run
check 'diverged: stopped' "$(grep -c 'fast-forward невозможен' "$WORK/out.log")" 1
check 'diverged: docker not called' "$(grep -c 'compose' "$STUB_LOG" || true)" 0

if [ "$failures" -gt 0 ]; then
  echo "$failures autodeploy check(s) failed"
  exit 1
fi
echo 'Autodeploy checks passed'
