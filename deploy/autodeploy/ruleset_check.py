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
Закрыто по умолчанию: правило засчитывается, только если пришло из проверенного ruleset
(прочитан, active, список обхода виден и пуст). Правило без ruleset_id, пустой список задач,
неожиданный формат или ответ на пределе страницы — не «ok».
"""
import json
import sys

NEED = ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']
# rules/branches запрашивается с per_page=100: полный ответ всегда короче.
PAGE = 100


def problems(data, required):
    found = []
    if not required:
        return ['список обязательных задач CI пуст']
    rules = data.get('rules') if isinstance(data, dict) else None
    if not isinstance(rules, list) or not all(isinstance(r, dict) for r in rules):
        return ['ответ GitHub о правилах в неожиданном формате']
    if len(rules) >= PAGE:
        found.append(f'правил {len(rules)} или больше: ответ мог быть неполным')
    rulesets = {rs.get('id'): rs for rs in data.get('rulesets') or [] if isinstance(rs, dict)}

    unidentified = sorted({str(r.get('type')) for r in rules if r.get('ruleset_id') is None})
    if unidentified:
        found.append('правила без ruleset_id (обход не проверить): ' + ', '.join(unidentified))
    verified = set()
    for ruleset_id in sorted({r['ruleset_id'] for r in rules if r.get('ruleset_id') is not None}):
        ruleset = rulesets.get(ruleset_id)
        if ruleset is None:
            found.append(f'ruleset {ruleset_id} не прочитан')
            continue
        name = ruleset.get('name') or ruleset_id
        ok = True
        if ruleset.get('enforcement') != 'active':
            found.append(f'ruleset «{name}»: enforcement={ruleset.get("enforcement")}, нужно active')
            ok = False
        if not isinstance(ruleset.get('bypass_actors'), list):
            found.append(f'ruleset «{name}»: список обхода не виден (нужен READINESS_GITHUB_TOKEN)')
            ok = False
        elif ruleset['bypass_actors']:
            found.append(f'ruleset «{name}»: есть обход ({len(ruleset["bypass_actors"])})')
            ok = False
        if ok:
            verified.add(ruleset_id)

    # Засчитываются только правила проверенных ruleset.
    trusted = [r for r in rules if r.get('ruleset_id') in verified]
    if not trusted:
        found.append('нет ни одного проверенного ruleset (active, без обхода)')
    types = {r.get('type') for r in trusted}
    missing = [t for t in NEED if t not in types]
    if missing:
        found.append('нет правил: ' + ', '.join(missing))
    contexts = set()
    for rule in trusted:
        if rule.get('type') == 'required_status_checks':
            checks = (rule.get('parameters') or {}).get('required_status_checks') or []
            contexts.update(c.get('context') for c in checks if isinstance(c, dict))
    lost = [job for job in required if job not in contexts]
    if lost:
        found.append('не обязательны проверки CI: ' + ', '.join(lost))
    return found


def main():
    required = [job for job in (sys.argv[1] if len(sys.argv) > 1 else '').split('|') if job]
    try:
        data = json.load(sys.stdin)
    except ValueError:
        print('ответ GitHub не разобран')
        return
    found = problems(data, required)
    print('ok' if not found else '; '.join(found))


if __name__ == '__main__':
    main()
