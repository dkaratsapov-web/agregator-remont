#!/usr/bin/env bash
# Автообновление сервера из ветки main (запускается таймером systemd, см. install.sh).
#
# Каждый запуск:
# 1. Есть новый коммит в origin/main, который ещё не развёрнут и не помечен неудачным.
# 2. CI по этому точному SHA зелёный строго: workflow .github/workflows/ci.yml завершён успешно и
#    каждая обязательная задача (REQUIRED_JOBS) — success (ci_gate.py). Пока CI идёт или GitHub
#    не ответил (403/429/таймаут) — ждём следующего запуска, ничего не трогая.
# 3. Сервер переходит на коммит (только fast-forward), собирает образы (старые контейнеры в это
#    время работают), затем переключает контейнеры и при изменённом Caddyfile перезапускает Caddy.
# 4. Проверка здоровья: контейнеры запущены и healthy, через Caddy по HTTPS главная 200, закрытая
#    страница без пропуска 401, статика /_next/static и кадры /landing 200. Только после этого
#    коммит записывается как развёрнутый.
# Красный CI, неудачная сборка, сбой переключения или проверки — коммит помечается неудачным
# ($STATE_DIR/failed), скрипт завершается с ошибкой (systemd показывает unit как failed), в журнале
# причина и команды восстановления (deploy/README.md, «Если обновление не прошло»). Помеченный
# коммит не повторяется; следующий коммит в main пробуется заново. Повторить тот же после
# исправления: sudo rm /var/lib/agregator-deploy/failed && sudo systemctl start agregator-deploy.
# Миграции БД назад автоматически не откатываются.
#
# Ручной запуск: sudo systemctl start agregator-deploy.service; журнал: journalctl -u agregator-deploy
set -euo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
BRANCH=${BRANCH:-main}
GITHUB_API=${GITHUB_API:-https://api.github.com/repos/dkaratsapov-web/agregator-remont}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}
LOCK_FILE=${LOCK_FILE:-/run/agregator-deploy.lock}
REQUIRED_WORKFLOW=${REQUIRED_WORKFLOW:-.github/workflows/ci.yml}
REQUIRED_JOBS=${REQUIRED_JOBS:-Lint, typecheck, test, build|Docker stack (compose)|Docker stack behind Caddy (proxy)}
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-30}
HEALTH_DELAY=${HEALTH_DELAY:-5}
# Сколько раз пробовать коммит при сбое сборки, переключения или проверки (сеть apt/npm, медленный
# старт), прежде чем пометить его неудачным. Повтор — при следующем запуске таймера.
DEPLOY_ATTEMPTS=${DEPLOY_ATTEMPTS:-3}
# Минимум свободного места перед сборкой, ГБ (на сервере 30 ГБ, сборка Next.js — несколько ГБ).
MIN_FREE_GB=${MIN_FREE_GB:-5}
# Сколько последних развёрнутых версий образов хранить для быстрого отката (rollback.sh).
KEEP_RELEASES=${KEEP_RELEASES:-3}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$SCRIPT_DIR/ci_gate.py"
# shellcheck source=deploy/autodeploy/lib.sh
. "$SCRIPT_DIR/lib.sh"

log() { echo "[agregator-deploy] $*"; }

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'предыдущий запуск ещё идёт, пропускаю'
  exit 0
fi

cd "$REPO_DIR"
compose=(docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml)
# Вход через банк (Сбер ID, Т-Банк ID): API получает выход к банку и сертификат (deploy/README.md).
if grep -Eq '^BANK_LOGIN=true[[:space:]]*$' deploy/.env 2> /dev/null; then
  compose+=(-f deploy/docker-compose.bank-login.yml)
fi

git fetch --quiet origin "$BRANCH"
target=$(git rev-parse "origin/$BRANCH")
deployed=$(cat "$STATE_DIR/deployed" 2> /dev/null || true)
[ "$deployed" = "$target" ] && exit 0
if [ -f "$STATE_DIR/failed" ] && [ "$(cat "$STATE_DIR/failed")" = "$target" ]; then
  exit 0
fi

# Неудача. Временные сбои (сборка, переключение, проверка) повторяются до DEPLOY_ATTEMPTS раз при
# следующих запусках; после последней попытки коммит помечается неудачным и владелец получает
# уведомление. Причина и команды восстановления — в журнал, выход с ошибкой.
fail() {
  local tries=1
  if [ "${2:-}" = retry ]; then
    tries=$(($(sed -n "s/^$target //p" "$STATE_DIR/attempts" 2> /dev/null || true) + 1))
    echo "$target $tries" > "$STATE_DIR/attempts"
    if [ "$tries" -lt "$DEPLOY_ATTEMPTS" ]; then
      log "ОШИБКА: $1 (попытка $tries из $DEPLOY_ATTEMPTS, повтор при следующем запуске)"
      exit 1
    fi
  fi
  log "ОШИБКА: $1"
  log "коммит $target помечен неудачным, сайт может работать на прежних или частично обновлённых контейнерах"
  log "диагностика: ${compose[*]} ps; ${compose[*]} logs --tail 100 web api caddy"
  log "восстановление: deploy/README.md, раздел «Если обновление не прошло»; откат: deploy/autodeploy/rollback.sh"
  echo "$target" > "$STATE_DIR/failed"
  rm -f "$STATE_DIR/attempts"
  notify "обновление ${target:0:12} не прошло: $1. Откат: sudo bash deploy/autodeploy/rollback.sh"
  exit 1
}

# --- CI gate ---------------------------------------------------------------------------------
api() { curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$GITHUB_API/$1"; }
wait_ci() {
  log "CI для $target: $1, жду"
  exit 0
}

runs=$(api "actions/runs?head_sha=$target&event=push&branch=$BRANCH&per_page=100") ||
  wait_ci 'GitHub не ответил (сеть, 403/429 или таймаут)'
verdict=$(printf '%s' "$runs" | python3 "$GATE" run "$target" "$REQUIRED_WORKFLOW")
case "$verdict" in
  run:*) run_id=${verdict#run:} ;;
  failure:*)
    log "CI для $target красный (${verdict#failure:}), этот коммит не разворачиваю"
    echo "$target" > "$STATE_DIR/failed"
    notify "CI для ${target:0:12} красный (${verdict#failure:}), сайт не обновлён"
    exit 0
    ;;
  *) wait_ci 'ещё идёт или не найден' ;;
esac

pages=''
page=1
while :; do
  body=$(api "actions/runs/$run_id/jobs?filter=latest&per_page=100&page=$page") ||
    wait_ci 'список задач недоступен (сеть, 403/429 или таймаут)'
  pages+="$(printf '%s' "$body" | tr -d '\n')"$'\n'
  read -r count total < <(printf '%s' "$body" | python3 "$GATE" pages)
  seen=$(((page - 1) * 100 + count))
  if [ "$count" -eq 0 ] || [ "$seen" -ge "$total" ] || [ "$page" -ge 10 ]; then break; fi
  page=$((page + 1))
done
verdict=$(printf '%s' "$pages" | python3 "$GATE" jobs "$REQUIRED_JOBS")
case "$verdict" in
  success) ;;
  failure:*)
    log "CI для $target не зелёный (${verdict#failure:}), этот коммит не разворачиваю"
    echo "$target" > "$STATE_DIR/failed"
    notify "CI для ${target:0:12} не зелёный (${verdict#failure:}), сайт не обновлён"
    exit 0
    ;;
  *) wait_ci 'задачи ещё идут' ;;
esac

# --- Обновление ------------------------------------------------------------------------------
current=$(git rev-parse HEAD)
log "обновление $current -> $target"
if ! git merge --ff-only --quiet "origin/$BRANCH"; then
  log 'fast-forward невозможен (локальные изменения на сервере?), остановлено'
  echo "$target" > "$STATE_DIR/failed"
  exit 1
fi

# Образы помечаются коммитом (agregator-api:<sha>): прошлые версии остаются для отката.
export IMAGE_TAG=${target:0:12}

# Место на диске: сборке нужно несколько ГБ. Не хватает — сначала чистится кеш сборки.
free_gb() { df -Pk "$(docker info --format '{{.DockerRootDir}}' 2> /dev/null || echo /)" 2> /dev/null |
  awk 'NR==2 {print int($4 / 1048576)}'; }
if [ "$(free_gb || echo 0)" -lt "$MIN_FREE_GB" ]; then
  log "свободно меньше $MIN_FREE_GB ГБ, чищу кеш сборки"
  docker builder prune -f > /dev/null || true
  [ "$(free_gb || echo 0)" -ge "$MIN_FREE_GB" ] ||
    fail "на диске меньше $MIN_FREE_GB ГБ, сборка не запускалась (docker system df)" retry
fi

# Сначала только сборка: пока она идёт или если она упала, работают прежние контейнеры.
"${compose[@]}" build || fail 'сборка образов не удалась, контейнеры не переключались' retry

# Новая миграция: перед переключением — копия базы (deploy/backup/backup.sh). Без копии нет и
# переключения: миграции назад автоматически не откатываются.
base=$current
if [ -n "$deployed" ] && git cat-file -e "$deployed^{commit}" 2> /dev/null; then base=$deployed; fi
if ! git diff --quiet "$base" "$target" -- apps/api/prisma/migrations; then
  log 'в обновлении новая миграция базы: делаю резервную копию'
  bash "$SCRIPT_DIR/../backup/backup.sh" pre-migration ||
    fail 'резервная копия перед миграцией не сделана, контейнеры не переключались' retry
fi

# Переключение. Может закончиться частично (часть контейнеров новая) — это видно в проверке ниже.
"${compose[@]}" up -d --remove-orphans || fail 'переключение контейнеров не удалось' retry
# Caddyfile смонтирован файлом: после git pull контейнер видит новую версию только после рестарта.
# Сравнение с последним развёрнутым коммитом, а не с HEAD: при повторе после неудачи HEAD уже
# на target, а Caddy ещё со старым файлом.
if ! git diff --quiet "$base" "$target" -- deploy/Caddyfile; then
  "${compose[@]}" restart caddy || fail 'перезапуск Caddy не удался' retry
fi

# --- Проверка здоровья -----------------------------------------------------------------------
domain=$(sed -n 's/^DOMAIN=//p' deploy/.env 2> /dev/null | tr -d "\"'" | tail -n 1)
[ -n "$domain" ] || fail 'в deploy/.env нет DOMAIN, проверить сайт через Caddy нельзя'
site="https://$domain"
fetch() { curl -s -o "${2:-/dev/null}" -w '%{http_code}' --max-time 10 --resolve "$domain:443:127.0.0.1" "$site$1" || true; }

# Контейнеры: запущены, а у кого есть healthcheck — healthy (migrate завершается сам и не нужен).
containers_ok() {
  local states
  # У сервиса без healthcheck (caddy) поле Health пустое, и строка кончается пробелом:
  # «caddy running ». Хвостовые пробелы убираются, иначе проверка не проходит никогда.
  states=$("${compose[@]}" ps --format '{{.Service}} {{.State}} {{.Health}}' 2> /dev/null | sed 's/[[:space:]]*$//') ||
    return 1
  for service in db api web caddy; do
    printf '%s\n' "$states" | grep -Eq "^$service running( healthy)?\$" || return 1
  done
}

problem='контейнеры не поднялись'
for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if containers_ok; then
    home=$(mktemp)
    code=$(fetch / "$home")
    if [ "$code" != 200 ]; then
      problem="главная через Caddy отвечает $code"
    elif [ "$(fetch /jobs)" != 401 ]; then
      problem='закрытая страница /jobs без пропуска отвечает не 401'
    else
      asset=$(grep -o '/_next/static/[^"]*\.js' "$home" | head -n 1 || true)
      frame=$(grep -o '/landing/[^",]*\.\(avif\|webp\)' "$home" | head -n 1 || true)
      if [ -z "$asset" ] || [ "$(fetch "$asset")" != 200 ]; then
        problem="статика /_next/static недоступна (${asset:-нет ссылки на главной})"
      elif [ -n "$frame" ] && [ "$(fetch "$frame")" != 200 ]; then
        problem="кадр $frame недоступен"
      else
        problem=''
      fi
    fi
    rm -f "$home"
    [ -z "$problem" ] && break
  fi
  sleep "$HEALTH_DELAY"
done
[ -z "$problem" ] || fail "проверка после обновления: $problem" retry

echo "$target" > "$STATE_DIR/deployed"
rm -f "$STATE_DIR/failed" "$STATE_DIR/attempts"
# История для отката: последние развёрнутые коммиты, новые в конце.
{ grep -v "^$target\$" "$STATE_DIR/history" 2> /dev/null || true; echo "$target"; } |
  tail -n 20 > "$STATE_DIR/history.new" && mv "$STATE_DIR/history.new" "$STATE_DIR/history"

# Место на диске (на сервере 30 ГБ): образы старше KEEP_RELEASES последних версий, висячие образы
# и кеш сборки старше трёх суток.
keep=$(tail -n "$KEEP_RELEASES" "$STATE_DIR/history" | cut -c1-12)
docker image ls --format '{{.Repository}}:{{.Tag}}' 2> /dev/null |
  grep -E '^agregator-(api|web):([0-9a-f]{12}|local)$' | while read -r image; do
  printf '%s\n' "$keep" | grep -qx "${image##*:}" || docker image rm "$image" > /dev/null 2>&1 || true
done
docker image prune -f > /dev/null || true
docker builder prune -f --filter until=72h > /dev/null 2>&1 || true

heartbeat=$(env_value DEPLOY_HEARTBEAT_URL)
if [ -n "$heartbeat" ]; then
  printf 'url = "%s"\n' "$heartbeat" | curl -fsS --max-time 10 -K - > /dev/null || log 'heartbeat не отправлен'
fi
log "готово: $target, проверка пройдена"
