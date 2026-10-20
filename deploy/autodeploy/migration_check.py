#!/usr/bin/env python3
"""Совместимость миграций с прежним кодом: migration_check.py <от> <до> (из корня репозитория).

Разбирает каждую миграцию, добавленную между двумя коммитами, на отдельные SQL-операторы (с
учётом комментариев, строк и $$-блоков; перенос строк внутри оператора не мешает) и пропускает
только операции из белого списка — те, с которыми прежняя версия API продолжает работать:

- CREATE TABLE, CREATE TYPE … AS ENUM, CREATE EXTENSION, COMMENT ON;
- CREATE INDEX (не уникальный);
- ALTER TABLE … ADD COLUMN: столбец допускает NULL или имеет DEFAULT, без CHECK и PRIMARY KEY;
- ALTER TABLE … ALTER COLUMN … SET DEFAULT;
- UPDATE и INSERT (заполнение данных, схема не меняется);
- любые операции над таблицами, созданными в этом же наборе миграций (прежний код их не знает),
  кроме внешнего ключа такой таблицы на существующую без ON DELETE CASCADE / SET NULL: прежний
  код, удаляя строку существующей таблицы, получит ошибку, если на неё ссылается новая.

Всё остальное (DROP, RENAME, смена типа, SET/DROP NOT NULL, новое значение enum, ограничения,
уникальный индекс на существующей таблице, функции, триггеры, неизвестные операторы) — опасно.
Опасный оператор допустим только с пометкой прямо перед ним; она относится к одному оператору:
    -- rollback-safe: <почему прежний код с этим работает>
Изменённая, удалённая или переименованная миграция — всегда несовместимо (пометка не поможет).

Это ограждение, а не доказательство: исполняемая проверка — scripts/schema-compat-test.sh
(прежний API на новой схеме в CI). Код выхода: 0 — совместимо, 2 — есть опасные операции.
С --list-unsafe печатает только имена опасных миграций (каталоги), по одному в строке: откат
сверяет их с миграциями, применёнными в живой базе.
"""
import re
import subprocess
import sys

MIGRATIONS = 'apps/api/prisma/migrations'
MARKER = re.compile(r'--\s*rollback-safe:\s*(\S.*)', re.IGNORECASE)


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def statements(sql):
    """Список (оператор в одну строку, пометка rollback-safe или None)."""
    out, buf, marker, i, n = [], [], None, 0, len(sql)

    def flush():
        text = ' '.join(''.join(buf).split())
        if text:
            out.append((text, marker))

    while i < n:
        if sql.startswith('--', i):
            end = sql.find('\n', i)
            end = n if end < 0 else end
            found = MARKER.match(sql[i:end])
            # Пометка действует, только если стоит перед оператором, а не внутри него.
            if found and not ''.join(buf).strip():
                marker = found.group(1).strip()
            i = end
            continue
        if sql.startswith('/*', i):
            end = sql.find('*/', i + 2)
            i = n if end < 0 else end + 2
            buf.append(' ')
            continue
        ch = sql[i]
        if ch in '\'"':
            # E'…' — строка с экранированием обратной косой чертой (\' не закрывает её). В
            # обычной строке и в идентификаторе кавычка экранируется только удвоением.
            escapes = (ch == "'" and i > 0 and sql[i - 1] in 'Ee'
                       and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] in '_$')))
            j = i + 1
            while j < n:
                if escapes and sql[j] == '\\':
                    j += 2
                    continue
                if sql[j] == ch:
                    if j + 1 < n and sql[j + 1] == ch:
                        j += 2
                        continue
                    break
                j += 1
            buf.append(sql[i:j + 1])
            i = j + 1
            continue
        # Метка $…$ как в Postgres: буква или _ в начале, дальше и цифры ($1 — параметр, не метка);
        # $ внутри имени (a$x$) — часть имени, а не начало строки.
        if ch == '$' and (i == 0 or not (sql[i - 1].isalnum() or sql[i - 1] in '_$')):
            tag = re.match(r'\$(?:[^\W\d]\w*)?\$', sql[i:])
            if tag:
                end = sql.find(tag.group(0), i + len(tag.group(0)))
                end = n if end < 0 else end + len(tag.group(0))
                buf.append(sql[i:end])
                i = end
                continue
        if ch == ';':
            flush()
            buf, marker = [], None
            i += 1
            continue
        buf.append(ch)
        i += 1
    flush()
    return out


def split_top(text):
    """Части через запятую верхнего уровня (действия одного ALTER TABLE)."""
    parts, depth, cur, quote = [], 0, '', None
    for ch in text:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
            continue
        if ch in '\'"':
            quote = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif ch == ',' and depth == 0:
            parts.append(cur.strip())
            cur = ''
            continue
        cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def name(identifier):
    return identifier.split('.')[-1].strip('"').lower()


def created_table(stmt):
    found = re.match(r'create (?:unlogged )?table (?:if not exists )?(\S+?)\s*\(', stmt, re.IGNORECASE)
    return name(found.group(1)) if found else None


def blocking_reference(s, new_tables):
    """Ссылка на существующую таблицу, которая помешает прежнему коду удалять её строки."""
    for found in re.finditer(r'references (\S+?)\s*\(', s):
        target = name(found.group(1))
        rest = s[found.end():].split(' references ')[0]
        on_delete = re.search(r'on delete (cascade|set null|set default|restrict|no action)', rest)
        if target not in new_tables and (not on_delete or on_delete.group(1) in ('restrict', 'no action')):
            return (f'внешний ключ на существующую таблицу {target} без ON DELETE CASCADE/SET NULL: '
                    'прежний код не сможет удалить строку, на которую ссылается новая')
    return None


def danger(stmt, new_tables):
    """None — безопасно, иначе причина."""
    s = stmt.lower()
    if re.match(r'create (unlogged )?table ', s) and created_table(stmt):
        return blocking_reference(s, new_tables)
    if re.match(r'create type \S+ as enum\b', s) or re.match(r'create extension\b', s):
        return None
    if re.match(r'comment on\b', s) or re.match(r'(update|insert into)\b', s):
        return None
    if re.match(r'create index\b', s):
        return None
    unique = re.match(r'create unique index (?:concurrently )?(?:if not exists )?\S+ on (?:only )?(\S+?)[\s(]', s)
    if unique:
        if name(unique.group(1)) in new_tables:
            return None
        return 'уникальный индекс на существующей таблице: прежний код может его нарушить'
    alter = re.match(r'alter table (?:if exists )?(?:only )?(\S+)\s+(.*)', s)
    if alter:
        if name(alter.group(1)) in new_tables:
            return blocking_reference(s, new_tables)
        for action in split_top(alter.group(2)):
            if re.match(r'add (?:column )?(?!constraint\b|primary\b|unique\b|foreign\b|check\b|exclude\b)', action):
                if 'not null' in action and 'default' not in action:
                    return 'обязательный столбец без DEFAULT: прежний код его не заполняет'
                if re.search(r'\b(check|primary key|generated)\b', action):
                    return f'новый столбец с ограничением: «{action[:80]}»'
                continue
            if re.match(r'alter (?:column )?\S+ set default\b', action):
                continue
            return f'изменение существующей таблицы: «{action[:80]}»'
        return None
    return 'операция не из списка безопасных — нужна проверка вручную'


def main():
    args = sys.argv[1:]
    list_unsafe = args[:1] == ['--list-unsafe']
    if list_unsafe:
        args = args[1:]
    if len(args) != 2:
        sys.exit('использование: migration_check.py [--list-unsafe] <от> <до>')
    base, head = args
    changes = []
    for line in git('diff', '--name-status', '-M', base, head, '--', MIGRATIONS).splitlines():
        status, *paths = line.split('\t')
        if any(p.endswith('migration.sql') for p in paths):
            changes.append((status[0], paths[-1]))

    added = {path: git('show', f'{head}:{path}') for kind, path in changes if kind == 'A'}
    parsed = {path: statements(sql) for path, sql in sorted(added.items())}
    new_tables = {t for stmts in parsed.values() for stmt, _ in stmts if (t := created_table(stmt))}

    unsafe = [path for kind, path in changes if kind != 'A']
    unsafe += [path for path, stmts in parsed.items()
               if any(danger(stmt, new_tables) and not marker for stmt, marker in stmts)]
    if list_unsafe:
        for path in sorted(set(unsafe)):
            print(path.split('/')[-2])
        return

    bad = 0
    for kind, path in changes:
        if kind != 'A':
            bad += 1
            print(f'НЕСОВМЕСТИМО: {path}\n  миграция изменена, удалена или переименована ({kind}): '
                  'применённые миграции не меняют, нужна новая миграция')
    for path, stmts in parsed.items():
        problems, marked = [], 0
        for stmt, marker in stmts:
            reason = danger(stmt, new_tables)
            if reason and marker:
                marked += 1
            elif reason:
                problems.append(f'  {stmt[:120]}\n    → {reason}')
        if problems:
            bad += 1
            print(f'НЕСОВМЕСТИМО: {path}')
            print('\n'.join(problems))
        elif marked:
            print(f'миграция {path}: опасные операции ({marked}) помечены rollback-safe')
        else:
            print(f'миграция {path}: только безопасные операции, прежний код совместим')

    if bad:
        print('Есть операции, с которыми прежняя версия API может не работать. Либо разделите миграцию')
        print('(сначала добавить, потом убрать — deploy/README.md), либо, если прежний код точно не')
        print('затронут, поставьте прямо перед оператором строку «-- rollback-safe: <причина>».')
        sys.exit(2)


if __name__ == '__main__':
    main()
