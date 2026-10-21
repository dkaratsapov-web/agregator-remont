#!/usr/bin/env python3
"""Защищена ли ветка main правилами GitHub: ruleset_check.py "<задача1>|<задача2>|…" < ответ.

На входе JSON {"rules": <GET rules/branches/main>, "rulesets": [<GET rulesets/<id>>, …]}.
Печатает «ok» или причины через «; ». Требования (docs/BRANCH_PROTECTION.md):
- в правилах для main есть deletion, non_fast_forward, pull_request и required_status_checks;
- обязательные проверки содержат каждую задачу CI из списка точно по имени (чужие четыре
  проверки не засчитываются);
- каждый ruleset, действующий на main, включён (enforcement=active, не evaluate) и без обхода
  (bypass_actors пуст). Список обхода GitHub показывает только с правами администратора: если
  его нет в ответе, обход не проверен — это не «ok».
"""
import json
import sys

NEED = ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']


def problems(data, required):
    rules = data.get('rules') or []
    found = []
    types = {r.get('type') for r in rules}
    missing = [t for t in NEED if t not in types]
    if missing:
        found.append('нет правил: ' + ', '.join(missing))
    contexts = set()
    for rule in rules:
        if rule.get('type') == 'required_status_checks':
            for check in (rule.get('parameters') or {}).get('required_status_checks') or []:
                contexts.add(check.get('context'))
    lost = [job for job in required if job not in contexts]
    if lost:
        found.append('не обязательны проверки CI: ' + ', '.join(lost))
    ids = {r.get('ruleset_id') for r in rules if r.get('ruleset_id') is not None}
    rulesets = {rs.get('id'): rs for rs in data.get('rulesets') or [] if isinstance(rs, dict)}
    for ruleset_id in sorted(ids):
        ruleset = rulesets.get(ruleset_id)
        if ruleset is None:
            found.append(f'ruleset {ruleset_id} не прочитан')
            continue
        name = ruleset.get('name') or ruleset_id
        if ruleset.get('enforcement') != 'active':
            found.append(f'ruleset «{name}»: enforcement={ruleset.get("enforcement")}, нужно active')
        if 'bypass_actors' not in ruleset:
            found.append(f'ruleset «{name}»: список обхода не виден (нужен READINESS_GITHUB_TOKEN)')
        elif ruleset['bypass_actors']:
            found.append(f'ruleset «{name}»: есть обход ({len(ruleset["bypass_actors"])})')
    return found


def main():
    required = [job for job in sys.argv[1].split('|') if job]
    try:
        data = json.load(sys.stdin)
    except ValueError:
        print('ответ GitHub не разобран')
        return
    found = problems(data, required)
    print('ok' if not found else '; '.join(found))


if __name__ == '__main__':
    main()
