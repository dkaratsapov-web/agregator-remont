// Нарушения Content-Security-Policy в браузерных сценариях (docs/SECURITY.md, переход CSP
// из report-only в enforce). Политика сейчас только сообщает о нарушениях, браузер пишет их в
// консоль; сценарий собирает их со всех вкладок и падает, если они есть. Так весь набор
// браузерных сценариев CI проверяет, что включение блокировки ничего не сломает.

const VIOLATION =
  /Content[- ]Security[- ]Policy|Refused to (load|execute|apply|connect|frame|evaluate)/i;

/** Следить за всеми вкладками браузера: возвращает массив, куда попадают нарушения. */
export function watchCsp(browser) {
  const violations = [];
  const watch = (context) =>
    context.on('console', (message) => {
      const text = message.text();
      if (VIOLATION.test(text)) violations.push(`${message.page()?.url() ?? '?'}: ${text}`);
    });
  for (const context of browser.contexts()) watch(context);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    watch(context);
    return context;
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (options) => {
    const page = await newPage(options);
    watch(page.context());
    return page;
  };
  return violations;
}

/** Итоговая проверка сценария: нарушений CSP нет (первые три — в сообщении). */
export function checkCsp(check, violations) {
  check(
    'no CSP violations in the browser',
    violations.length === 0,
    violations.slice(0, 3).join(' | '),
  );
}
