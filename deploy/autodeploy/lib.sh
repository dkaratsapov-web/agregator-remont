#!/usr/bin/env bash
# Общие функции скриптов сервера (deploy.sh, notify.sh, backup, monitor). Подключается через source.

# Значение KEY из deploy/.env без выполнения файла (кавычки снимаются). Пусто, если ключа нет.
env_value() {
  local file=${ENV_FILE:-$REPO_DIR/deploy/.env}
  [ -f "$file" ] || return 0
  sed -n "s/^$1=//p" "$file" | tail -n 1 | sed -e "s/^['\"]//" -e "s/['\"]\$//"
}

# Каталог состояния сервера: что развёрнуто, итоги копий и проверок (читает monitor.sh).
: "${STATE_DIR:=/var/lib/agregator-deploy}"

# Уведомление владельцу (Telegram и/или вебхук из deploy/.env). Никогда не роняет вызывающий
# скрипт. Сбой отправки или отсутствие каналов отмечается в STATE_DIR/notify-status: monitor.sh
# считает это проблемой и не подтверждает внешнему монитору, что всё в порядке.
notify() {
  local code=0 result=ok
  bash "$(dirname "${BASH_SOURCE[0]}")/notify.sh" "$1" || code=$?
  case $code in
    0) ;;
    3) result=unconfigured ;;
    *) result=failed ;;
  esac
  write_status notify-status "result=$result"
}

# Итог операции в STATE_DIR/<имя>: строки key=value и время записи (at=секунды с 1970). Сбой
# записи не роняет вызывающий скрипт.
write_status() {
  local name=$1
  shift
  mkdir -p "$STATE_DIR" 2> /dev/null || return 0
  { printf '%s\n' "$@"; printf 'at=%s\n' "$(date +%s)"; } > "$STATE_DIR/$name.tmp" 2> /dev/null &&
    mv "$STATE_DIR/$name.tmp" "$STATE_DIR/$name" || true
}

# Значение key из файла состояния (пусто, если файла или ключа нет).
status_value() {
  sed -n "s/^$2=//p" "$STATE_DIR/$1" 2> /dev/null | tail -n 1
}
