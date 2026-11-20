# Передача работы: состояние на 20.11.2026

Документ для разработчика (человека или новой сессии Claude Code), который продолжает работу.
Здесь то, что раньше жило только в переписке с владельцем: правила, открытые решения, состояние
веток и приёмы локальной проверки. Подробности функций описаны в остальных файлах `docs/`.

## Ветки и PR

- `main` на 3fe9d1b (слияние PR #65, AUD-10). Последние влитые: #61 (поддержка), #62 (кэш
  каталога), #64 (уведомление об ответе поддержки), #65 (AUD-10).
- PR #66 открыт (draft), ветка `claude/tender-rubin-3h0w2w`, 14 коммитов поверх main. CI на
  39dc087: все 4 обязательные задачи зелёные, конфликтов нет. Ждёт слова владельца «вливай».
  Внутри: CSP со своим nonce (AUD-02), агент проверки `garantych-reviewer` и исправления по его
  ревью. Список находок и коммитов: `docs/audit/REVIEW_AGENT_2026-10-29.md`.
- PR #63 владельца («независимый аудит») не сливать: это материал аудита GPT.

## Правила владельца

Действуют без исключений, пока владелец не скажет иначе.

- Разработчик один: Claude Code. GPT проводит независимый аудит и код не меняет.
- Без отдельного явного согласия владельца нельзя: merge в main, деплой на production, команды
  на production VPS, изменение production базы и конфигурации, настройка rulesets, отключение
  защит, принудительный откат, публикация паролей, ключей и данных пользователей, работа с
  реальными пользовательскими данными.
- Каждый merge только по новому слову «вливай» (или «вливаем», «выгружай обновления»).
  Согласие на один PR не переносится на другой.
- PR не называть готовым, пока на его последнем коммите нет четырёх success в CI.
- Маленькие отдельные PR, CI 4/4. Сначала тест, который воспроизводит дефект, потом исправление.
  Никаких выдуманных процентов готовности и утверждений о безопасности без проверки.
- Настоящие деньги, escrow и арбитраж не внедрять без отдельного этапа
  (`docs/PAYMENTS_DESIGN.md`). Сайт не обещает гарантий и хранения денег.
- Не коммитить секреты и персональные данные. Не коммитить `.claude/` (кроме файла агента
  `.claude/agents/garantych-reviewer.md`) и сгенерированный `apps/web/AGENTS.md`.
- Не просить пароли и токены в чате.
- Отвечать владельцу по-русски, просто и понятно, без смайликов и скобок-улыбок.
- Пушить только в ветку, выданную сессии. Отдельная ветка под каждый PR: владелец ещё не ответил.

## Решения, которые ждут владельца

1. Слияние PR #66.
2. Заказы удалённого заказчика без сделки: скрывать из каталога или стирать.
3. Запрещать ли демо-данные (`SEED_DEMO=true`) перед бетой (`readiness.sh` тогда даст NO-GO).
4. Можно ли под каждый PR делать отдельную ветку.
5. Переход CSP из report-only в enforce (`docs/SECURITY.md`, раздел 3).
6. Пункты владельца перед бетой: `docs/OWNER_RELEASE_ACTIONS.md`, `docs/GO_NO_GO.md`,
   `docs/audit/OWNER_VPS_CHECKLIST.md` (VPS, ruleset main, восстановление копии вне сервера,
   каналы уведомлений, юридические тексты, подпись GO/NO-GO). Бета сейчас NO-GO до этих пунктов.

## Что делать дальше (технически)

- Автопроверка контактов в «О себе» мастера: миграция enum `ContentFlag`, пометка при сохранении
  профиля, показ в админке. Отдельным PR.
- После решения владельца: заказы удалённого заказчика (скрытие или стирание) с тестом в
  `account-deletion.e2e-spec.ts` и строкой в `docs/ACCOUNTS.md`.
- Проверка владельца `/opt/agregator` в `install.sh` (каталог должен принадлежать root).
- Повторный прогон агента `garantych-reviewer` после слияния #66 по всему main.

## Локальная проверка

Нужен PostgreSQL 16 и `.env` в корне (скопировать из `.env.example`).

```bash
service postgresql start
pnpm install
pnpm lint          # eslint + prettier --check
pnpm typecheck
# API (все тесты или выбранные файлы)
cd apps/api && pnpm exec dotenv -e ../../.env -- jest --runInBand test/accounts.e2e-spec.ts
# Сайт
cd apps/web && pnpm -s exec vitest run
# Автодеплой и миграции (без сервера и Docker)
bash scripts/autodeploy-test.sh
bash scripts/migration-check-test.sh
python3 deploy/autodeploy/migration_check.py origin/main HEAD
```

Браузерные сценарии (`scripts/*-e2e.mjs`) идут против production-сборки на базе
`agregator_demo`:

```bash
set -a; . ./.env; set +a
export DATABASE_URL="${TEST_DATABASE_URL/agregator_test/agregator_demo}"
pnpm --filter @agregator/shared build && pnpm --filter @agregator/api build
(cd apps/api && pnpm exec prisma migrate deploy)
(cd apps/web && pnpm exec next build)
export NODE_ENV=production CORS_ORIGINS=https://remont.example TRUST_PROXY=loopback \
  WEB_TRUST_PROXY_HOPS=1 WEB_PUBLIC_ORIGIN=http://localhost:3000 \
  AUTH_RATE_LIMIT_PER_MIN=30 PRICE_ESTIMATES_CACHE_SEC=0
node apps/api/dist/main.js &
(cd apps/web && pnpm exec next start --port 3000) &
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/accounts-e2e.mjs
```

Что надо знать:

- Без `WEB_PUBLIC_ORIGIN` сайт в production падает на старте (каждый ответ 500).
- `landing-e2e` нужен Caddy на порту 8080, `webkit-e2e` нужен WebKit: оба проверяет CI.
- `ux-e2e` (INP) шумит, если машина нагружена параллельной сборкой.
- jest и браузерные сценарии используют разные базы (`agregator_test` и `agregator_demo`), но
  тяжёлые прогоны лучше не запускать одновременно.
- Не останавливать процессы через `pkill -f`: он убивает и собственную оболочку. Искать нужный
  процесс по `/proc/*/cmdline`.
- В облачном контейнере Claude Code нет Docker: шаги с образами проверяет только CI.
- Контейнер облачной сессии пересоздаётся: всё, что надо сохранить, коммитить и пушить.

## Тонкости, на которых уже обжигались

- CSP. `apps/web/src/proxy.ts` выдаёт nonce, Next.js читает его из заголовка запроса.
  Запросы с телом (`Content-Length`, `Transfer-Encoding`) идут мимо proxy: иначе Next.js
  копирует тело, обрезает после 10 МБ (`proxyClientMaxBodySize`) и ждёт его целиком. Им и путям
  статики CSP ставит `next.config.ts`. Запасная политика `script-src 'self'`, не `'none'`:
  браузер без JS всё равно загружает файлы по `<link rel="preload">`. В `config` proxy нельзя
  `as const` (Next.js разбирает его статически). Тесты matcher вызывают функции самого Next.js
  (`proxy.test.ts`).
- Блокировки PostgreSQL. Строку пользователя перед записью блокировать `FOR NO KEY UPDATE`
  (`apps/api/src/users/lock-user.ts`), не `FOR UPDATE`: `FOR UPDATE` конфликтует с `KEY SHARE`,
  который берут внешние ключи (уведомления, избранное), и даёт взаимоблокировки с выбором
  исполнителя. Гонку доказывать тестом с транзакцией-«паузой»
  (`apps/api/test/bids-concurrency.e2e-spec.ts`).
- Триггер `sessions_refuse_blocked_user` видит только зафиксированные данные.
- Ошибки API: список кодов в `packages/shared/src/errors.ts` (ADR 0002). После изменения DTO:
  `pnpm openapi:generate` и закоммитить `apps/api/openapi.json` и
  `packages/shared/src/generated/openapi.ts`.
- Новая миграция должна пройти `migration_check.py` (откат на прежнюю версию API). Опасный
  оператор только с пометкой `-- rollback-safe: <причина>` прямо перед ним.

## Агент проверки

`docs/REVIEW_AGENT.md`. Запуск в Claude Code: «Проверь PR #N агентом garantych-reviewer» или
`claude --agent garantych-reviewer -p "Проверь изменения ветки против origin/main"`. Подтверждённые
находки исправлять до PR, каждую с тестом, который падает до исправления.
