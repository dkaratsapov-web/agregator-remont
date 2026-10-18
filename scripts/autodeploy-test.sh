#!/usr/bin/env bash
# Тест deploy/autodeploy/deploy.sh без сервера: bash scripts/autodeploy-test.sh
# Локальный git-репозиторий вместо GitHub, заглушки docker и curl в PATH. Заглушка curl отдаёт
# ответы GitHub Actions API (список run и страницы задач) из файлов и коды ответов сайта через
# Caddy из переменных. Проверяет строгий CI gate (обязательные задачи, skipped/neutral/cancelled,
# отсутствующая задача, несколько страниц, 429, чужой SHA), раздельные сборку и переключение,
# сбой рестарта Caddy, проверку здоровья (502/000 главной, 200 вместо 401, нездоровый контейнер)
# и повтор после исправления.
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

mkdir -p "$WORK/bin" "$WORK/api"
# docker: журнал вызовов; сбои по переменным; ps — состояние контейнеров из PS_STATES.
cat > "$WORK/bin/docker" << 'STUB'
#!/usr/bin/env bash
echo "docker $*${IMAGE_TAG:+ tag=$IMAGE_TAG}" >> "$STUB_LOG"
case "$1 $2" in
  'info --format') echo /var/lib/docker; exit 0 ;;
  # Проверка восстановления: временная база отвечает числом миграций и строк.
  exec\ *) case "$*" in
      *_prisma_migrations*) echo "${RESTORE_MIGRATIONS:-1}" ;;
      *'from users'* | *'from jobs'*) echo 3 ;;
    esac
    [ "${RESTORE_FAIL:-0}" = 1 ] && case "$*" in *pg_restore*) exit 1 ;; esac
    exit 0 ;;
  'image ls') printf '%b' "${IMAGES:-}"; exit 0 ;;
  'image inspect') [ "${INSPECT_FAIL:-0}" = 1 ] && exit 1; exit 0 ;;
esac
if [ "$1" = compose ]; then
  case " $* " in
    *" exec "*) [ "${EXEC_FAIL:-0}" = 1 ] && exit 1; printf 'PGDMP-stub' ;;
    *" build "*) [ "${BUILD_FAIL:-0}" = 1 ] && exit 1 ;;
    *" up "*) [ "${UP_FAIL:-0}" = 1 ] && exit 1 ;;
    *" restart caddy "*) [ "${RESTART_FAIL:-0}" = 1 ] && exit 1 ;;
    # Как настоящий docker compose: у caddy нет healthcheck, {{.Health}} пустой, и строка
    # заканчивается пробелом («caddy running »).
    *" ps "*) printf '%b\n' "${PS_STATES:-db running healthy\napi running healthy\nweb running healthy\ncaddy running }" ;;
  esac
fi
exit 0
STUB
# curl: GitHub API из файлов в $API_DIR; сайт — коды из переменных, главная со ссылками на статику.
cat > "$WORK/bin/curl" << 'STUB'
#!/usr/bin/env bash
url='' out=''
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift ;;
    # Адрес из stdin (notify.sh, heartbeat): строка «url = "..."».
    -K) [ "$2" = - ] && url=$(sed -n 's/^url = "\(.*\)"$/\1/p'); shift ;;
    http*) url=$1 ;;
  esac
  shift
done
echo "curl $url" >> "$CURL_LOG"
case "$url" in
  *api.github.invalid*)
    [ "${API_FAIL:-0}" = 1 ] && { echo 'curl: (22) The requested URL returned error: 429' >&2; exit 22; }
    case "$url" in
      *actions/runs\?*) cat "$API_DIR/runs.json" ;;
      */jobs\?*page=2*) cat "$API_DIR/jobs2.json" ;;
      */jobs\?*) cat "$API_DIR/jobs1.json" ;;
    esac
    exit 0 ;;
esac
case "$url" in
  *hooks.invalid*) exit 0 ;;
  */jobs) code=${PRIVATE_CODE:-401} ;;
  */_next/static/*|*/landing/*) code=${ASSET_CODE:-200} ;;
  *) code=${HOME_CODE:-200}
     [ -n "$out" ] && [ "$out" != /dev/null ] &&
       printf '<script src="/_next/static/chunks/app.js"></script><img src="/landing/flight-v3/desktop-poster.avif">' > "$out" ;;
esac
printf '%s' "$code"
STUB
chmod +x "$WORK/bin/docker" "$WORK/bin/curl"

export PATH="$WORK/bin:$PATH"
export REPO_DIR="$WORK/server" STATE_DIR="$WORK/state" LOCK_FILE="$WORK/lock"
export STUB_LOG="$WORK/docker.log" CURL_LOG="$WORK/curl.log" API_DIR="$WORK/api"
export GITHUB_API=https://api.github.invalid/repos/x/y HEALTH_ATTEMPTS=2 HEALTH_DELAY=0
# Базовые сценарии без повторов и проверки диска; повторы, диск, копии и откат — в разделе 14.
export DEPLOY_ATTEMPTS=1 MIN_FREE_GB=0 BACKUP_DIR="$WORK/backups"

run() {
  : > "$STUB_LOG"
  : > "$CURL_LOG"
  bash "$DEPLOY" > "$WORK/out.log" 2>&1 || echo "exit $?" >> "$WORK/out.log"
}
head_of() { git -C "$1" rev-parse HEAD; }
dev_head() { head_of "$WORK/dev"; }
push_commit() {
  cd "$WORK/dev"
  echo "$1" > "${2:-app.txt}"
  git add -A && git commit -qm "$1" && git push -q origin main 2> /dev/null
}
deployed() { cat "$WORK/state/deployed" 2> /dev/null || echo none; }
failed() { cat "$WORK/state/failed" 2> /dev/null || echo none; }
docker_calls() { grep -c "$1" "$STUB_LOG" || true; }
# Строки уведомлений (notify.sh повторяет причину) не считаются.
logged() { grep -v '^\[agregator-notify\]' "$WORK/out.log" | grep -c "$1" || true; }

# Ответы GitHub: run для SHA и задачи. job NAME STATUS CONCLUSION.
ci_run() { # sha status conclusion [path]
  printf '{"workflow_runs":[{"id":7,"run_attempt":1,"head_sha":"%s","path":"%s","status":"%s","conclusion":%s}]}' \
    "$1" "${4:-.github/workflows/ci.yml}" "$2" "$3" > "$API_DIR/runs.json"
}
job() { printf '{"id":%s,"name":"%s","status":"%s","conclusion":%s}' "$((RANDOM + 1))" "$1" "$2" "$3"; }
jobs_page() { # file total jobs...
  local file=$1 total=$2
  shift 2
  local IFS=,
  printf '{"total_count":%s,"jobs":[%s]}' "$total" "$*" > "$API_DIR/$file"
}
J1='Lint, typecheck, test, build' J2='Docker stack (compose)' J3='Docker stack behind Caddy (proxy)'
all_green() {
  ci_run "$(dev_head)" completed '"success"'
  jobs_page jobs1.json 3 "$(job "$J1" completed '"success"')" "$(job "$J2" completed '"success"')" "$(job "$J3" completed '"success"')"
}

# 1. Первый запуск: текущий main зелёный — разворачивается и проходит проверку.
all_green
run
check 'green: deployed sha recorded' "$(deployed)" "$(dev_head)"
check 'green: build then up' "$(grep -o 'build tag=[0-9a-f]*$\|up -d' "$STUB_LOG" | sed 's/ tag=.*//' | tr '\n' ' ')" 'build up -d '
check 'green: health checked through Caddy' "$(grep -c 'example.test/jobs' "$CURL_LOG")" 1
check 'green: static and frame checked' "$(grep -c '_next/static\|/landing/' "$CURL_LOG")" 2

# 2. Нет нового коммита: ничего не делает.
run
check 'no new commit: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0

# 3. Новый коммит, CI ещё идёт.
push_commit two
ci_run "$(dev_head)" in_progress null
run
check 'CI pending: server stays' "$(head_of "$WORK/server")" "$(git -C "$WORK/server" rev-parse origin/main~1)"
check 'CI pending: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0
check 'CI pending: not marked failed' "$(failed)" none

# 4. GitHub отвечает 429: ждём, не разворачиваем, не помечаем.
API_FAIL=1 run
check 'HTTP 429: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0
check 'HTTP 429: not marked failed' "$(failed)" none
check 'HTTP 429: waits' "$(logged 'GitHub не ответил')" 1

# 5. Run найден, но для другого SHA или другого workflow — ждём.
ci_run "$(git -C "$WORK/dev" rev-parse HEAD~1)" completed '"success"'
run
check 'SHA mismatch: waits' "$(logged 'ещё идёт или не найден')" 1
ci_run "$(dev_head)" completed '"success"' .github/workflows/other.yml
run
check 'other workflow: waits' "$(logged 'ещё идёт или не найден')" 1
check 'other workflow: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0

# 6. Run зелёный, но задачи: только skipped / neutral / одной нет — коммит не разворачивается.
ci_run "$(dev_head)" completed '"success"'
jobs_page jobs1.json 3 "$(job "$J1" completed '"skipped"')" "$(job "$J2" completed '"skipped"')" "$(job "$J3" completed '"skipped"')"
run
check 'only skipped: not deployed' "$(deployed)" "$(git -C "$WORK/dev" rev-parse HEAD~1)"
check 'only skipped: marked failed' "$(failed)" "$(dev_head)"

push_commit three
ci_run "$(dev_head)" completed '"success"'
jobs_page jobs1.json 3 "$(job "$J1" completed '"success"')" "$(job "$J2" completed '"neutral"')" "$(job "$J3" completed '"success"')"
run
check 'neutral job: not deployed' "$(failed)" "$(dev_head)"
check 'neutral job: docker not called' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0

push_commit four
ci_run "$(dev_head)" completed '"success"'
jobs_page jobs1.json 2 "$(job "$J1" completed '"success"')" "$(job "$J2" completed '"success"')"
run
check 'missing job: marked failed' "$(failed)" "$(dev_head)"
check 'missing job: reason logged' "$(logged 'нет задачи')" 1

push_commit five
ci_run "$(dev_head)" completed '"cancelled"'
run
check 'cancelled workflow: marked failed' "$(failed)" "$(dev_head)"

push_commit six
ci_run "$(dev_head)" completed '"failure"'
run
check 'red CI: marked failed' "$(failed)" "$(dev_head)"
all_green
run
check 'red CI: same commit not retried' "$(wc -l < "$STUB_LOG" | tr -d ' ')" 0

# 7. Задачи на двух страницах: обязательная задача только на второй.
push_commit seven
ci_run "$(dev_head)" completed '"success"'
filler=()
for i in $(seq 1 100); do filler+=("$(job "extra $i" completed '"success"')"); done
jobs_page jobs1.json 102 "$(job "$J1" completed '"success"')" "${filler[@]:0:99}"
jobs_page jobs2.json 102 "$(job "$J2" completed '"success"')" "$(job "$J3" completed '"success"')"
run
check 'pagination: second page read' "$(grep -c 'page=2' "$CURL_LOG")" 1
check 'pagination: deployed' "$(deployed)" "$(dev_head)"

# 8. Сборка падает: контейнеры не переключаются, коммит помечен, выход с ошибкой.
push_commit eight
all_green
BUILD_FAIL=1 run
check 'build failure: exit 1' "$(logged '^exit 1')" 1
check 'build failure: no up' "$(docker_calls 'up -d')" 0
check 'build failure: marked failed' "$(failed)" "$(dev_head)"
check 'build failure: not deployed' "$(deployed)" "$(git -C "$WORK/dev" rev-parse HEAD~1)"
BUILD_FAIL=1 run
check 'build failure: not retried' "$(docker_calls build)" 0

# 9. Переключение падает частично.
push_commit nine
all_green
UP_FAIL=1 run
check 'partial compose failure: exit 1' "$(logged '^exit 1')" 1
check 'partial compose failure: marked failed' "$(failed)" "$(dev_head)"
check 'partial compose failure: recovery hint' "$(logged 'Если обновление не прошло')" 1

# 10. Повтор после исправления: снять отметку — тот же коммит разворачивается.
rm "$WORK/state/failed"
run
check 'retry after fix: deployed' "$(deployed)" "$(dev_head)"

# 11. Изменён Caddyfile, рестарт Caddy падает: не «готово», а ошибка.
push_commit 'new {}' deploy/Caddyfile
all_green
RESTART_FAIL=1 run
check 'caddy restart failure: exit 1' "$(logged '^exit 1')" 1
check 'caddy restart failure: not deployed' "$(failed)" "$(dev_head)"
check 'caddy restart failure: no false ready' "$(logged 'готово')" 0
rm "$WORK/state/failed"
run
check 'caddy restart ok: restarted and deployed' "$(docker_calls 'restart caddy') $(deployed)" "1 $(dev_head)"

# 12. Проверка здоровья: главная 502, главная 000, закрытая страница 200, нездоровый web.
for case_ in 'HOME_CODE=502|главная через Caddy отвечает 502' 'HOME_CODE=000|главная через Caddy отвечает 000' \
  'PRIVATE_CODE=200|отвечает не 401' 'ASSET_CODE=404|статика /_next/static недоступна' \
  'PS_STATES=db running healthy\napi running healthy\nweb running unhealthy\ncaddy running|контейнеры не поднялись'; do
  setting=${case_%%|*} expect=${case_#*|}
  push_commit "health $setting"
  all_green
  : > "$STUB_LOG"
  : > "$CURL_LOG"
  env "$setting" bash "$DEPLOY" > "$WORK/out.log" 2>&1 || echo "exit $?" >> "$WORK/out.log"
  check "health ($expect): exit 1" "$(logged '^exit 1')" 1
  check "health ($expect): reason logged" "$(logged "$expect")" 1
  check "health ($expect): not deployed" "$(failed)" "$(dev_head)"
done

# 12б. Вход через банк включён в deploy/.env: compose получает файл docker-compose.bank-login.yml.
echo 'BANK_LOGIN=true' >> "$WORK/server/deploy/.env"
push_commit 'bank login'
all_green
run
check 'bank login: deployed' "$(deployed)" "$(dev_head)"
check 'bank login: compose with bank-login file' \
  "$(grep -c 'compose .*docker-compose.bank-login.yml.* build tag=' "$STUB_LOG" || true)" 1
sed -i '/^BANK_LOGIN=/d' "$WORK/server/deploy/.env"

# 14. Обслуживание (AUDIT_FINDINGS DEV-2, DEV-4, DEV-6, DEV-8, DEV-9).
# Уведомления: вебхук из deploy/.env получает сообщение о сбое.
echo 'NOTIFY_WEBHOOK_URL=https://hooks.invalid/agregator' >> "$WORK/server/deploy/.env"
push_commit 'notify me'
all_green
BUILD_FAIL=1 run
check 'notify: failure sent to webhook' "$(grep -c 'hooks.invalid' "$CURL_LOG")" 1
rm -f "$WORK/state/failed"

# Повторы: временный сбой сборки не помечает коммит, третья неудача — помечает и уведомляет.
push_commit 'flaky build'
all_green
DEPLOY_ATTEMPTS=3 BUILD_FAIL=1 run
check 'retry 1: exit 1, not marked' "$(logged '^exit 1') $(failed)" "1 none"
check 'retry 1: attempt logged' "$(logged 'попытка 1 из 3')" 1
DEPLOY_ATTEMPTS=3 BUILD_FAIL=1 run
check 'retry 2: not marked' "$(failed)" none
DEPLOY_ATTEMPTS=3 BUILD_FAIL=1 run
check 'retry 3: marked failed' "$(failed)" "$(dev_head)"
check 'retry 3: owner notified' "$(grep -c 'hooks.invalid' "$CURL_LOG")" 1
rm -f "$WORK/state/failed"
DEPLOY_ATTEMPTS=3 run
check 'retry: success after fix, attempts reset' "$(deployed) $(test -f "$WORK/state/attempts" && echo kept || echo reset)" "$(dev_head) reset"

# Образы по коммиту: сборка с IMAGE_TAG, старые версии удаляются, последние KEEP_RELEASES остаются.
check 'tags: build with commit tag' "$(grep -c "build tag=$(dev_head | cut -c1-12)" "$STUB_LOG")" 1
push_commit 'cleanup'
all_green
keep1=$(tail -n 1 "$WORK/state/history" | cut -c1-12)
IMAGES="agregator-api:aaaaaaaaaaaa\nagregator-web:aaaaaaaaaaaa\nagregator-api:$keep1\nagregator-api:local\n" KEEP_RELEASES=2 run
check 'cleanup: old and :local removed' "$(grep -c 'image rm agregator-api:aaaaaaaaaaaa\|image rm agregator-web:aaaaaaaaaaaa\|image rm agregator-api:local' "$STUB_LOG")" 3
check 'cleanup: previous release kept' "$(grep -c "image rm agregator-api:$keep1" "$STUB_LOG")" 0

# Диск: свободного места меньше порога — кеш сборки чистится, сборка не запускается.
push_commit 'disk full'
all_green
MIN_FREE_GB=999999 run
check 'disk: builder cache pruned' "$(docker_calls 'builder prune')" 1
check 'disk: no build' "$(docker_calls 'compose.* build')" 0
check 'disk: reason logged' "$(logged 'на диске меньше')" 1
rm -f "$WORK/state/failed"

# Новая миграция: копия базы до переключения; без копии переключения нет.
mkdir -p "$WORK/dev/apps/api/prisma/migrations/2"
push_commit 'migration' apps/api/prisma/migrations/2/migration.sql
all_green
EXEC_FAIL=1 run
check 'pre-migration backup failed: no up' "$(docker_calls 'up -d')" 0
check 'pre-migration backup failed: reason' "$(logged 'копия перед миграцией не сделана')" 1
rm -f "$WORK/state/failed"
run
check 'pre-migration backup: dump before up' "$(grep -n 'exec -T db\|up -d' "$STUB_LOG" | cut -d: -f2 | cut -c1-30 | tr '\n' '|')" \
  'docker compose -f deploy/docke|docker compose -f deploy/docke|'
check 'pre-migration backup: file saved' "$(find "$WORK/backups" -name '*-pre-migration.dump' | wc -l | tr -d ' ')" 1
check 'pre-migration backup: deployed' "$(deployed)" "$(dev_head)"

# Откат на предыдущую версию без сборки: старый коммит, текущий помечен неудачным.
previous=$(tail -n 2 "$WORK/state/history" | head -n 1)
current=$(deployed)
: > "$STUB_LOG"
bash "$ROOT/deploy/autodeploy/rollback.sh" > "$WORK/out.log" 2>&1 || echo "exit $?" >> "$WORK/out.log"
check 'rollback: deployed previous' "$(deployed)" "$previous"
check 'rollback: server tree at previous' "$(head_of "$WORK/server")" "$previous"
check 'rollback: current marked failed' "$(failed)" "$current"
check 'rollback: no build' "$(docker_calls ' build tag=')" 0
check 'rollback: up with previous tag' "$(grep -c "up -d --no-build --remove-orphans tag=$(echo "$previous" | cut -c1-12)" "$STUB_LOG")" 1
INSPECT_FAIL=1 bash "$ROOT/deploy/autodeploy/rollback.sh" "$current" > "$WORK/out.log" 2>&1 || echo "exit $?" >> "$WORK/out.log"
check 'rollback: missing image refused' "$(logged 'нет образа')" 1
# Следующий коммит после отката разворачивается как обычно.
push_commit 'after rollback'
all_green
run
check 'after rollback: new commit deployed' "$(deployed)" "$(dev_head)"
# Проверка восстановления: последняя копия разворачивается, миграций не больше, чем в репозитории.
restore() { : > "$CURL_LOG"; bash "$ROOT/deploy/backup/restore-check.sh" > "$WORK/out.log" 2>&1 || echo "exit $?" >> "$WORK/out.log"; }
(cd "$WORK/server" && RESTORE_MIGRATIONS=1 restore)
check 'restore check: passed' "$(logged '^exit 1') $(logged 'готово')" "0 1"
(cd "$WORK/server" && RESTORE_MIGRATIONS=5 restore)
check 'restore check: too many migrations fails' "$(logged 'миграций в копии 5')" 1
(cd "$WORK/server" && RESTORE_FAIL=1 restore)
check 'restore check: pg_restore failure reported' "$(logged 'pg_restore не удался') $(grep -c 'hooks.invalid' "$CURL_LOG")" "1 1"
sed -i '/^NOTIFY_WEBHOOK_URL=/d' "$WORK/server/deploy/.env"

# 13. Локальная правка на сервере мешает fast-forward: стоп без пересборки.
echo local > "$WORK/server/app.txt"
git -C "$WORK/server" -c user.email=s@example.ru -c user.name=s commit -qam local
push_commit ten
all_green
run
check 'diverged: stopped' "$(logged 'fast-forward невозможен')" 1
check 'diverged: docker not called' "$(docker_calls compose)" 0

# Секреты не попадают в журнал (в .env на сервере их нет, но проверяем, что .env не печатается).
check 'no .env in log' "$(grep -c 'DOMAIN=' "$WORK/out.log" || true)" 0

if [ "$failures" -gt 0 ]; then
  echo "$failures autodeploy check(s) failed"
  exit 1
fi
echo 'Autodeploy checks passed'
