// Нарушения Content-Security-Policy в браузерных сценариях (docs/SECURITY.md, переход CSP
// из report-only в enforce). Политика сейчас только сообщает о нарушениях, браузер пишет их в
// консоль; сценарий собирает их со всех вкладок и падает, если они есть. Так весь набор
// браузерных сценариев CI проверяет, что включение блокировки ничего не сломает.

// Нарушение — только отказ в загрузке или выполнении: «Refused to … Content Security Policy»
// (так пишут и Chromium, и WebKit). Служебные предупреждения о самой политике — не нарушения:
// например, WebKit сообщает, что frame-ancestors в report-only не действует.
export const VIOLATION = /Refused to .*Content[- ]Security[- ]Policy/is;

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
