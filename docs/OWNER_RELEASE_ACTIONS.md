# Что делает владелец перед выпуском (ТЗ #42)

Одна страница: только действия владельца в GitHub и на VPS. Порядок выкладки и отмена —
`docs/RELEASE_CHECKLIST.md`, статус каждого пункта — `docs/GO_NO_GO.md`. Ни одна команда ниже
не печатает пароли и токены. Команды на VPS — из `/opt/agregator`; каждая, что меняет сервер,
помечена «меняет».

**Одна проверка вместо списка:** `sudo bash deploy/autodeploy/readiness.sh` на VPS (только
чтение) проверяет всё ниже, что можно проверить с сервера, и по каждому пункту пишет ГОТОВО или
НУЖНО с действием; в конце «Итог: GO» или «NO-GO». Значения из `deploy/.env` не печатает.

## GitHub

- [ ] **Защита `main`** (сейчас её нет: проверено 2026-10-19 чтением API). Settings → Rules →
      Rulesets: цель — ветка по умолчанию, Active, Bypass list пустой, Restrict deletions,
      Block force pushes, Require a pull request, Require status checks — четыре проверки CI.
      Пошагово — `docs/BRANCH_PROTECTION.md`. Проверка без токена (только чтение):
      `curl -s https://api.github.com/repos/dkaratsapov-web/agregator-remont/rules/branches/main`
      — в ответе `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`.
      Список обхода — `gh api` из `BRANCH_PROTECTION.md`: `bypass=0`.

## Сервер: настройки в `deploy/.env` (меняет; значения в чат и GitHub не публикуются)

- [ ] **Копии вне сервера:** на своём компьютере `age-keygen -o key.txt` (файл — офлайн),
      строка `public key` → `BACKUP_AGE_RECIPIENT`; хранилище другого провайдера с
      версионированием, ключ сервера — запись и список без удаления → `BACKUP_RCLONE_REMOTE`;
      `BACKUP_REQUIRE_OFFSITE=true`.
- [ ] **Уведомления:** `NOTIFY_TELEGRAM_TOKEN` + `NOTIFY_TELEGRAM_CHAT` и/или
      `NOTIFY_WEBHOOK_URL`. Проверка: `sudo bash deploy/autodeploy/notify.sh "проверка"` —
      сообщение пришло.
- [ ] **Внешний монитор** (healthchecks.io или аналог, период 1 ч, допуск 1 ч) →
      `MONITOR_HEARTBEAT_URL`. Проверка: `sudo bash deploy/autodeploy/monitor.sh` — в мониторе
      пинг; при проблемах — `/fail`.
- [ ] **RPO / RTO** — решение: предложено для закрытого теста 24 ч / 4 ч, для публичного запуска
      ≤ 1 ч / ≤ 2 ч (нужны ежечасные копии — отдельная задача).

## Сервер: проверки (по `RELEASE_CHECKLIST.md`, шаги 1–9)

- [ ] **Готовность** (только чтение): `sudo bash deploy/autodeploy/readiness.sh` — «Итог: GO».
- [ ] **Опись сервера** (только чтение): `sudo bash deploy/autodeploy/inventory.sh > report.txt`
      — версия, контейнеры `healthy`, место ≥ 5 ГБ, миграции; отчёт без секретов.
- [ ] **Копия до выкладки** (меняет: пишет файл копии) — шаг 3 `RELEASE_CHECKLIST.md`.
- [ ] **Пробное восстановление вне сервера** (на своём компьютере с Docker):
      `AGE_IDENTITY=key.txt bash deploy/backup/offsite-restore-check.sh <хранилище>:<путь>` —
      `готово: копия вне сервера восстанавливается`. Ключ хранилища здесь — только на чтение.
- [ ] **Smoke после выкладки:** раздел 4 `RELEASE_CHECKLIST.md` (главная, вход, каталог,
      закрытые страницы 401, `/health/ready` 200).
- [ ] **Пароль администратора восстановим:** если забыт — команда из `docs/ACCOUNTS.md`
      («Новый пароль по ссылке»), меняет только таблицу ссылок.
- [ ] **Порядок отката прочитан:** раздел 5 «Как отменить обновление» `RELEASE_CHECKLIST.md`.
      `rollback.sh` запускается только при сбое: у него нет режима «посмотреть», он сразу
      откатывает (после предпроверок).
- [ ] **Таймеры** (меняет): `sudo bash deploy/autodeploy/install.sh`, затем
      `systemctl list-timers 'agregator-*'` — копия, проверка восстановления, почасовая
      проверка, автообновление.
- [ ] **Телефон:** главная на настоящем iPhone (Safari) и Android на мобильной сети — пролёт
      плавный, текст читается, нет горизонтальной прокрутки.

Когда все пункты отмечены, владелец заполняет столбец «Подтверждение» в `docs/GO_NO_GO.md`.
