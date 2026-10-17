import { PRIVACY_OPERATOR, PRIVACY_POLICY_VERSION } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/landing/wordmark';

export const metadata: Metadata = {
  title: { absolute: 'Политика конфиденциальности · Гарантыч' },
  description: 'Как Гарантыч обрабатывает персональные данные пользователей и заявителей.',
};

const PENDING = '(будет указано)';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

/**
 * Политика обработки персональных данных (152-ФЗ). Публичная страница (без пароля Caddy).
 * Реквизиты оператора берутся из PRIVACY_OPERATOR; пока их нет, страница предупреждает об
 * этом, а приём заявок выключен.
 */
export default function PrivacyPage() {
  const operator = PRIVACY_OPERATOR;
  const version = new Date(`${PRIVACY_POLICY_VERSION}T00:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link
            href="/"
            className="flex min-h-11 items-center rounded-lg"
            aria-label="Гарантыч, на главную"
          >
            <Wordmark />
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Редакция от {version}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
          Политика конфиденциальности
        </h1>

        {operator ? null : (
          <p
            role="note"
            className="mt-8 rounded-2xl bg-accent-tint px-5 py-4 text-sm font-medium text-ink"
          >
            Реквизиты оператора будут опубликованы до начала приёма заявок. Пока они не указаны,
            форма заявки на главной выключена.
          </p>
        )}

        <Section title="1. Оператор">
          <p>
            Оператор персональных данных: {operator?.name ?? PENDING}, ИНН{' '}
            {operator?.inn ?? PENDING}, ОГРН {operator?.ogrn ?? PENDING}. Адрес для обращений по
            вопросам персональных данных:{' '}
            {operator ? (
              <a
                className="text-ink underline underline-offset-4"
                href={`mailto:${operator.email}`}
              >
                {operator.email}
              </a>
            ) : (
              PENDING
            )}
            .
          </p>
        </Section>

        <Section title="2. Какие данные обрабатываются и зачем">
          <p>
            <strong className="text-ink">Заявка на закрытое тестирование:</strong> имя и номер
            телефона. Цель: связаться с вами, чтобы предложить доступ к сервису.
          </p>
          <p>
            <strong className="text-ink">Аккаунт:</strong> имя, адрес электронной почты, роль
            (заказчик или подрядчик), а также сведения, которые вы сами указываете в заказах,
            откликах и профиле. Цель: работа сервиса (вход, размещение заказов, отклики).
          </p>
          <p>
            <strong className="text-ink">Технические данные:</strong> IP-адрес используется, чтобы
            ограничивать частоту запросов и защищать от перебора паролей. В базе данных он не
            сохраняется, но может временно оставаться в журналах сервера. Пароль хранится только в
            виде стойкого хеша (argon2id).
          </p>
        </Section>

        <Section title="3. Основание">
          <p>
            Ваше согласие (заявка на главной) и исполнение пользовательского соглашения при
            регистрации и работе с сервисом.
          </p>
        </Section>

        <Section title="4. Что делается с данными">
          <p>
            Сбор, запись, хранение, уточнение, использование и удаление. Данные хранятся на серверах
            в России. Данные не продаются и не передаются третьим лицам, кроме случаев,
            предусмотренных законом.
          </p>
        </Section>

        <Section title="5. Сроки хранения">
          <p>
            Данные заявки хранятся до окончания закрытого тестирования или до отзыва согласия.
            Данные аккаунта хранятся, пока аккаунт существует.
          </p>
        </Section>

        <Section title="6. Ваши права">
          <p>
            Вы можете узнать, какие ваши данные обрабатываются, попросить их уточнить или удалить и
            отозвать согласие. Для этого напишите на адрес из раздела 1. Ответ будет дан в срок,
            установленный законом.
          </p>
        </Section>

        <Section title="7. Cookie">
          <p>
            Сервис использует только необходимую cookie сессии: она нужна, чтобы вы оставались в
            аккаунте после входа. Рекламные и аналитические cookie не используются.
          </p>
        </Section>
      </main>
    </>
  );
}
