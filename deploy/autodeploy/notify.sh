#!/usr/bin/env bash
# Уведомление владельцу о событии на сервере: bash deploy/autodeploy/notify.sh "текст".
# Каналы из deploy/.env (любой из них или оба; не задано ни одного — запись в журнал и код 3):
#   NOTIFY_TELEGRAM_TOKEN и NOTIFY_TELEGRAM_CHAT — бот Telegram и чат (личный или группа);
#   NOTIFY_WEBHOOK_URL — POST с текстом (Slack/Mattermost-совместимый JSON {"text": "..."}).
# Токены не попадают в командную строку процесса (curl читает адрес из stdin), в журнал не пишутся.
# Коды выхода: 0 — отправлено во все настроенные каналы, 1 — хотя бы один не принял, 3 — каналов нет.
set -uo pipefail

REPO_DIR=${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(dirname "$0")/lib.sh"

host=$(hostname 2> /dev/null || echo server)
text="Гарантыч ($host): ${1:-событие без текста}"
echo "[agregator-notify] $text"

token=$(env_value NOTIFY_TELEGRAM_TOKEN)
chat=$(env_value NOTIFY_TELEGRAM_CHAT)
webhook=$(env_value NOTIFY_WEBHOOK_URL)
sent=0 failed=0

if [ -n "$token" ] && [ -n "$chat" ]; then
  if printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$token" |
    curl -fsS --max-time 15 -K - --data-urlencode "chat_id=$chat" --data-urlencode "text=$text" > /dev/null; then
    sent=$((sent + 1))
  else
    failed=$((failed + 1))
  fi
fi

if [ -n "$webhook" ]; then
  json=$(python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1]}))' "$text")
  if printf 'url = "%s"\n' "$webhook" |
    curl -fsS --max-time 15 -K - -H 'Content-Type: application/json' --data "$json" > /dev/null; then
    sent=$((sent + 1))
  else
    failed=$((failed + 1))
  fi
fi

# Итог доставки — в STATE_DIR/notify-status (readiness.sh требует свежую успешную доставку).
if [ "$sent" -eq 0 ] && [ "$failed" -eq 0 ]; then
  # Не настроено — не «всё хорошо»: код 3, monitor.sh сообщит об этом внешнему монитору.
  echo '[agregator-notify] каналы не настроены (NOTIFY_* в deploy/.env), только журнал' >&2
  write_status notify-status result=unconfigured
  exit 3
elif [ "$failed" -gt 0 ]; then
  echo "[agregator-notify] не удалось отправить в $failed канал(а)" >&2
  write_status notify-status result=failed
  exit 1
fi
write_status notify-status result=ok
