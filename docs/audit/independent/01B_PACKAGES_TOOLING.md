# Этап 01-Б — пакеты и TypeScript / линт / зависимости

**Проверяемый SHA:** `89614b5702b13435f05d9e1dbc7f126abdaa6801`.
**Прочитаны на данном SHA:** `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json`, `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `packages/shared/tsconfig.json`, `eslint.config.mjs`, `.github/dependabot.yml`, помимо предыдущих 13 файлов этапа 01.

## Подтверждённые свойства
1. Все три packages используют строгий TypeScript. API `noImplicitOverride` и `noFallthroughCasesInSwitch`; Web использует bundler resolution и Next-generated types; shared публикует типизированный dist.
2. `apps/api/package.json` — Prisma generation перед typecheck/test/build; Jest `--runInBand`; отдельный Prisma migrate deploy.
3. `apps/web/package.json` — next typegen перед typecheck, Vitest для unit, `@vitest/coverage-v8` присутствует.
4. ESLint 10 + TypeScript ESLint recommended; Next core-web-vitals; правила React Hooks. Консистентность type-imports намеренно отключена для Nest metadata — технически оправдано.
5. Dependabot раз в неделю для npm и GitHub Actions с отдельной группой minor/patch.
6. `pnpm-workspace.yaml` содержит overrides для патчей транзитивных `multer`, `body-parser`, `js-yaml`. Реальную разрешённую версию устанавливает lockfile и её необходимо проверять отдельно.

## Проверки, которым не присвоен PASS
- Полный `pnpm-lock.yaml` ещё не вычитан на текущем SHA, `pnpm audit` самостоятельно не запускался; зелёный CI PR #61 ранее зафиксирован отдельно.
- Зависимости не устанавливались, не было независимого typecheck/tests.
- Нет основания утверждать, что отсутствуют 0-day или низкоуровневые runtime-дефекты.

## Риски
- **AUD-04 / LOW**: свободный upper bound `engines.node >=22` против production Node22; явно определить supported Node majors и тестовую матрицу.
- **AUD-07 / INFORMATIONAL**: `skipLibCheck: true` у всех tsconfigs допустим, но маскирует ошибки деклараций сторонних библиотек. Это не defect автоматически.
- **AUD-08 / INFORMATIONAL**: `@typescript-eslint/consistent-type-imports` отключён для всех API .ts в связи с Nest metadata. При обновлении decorator semantics перепроверить runtime DI tests.

## Дальше
Разобрать root lockfile и соответствие версии дерева; затем переходить к этапу 02 — детальный аудит auth/session/guards.
