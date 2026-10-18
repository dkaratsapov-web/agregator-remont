#!/usr/bin/env bash
# Общие функции скриптов сервера (deploy.sh, notify.sh, backup, monitor). Подключается через source.

# Значение KEY из deploy/.env без выполнения файла (кавычки снимаются). Пусто, если ключа нет.
env_value() {
  local file=${ENV_FILE:-$REPO_DIR/deploy/.env}
  [ -f "$file" ] || return 0
  sed -n "s/^$1=//p" "$file" | tail -n 1 | sed -e "s/^['\"]//" -e "s/['\"]\$//"
}

# Уведомление владельцу (Telegram и/или вебхук из deploy/.env). Никогда не роняет вызывающий
# скрипт: сбой отправки только пишется в журнал.
notify() {
  bash "$(dirname "${BASH_SOURCE[0]}")/notify.sh" "$1" || true
}
