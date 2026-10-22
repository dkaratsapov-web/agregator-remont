#!/usr/bin/env bash
# Браузеры для e2e в CI: playwright install --with-deps ставит через apt около 180 пакетов
# Ubuntu. Зеркало раннера (azure.archive.ubuntu.com) бывает отдаёт их по минуте на пакет, и
# задача упиралась в общий предел 20 минут, хотя все тесты к тому времени уже прошли (PR #47,
# 22.10.2026, дважды). Поэтому:
# - зависшее соединение рвётся через 20 с, apt повторяет загрузку и переходит к следующему
#   зеркалу списка (Acquire::http::Timeout, Acquire::Retries);
# - основной архив Ubuntu ставится в списке зеркал первым;
# - каждая попытка ограничена по времени, попыток две; не вышло — понятная ошибка этого шага.
set -euo pipefail

ATTEMPTS=${ATTEMPTS:-2}
ATTEMPT_SECONDS=${ATTEMPT_SECONDS:-480}
MIRRORS=${APT_MIRRORS_FILE:-/etc/apt/apt-mirrors.txt}
SUDO=$([ "$(id -u)" -eq 0 ] && echo '' || echo sudo)

printf 'Acquire::http::Timeout "20";\nAcquire::https::Timeout "20";\nAcquire::Retries "5";\n' |
  $SUDO tee /etc/apt/apt.conf.d/99ci-network > /dev/null

# Порядок задают номера priority (меньше — раньше; при равных apt выбирает сам), поэтому
# список перенумеровывается: основной архив — 1, остальные — по порядку за ним.
if [ -f "$MIRRORS" ]; then
  { echo 'http://archive.ubuntu.com/ubuntu/'; grep -v '^http://archive\.ubuntu\.com/ubuntu' "$MIRRORS" | cut -f1; } |
    awk 'NF { printf "%s\tpriority:%d\n", $1, ++n }' | $SUDO tee "$MIRRORS.ci" > /dev/null
  $SUDO mv "$MIRRORS.ci" "$MIRRORS"
fi

for attempt in $(seq 1 "$ATTEMPTS"); do
  if timeout "$ATTEMPT_SECONDS" pnpm exec playwright install --with-deps chromium webkit; then
    exit 0
  fi
  echo "playwright install: попытка $attempt из $ATTEMPTS не уложилась или не удалась" >&2
  # Оборванная загрузка не трогает dpkg, но на всякий случай доводим прерванную установку.
  $SUDO dpkg --configure -a || true
done
echo 'Браузеры не установлены: зеркало пакетов Ubuntu недоступно или очень медленное. Перезапустите задачу позже.' >&2
exit 1
