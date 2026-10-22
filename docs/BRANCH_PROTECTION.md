# Защита ветки `main` (DEV-1)

**Статус: открыто, делает владелец.** Проверено 2026-10-19 только чтением публичного API
(`GET /repos/dkaratsapov-web/agregator-remont/rules/branches/main` → `[]`,
`/rulesets` → `[]`, `/branches/main` → `"protected": false`): на `main` нет ни одного правила.
Список обхода (bypass) без прав администратора не виден — его проверяет владелец (ниже). Код
этого не исправляет. Пока защиты нет, автообновление
сервера поставит любой коммит `main` с зелёным CI, в том числе прямой push, который сам меняет
`.github/workflows/ci.yml`. Claude Code правила репозитория не меняет.

## Настройка (GitHub, 5 минут)

1. Репозиторий → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch
   ruleset**.
2. **Ruleset name**: `main`. **Enforcement status**: `Active`.
3. **Bypass list**: пусто. Не добавлять ни Repository admin, ни Maintain, ни приложения: иначе
   правила можно обойти от имени администратора.
4. **Target branches** → **Add target** → **Include default branch**.
5. **Rules**, включить:
   - **Restrict deletions**;
   - **Block force pushes**;
   - **Require a pull request before merging**: *Required approvals* — 0, если владелец один
     и сам вливает PR (1, когда появится второй ревьюер); *Dismiss stale pull request
     approvals when new commits are pushed* — вкл.;
   - **Require status checks to pass** → *Require branches to be up to date before merging* —
     вкл.; **Add checks** (имена задач CI, источник — GitHub Actions):
     - `Lint, typecheck, test, build`
     - `Docker stack (compose)`
     - `Docker stack behind Caddy (proxy)`
     - `Disaster drills (backup, restore, broken release, rollback)`
6. **Create**.

Если GitHub предлагает только «Branch protection rules» (старый интерфейс): **Settings** →
**Branches** → **Add rule** для `main` с теми же пунктами и **Do not allow bypassing the above
settings**.

## Проверка

С компьютера владельца (нужен `gh`, вход под владельцем репозитория):

```bash
# Правила, действующие для main: ожидаются deletion, non_fast_forward, pull_request и
# required_status_checks с четырьмя проверками.
gh api repos/dkaratsapov-web/agregator-remont/rules/branches/main \
  --jq '.[] | .type + " " + ((.parameters.required_status_checks // []) | map(.context) | join(", "))'

# Обход правил: у каждого ruleset, который действует на main (а не у всех в репозитории),
# список bypass_actors пуст и режим — active (не evaluate).
for id in $(gh api repos/dkaratsapov-web/agregator-remont/rules/branches/main --jq '[.[].ruleset_id] | unique | .[]'); do
  gh api "repos/dkaratsapov-web/agregator-remont/rulesets/$id" \
    --jq '.name + ": enforcement=" + .enforcement + ", bypass=" + (.bypass_actors | length | tostring)'
done
```

На сервере то же проверяет `readiness.sh` (`deploy/autodeploy/ruleset_check.py`): четыре
проверки — точно по имени, ruleset `active`, список обхода пуст. Список обхода GitHub
показывает только с токеном (`READINESS_GITHUB_TOKEN`, порядок ввода —
`docs/OWNER_RELEASE_ACTIONS.md`); без него итог — NO-GO с причиной «список обхода не виден».
Закрыто по умолчанию: правила без `ruleset_id` (например, старые Branch protection rules), из
ruleset в режиме `evaluate` или с непустым обходом не засчитываются; пустой список задач,
неожиданный ответ или ответ на пределе страницы (100 правил) — тоже NO-GO.

Практическая проверка: попытка `git push origin HEAD:main` с любым коммитом должна получить
отказ `GH013: Repository rule violations found`, а PR без зелёных четырёх проверок — неактивную
кнопку «Merge».

## Что ещё учесть

- Автообновление сервера требует зелёными задачи из `REQUIRED_JOBS` в
  `deploy/autodeploy/deploy.sh` по тому же SHA и, с #42, чтобы коммит был слиянием PR в `main`
  (прямой push не разворачивается, владельцу приходит уведомление). Это вторая линия защиты, но
  не замена правил GitHub: PR с изменённым `ci.yml` без обязательных проверок можно слить, и
  такой коммит пройдёт обе проверки сервера.
- Токен для автообновления сервера (если будет) — только на чтение.
