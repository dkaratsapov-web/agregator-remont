"""Решение «можно ли разворачивать коммит» по ответам GitHub Actions API (для deploy.sh).

Строго: зелёным считается только конкретный workflow (по пути файла) для точного SHA, у которого
каждая обязательная задача (job) завершена с conclusion=success. Пропущенная (skipped), neutral,
отменённая, отсутствующая задача — не зелёная. Любая непонятная ситуация — «ждать», а не
«разворачивать».

    python3 ci_gate.py run SHA WORKFLOW_PATH < runs.json
        pending | failure:<причина> | run:<id>
    python3 ci_gate.py jobs 'имя1|имя2|...' < pages.jsonl   (страницы ответа /jobs, по одной в строке)
        pending | failure:<причина> | success
    python3 ci_gate.py pages < page.json
        число задач на странице и total_count через пробел (для перебора страниц)
    python3 ci_gate.py pr SHA BRANCH < pulls.json   (ответ /commits/SHA/pulls)
        pr:<номер> | failure:<причина>
"""

import json
import sys

DONE_OK = 'success'


def pick_run(data: dict, sha: str, workflow: str) -> str:
    runs = [
        r
        for r in data.get('workflow_runs') or []
        if r.get('head_sha') == sha and r.get('path') == workflow
    ]
    if not runs:
        return 'pending'
    # Перезапуск даёт новую попытку (run_attempt) того же run или новый run: берём самый свежий.
    run = max(runs, key=lambda r: (r.get('id', 0), r.get('run_attempt', 0)))
    if run.get('status') != 'completed':
        return 'pending'
    if run.get('conclusion') != DONE_OK:
        return f"failure:workflow {run.get('conclusion')}"
    return f"run:{run['id']}"


def check_jobs(pages: list, required: list) -> str:
    jobs = {}
    for page in pages:
        for job in page.get('jobs') or []:
            name = job.get('name')
            # При повторных попытках задача встречается несколько раз: важна последняя.
            if name not in jobs or job.get('id', 0) > jobs[name].get('id', 0):
                jobs[name] = job
    for name in required:
        job = jobs.get(name)
        if job is None:
            return f'failure:нет задачи «{name}»'
        if job.get('status') != 'completed':
            return 'pending'
        if job.get('conclusion') != DONE_OK:
            return f"failure:«{name}» {job.get('conclusion')}"
    return 'success'


def merged_pr(pulls: list, sha: str, branch: str) -> str:
    # Коммит ветки должен быть результатом слияния PR в эту ветку (merge, squash или rebase —
    # merge_commit_sha совпадает с SHA). Прямой push в main такого PR не имеет, а коммит из
    # середины PR — имеет, но с другим merge_commit_sha.
    for pr in pulls:
        if (
            pr.get('merged_at')
            and pr.get('merge_commit_sha') == sha
            and (pr.get('base') or {}).get('ref') == branch
        ):
            return f"pr:{pr['number']}"
    return f'failure:коммит попал в {branch} не через слитый PR'


def main() -> None:
    mode = sys.argv[1]
    if mode == 'run':
        print(pick_run(json.load(sys.stdin), sys.argv[2], sys.argv[3]))
    elif mode == 'jobs':
        required = [name for name in sys.argv[2].split('|') if name]
        pages = [json.loads(line) for line in sys.stdin if line.strip()]
        print(check_jobs(pages, required) if required else 'failure:пустой список задач')
    elif mode == 'pages':
        page = json.load(sys.stdin)
        print(len(page.get('jobs') or []), page.get('total_count', 0))
    elif mode == 'pr':
        pulls = json.load(sys.stdin)
        if not isinstance(pulls, list):
            raise TypeError('pulls')
        print(merged_pr(pulls, sys.argv[2], sys.argv[3]))
    else:
        raise SystemExit(f'unknown mode {mode}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError) as error:
        # Непонятный ответ API — не разворачиваем.
        print(f'pending:{type(error).__name__}')
