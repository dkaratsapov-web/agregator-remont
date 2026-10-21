#!/usr/bin/env bash
# Готовность сервера к запуску одной командой, только чтение:
#   sudo bash deploy/autodeploy/readiness.sh
# Проверяет то, что CI проверить не может: защиту main в GitHub, копии вне сервера и проверку
# восстановления, каналы уведомлений и внешний монитор, таймеры, контейнеры, HTTPS и ответы
# сайта через Caddy, версию, миграции и место на диске. По каждому пункту — ГОТОВО или НУЖНО и
# что сделать (docs/OWNER_RELEASE_ACTIONS.md); в конце итог GO / NO-GO, код выхода 0 / 1.
# Ничего не меняет и не печатает значения из deploy/.env (только задано / не задано).
set -uo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}
GITHUB_API=${GITHUB_API:-https://api.github.com/repos/dkaratsapov-web/agregator-remont}
BRANCH=${BRANCH:-main}
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-26}
RESTORE_MAX_AGE_DAYS=${RESTORE_MAX_AGE_DAYS:-8}
MIN_FREE_GB=${MIN_FREE_GB:-5}
CERT_MIN_DAYS=${CERT_MIN_DAYS:-14}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

cd "$REPO_DIR" || { echo "Нет $REPO_DIR"; exit 1; }
compose=(docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml)
if grep -Eq '^BANK_LOGIN=true[[:space:]]*$' deploy/.env 2> /dev/null; then
  compose+=(-f deploy/docker-compose.bank-login.yml)
fi

missing=0
ok() { printf 'ГОТОВО  %s\n' "$1"; }
need() {
  missing=$((missing + 1))
  printf 'НУЖНО   %s\n        → %s\n' "$1" "$2"
}
is_set() { [ -n "$(env_value "$1")" ]; }
now=$(date +%s)

echo "Готовность сервера, $(date -u '+%Y-%m-%d %H:%M UTC')"
echo

# --- GitHub: правила main (чтение без токена).
rules=$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' "$GITHUB_API/rules/branches/$BRANCH" 2> /dev/null)
if [ -z "$rules" ]; then
  need 'Защита main: GitHub не ответил' 'повторите позже; проверка вручную — docs/BRANCH_PROTECTION.md'
else
  verdict=$(printf '%s' "$rules" | python3 -c '
import json, sys
rules = json.load(sys.stdin)
types = {r.get("type") for r in rules}
checks = set()
for r in rules:
    for c in (r.get("parameters") or {}).get("required_status_checks") or []:
        checks.add(c.get("context"))
need = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"]
lost = [t for t in need if t not in types]
print("ok" if not lost and len(checks) >= 4 else "нет правил: " + ", ".join(lost or ["меньше четырёх проверок CI"]))
' 2> /dev/null || echo 'ответ GitHub не разобран')
  if [ "$verdict" = ok ]; then
    ok 'Защита main: PR, четыре проверки CI, запрет force-push и удаления'
  else
    need "Защита main ($verdict)" 'Settings → Rules → Rulesets по docs/BRANCH_PROTECTION.md'
  fi
fi

# --- Резервные копии и восстановление (итоги backup.sh и restore-check.sh).
backup_at=$(status_value backup-status at)
mode=$(status_value backup-status mode)
if [ -z "$backup_at" ]; then
  need 'Копии базы: копий ещё не было' 'sudo bash deploy/autodeploy/install.sh (таймеры), затем sudo systemctl start agregator-backup'
elif [ $(((now - backup_at) / 3600)) -gt "$BACKUP_MAX_AGE_HOURS" ]; then
  need "Копии базы: последняя $(((now - backup_at) / 3600)) ч назад" 'journalctl -u agregator-backup -n 50; deploy/README.md «Резервные копии»'
elif [[ "$mode" != offsite-* ]]; then
  need 'Копии вне сервера: копии только на сервере' 'BACKUP_AGE_RECIPIENT, BACKUP_RCLONE_REMOTE, BACKUP_REQUIRE_OFFSITE=true в deploy/.env'
else
  ok "Копии базы: вне сервера ($mode), $(((now - backup_at) / 3600)) ч назад"
fi
restore_at=$(status_value restore-status at)
if [ -z "$restore_at" ]; then
  need 'Проверка восстановления: ещё не было' 'sudo systemctl start agregator-restore-check'
elif [ "$(status_value restore-status result)" != ok ]; then
  need 'Проверка восстановления: не прошла' 'journalctl -u agregator-restore-check -n 50'
elif [ $(((now - restore_at) / 86400)) -gt "$RESTORE_MAX_AGE_DAYS" ]; then
  need "Проверка восстановления: $(((now - restore_at) / 86400)) дн. назад" 'systemctl list-timers agregator-restore-check'
else
  ok "Проверка восстановления: прошла $(((now - restore_at) / 86400)) дн. назад"
fi

# --- Уведомления и внешний монитор (только задано / не задано).
if is_set NOTIFY_WEBHOOK_URL || { is_set NOTIFY_TELEGRAM_TOKEN && is_set NOTIFY_TELEGRAM_CHAT; }; then
  if [ "$(status_value notify-status result)" = failed ]; then
    need 'Уведомления: последнее не дошло' 'sudo bash deploy/autodeploy/notify.sh "проверка" — сообщение должно прийти'
  else
    ok 'Уведомления: канал задан'
  fi
else
  need 'Уведомления о сбоях: канал не задан' 'NOTIFY_TELEGRAM_TOKEN + NOTIFY_TELEGRAM_CHAT или NOTIFY_WEBHOOK_URL в deploy/.env'
fi
if is_set MONITOR_HEARTBEAT_URL; then
  ok 'Внешний монитор: адрес heartbeat задан'
else
  need 'Внешний монитор: не задан' 'healthchecks.io (период 1 ч) → MONITOR_HEARTBEAT_URL в deploy/.env'
fi

# --- Таймеры и последние запуски.
for unit in deploy backup restore-check monitor; do
  if ! systemctl is-active --quiet "agregator-$unit.timer" 2> /dev/null; then
    need "Таймер agregator-$unit не работает" 'sudo bash deploy/autodeploy/install.sh'
  elif systemctl is-failed --quiet "agregator-$unit.service" 2> /dev/null; then
    need "Последний запуск agregator-$unit с ошибкой" "journalctl -u agregator-$unit -n 50"
  else
    ok "Таймер agregator-$unit работает, последний запуск без ошибки"
  fi
done

# --- Контейнеры.
states=$("${compose[@]}" ps --format '{{.Service}} {{.State}} {{.Health}}' 2> /dev/null)
for service in db api web caddy; do
  line=$(printf '%s\n' "$states" | awk -v s="$service" '$1 == s')
  case "$line" in
    *" running healthy"* | "caddy running"*) ok "Контейнер $service работает" ;;
    "") need "Контейнер $service не запущен" "${compose[*]} ps; deploy/README.md" ;;
    *) need "Контейнер $service: $line" "${compose[*]} logs --tail 100 $service" ;;
  esac
done

# --- Сайт через Caddy: HTTPS, ответы, заголовки.
domain=$(env_value DOMAIN)
if [ -z "$domain" ]; then
  need 'Домен: DOMAIN в deploy/.env не задан' 'deploy/README.md «Домен»'
else
  end=$(echo | timeout 15 openssl s_client -servername "$domain" -connect 127.0.0.1:443 2> /dev/null |
    openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2)
  if [ -z "$end" ]; then
    need "HTTPS $domain: сертификат не прочитан" "${compose[*]} logs --tail 100 caddy"
  else
    days=$((($(date -d "$end" +%s) - now) / 86400))
    if [ "$days" -lt "$CERT_MIN_DAYS" ]; then
      need "HTTPS $domain: сертификат истекает через $days дн." "${compose[*]} logs --tail 100 caddy"
    else
      ok "HTTPS $domain: сертификат ещё $days дн."
    fi
  fi
  site="https://$domain"
  fetch() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$domain:443:127.0.0.1" "$site$1" || true; }
  bad=''
  for pair in /:200 /gate:200 /offline:200 /account:401 /jobs:401; do
    code=$(fetch "${pair%%:*}")
    [ "$code" = "${pair##*:}" ] || bad+=" ${pair%%:*}=$code (ожидалось ${pair##*:})"
  done
  if [ -z "$bad" ]; then
    ok 'Ответы сайта: главная и вход тестировщика открыты, остальное закрыто без пропуска'
  else
    need "Ответы сайта:$bad" 'docs/RELEASE_CHECKLIST.md, раздел 4 (smoke)'
  fi
  headers=$(curl -sI --max-time 10 --resolve "$domain:443:127.0.0.1" "$site/" 2> /dev/null | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  lost=''
  for header in strict-transport-security x-frame-options x-content-type-options content-security-policy; do
    printf '%s\n' "$headers" | grep -q "^$header" || lost+=" $header"
  done
  if [ -z "$lost" ]; then
    ok 'Заголовки безопасности: HSTS, X-Frame-Options, nosniff, CSP'
  else
    need "Заголовки безопасности: нет$lost" 'deploy/Caddyfile и apps/web/next.config.ts'
  fi
  redirect=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$domain:80:127.0.0.1" "http://$domain/" || true)
  case "$redirect" in
    301 | 302 | 307 | 308) ok 'HTTP переводит на HTTPS' ;;
    *) need "HTTP отвечает $redirect вместо перехода на HTTPS" 'deploy/Caddyfile' ;;
  esac
fi

# --- Версия, миграции, место.
deployed=$(cat "$STATE_DIR/deployed" 2> /dev/null || true)
remote=$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' "$GITHUB_API/commits/$BRANCH" 2> /dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])' 2> /dev/null || true)
if [ -z "$deployed" ]; then
  need 'Версия: автообновление ещё ничего не развернуло' 'sudo systemctl start agregator-deploy; journalctl -u agregator-deploy -n 50'
elif [ -n "$remote" ] && [ "$remote" != "$deployed" ]; then
  failed=$(cat "$STATE_DIR/failed" 2> /dev/null || true)
  if [ "$failed" = "$remote" ]; then
    need "Версия: ${remote:0:12} из main не развернулась (помечена неудачной)" 'journalctl -u agregator-deploy -n 100; deploy/README.md «Если обновление не прошло»'
  else
    ok "Версия: развёрнута ${deployed:0:12}, в main уже ${remote:0:12} (обновление в пути)"
  fi
else
  ok "Версия: развёрнута ${deployed:0:12}, совпадает с main"
fi
# shellcheck disable=SC2016 # переменные раскрываются внутри контейнера db
broken=$("${compose[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XtAc "select count(*) from _prisma_migrations where finished_at is null or rolled_back_at is not null"' 2> /dev/null | tr -d '[:space:]')
case "$broken" in
  0) ok 'Миграции базы: все применены без ошибок' ;;
  '') need 'Миграции базы: база не ответила' "${compose[*]} ps db" ;;
  *) need "Миграции базы: незавершённых или откатанных $broken" "${compose[*]} logs --tail 100 migrate" ;;
esac
free=$(df -Pk "$(docker info --format '{{.DockerRootDir}}' 2> /dev/null || echo /)" 2> /dev/null |
  awk 'NR==2 {print int($4 / 1048576)}')
if [ "${free:-0}" -ge "$MIN_FREE_GB" ]; then
  ok "Диск: свободно $free ГБ"
else
  need "Диск: свободно ${free:-?} ГБ (нужно от $MIN_FREE_GB)" 'docker system df; docker builder prune'
fi

echo
if [ "$missing" -eq 0 ]; then
  echo 'Итог: GO по серверу и GitHub. Остальное — docs/GO_NO_GO.md (телефон, юридические пункты).'
  exit 0
fi
echo "Итог: NO-GO, не готово пунктов: $missing (выше — что сделать). Подробно: docs/OWNER_RELEASE_ACTIONS.md"
exit 1
