import { PLAN_PARTY_LABELS, type ContactExchangeDto } from '@agregator/shared';
import Link from 'next/link';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { formatDateTime, formatPhone } from '@/lib/format';
import { ContactsForm } from './contacts-form';

/**
 * Обмен контактами в сделке: каждая сторона сама решает, показать ли свои телефон и email.
 * Контакты второй стороны видны, только если она их открыла.
 */
export function ContactsPanel({
  jobId,
  contacts,
  returnTo,
}: {
  jobId: string;
  contacts: ContactExchangeDto;
  returnTo: string;
}) {
  const other = contacts.viewer === 'OWNER' ? 'исполнителю' : 'заказчику';
  const theirs = contacts.theirs;
  return (
    <Sheet labelledBy="contacts-title" id="contacts">
      <SheetHeader
        id="contacts-title"
        title="Контакты"
        description="Телефон и email видны второй стороне, только если их владелец сам их показал. Можно общаться в переписке ниже и не показывать контакты."
      />
      <SheetBody>
        <div className="grid gap-6 sm:grid-cols-2">
          <section aria-labelledby="contacts-theirs">
            <h3 id="contacts-theirs" className="text-sm font-semibold text-ink-soft">
              {PLAN_PARTY_LABELS[contacts.viewer === 'OWNER' ? 'CONTRACTOR' : 'OWNER']}:{' '}
              {contacts.counterpartName}
            </h3>
            {theirs ? (
              <dl className="mt-2 space-y-1.5 text-ink">
                <div>
                  <dt className="sr-only">Телефон</dt>
                  <dd>
                    {theirs.phone ? (
                      <a
                        href={`tel:${theirs.phone}`}
                        className="font-semibold tabular-nums underline underline-offset-4"
                      >
                        {formatPhone(theirs.phone)}
                      </a>
                    ) : (
                      <span className="text-ink-soft">Телефон не указан</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Email</dt>
                  <dd className="[overflow-wrap:anywhere]">
                    <a href={`mailto:${theirs.email}`} className="underline underline-offset-4">
                      {theirs.email}
                    </a>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-ink-soft">Контакты пока скрыты.</p>
            )}
          </section>
          <section aria-labelledby="contacts-mine">
            <h3 id="contacts-mine" className="text-sm font-semibold text-ink-soft">
              Мои контакты
            </h3>
            <p className="mt-2 text-ink">
              {contacts.mySharedAt
                ? `Показаны ${other} с ${formatDateTime(contacts.mySharedAt)}.`
                : `Скрыты: ${other} их не видно.`}
            </p>
            {!contacts.myPhoneSet ? (
              <p className="mt-1 text-sm text-ink-soft">
                Телефон в профиле не указан, будет виден только email.{' '}
                <Link
                  href="/account/settings"
                  className="font-semibold text-ink underline underline-offset-4"
                >
                  Добавить телефон
                </Link>
              </p>
            ) : null}
            <div className="mt-3">
              <ContactsForm jobId={jobId} shared={!!contacts.mySharedAt} returnTo={returnTo} />
            </div>
            {contacts.mySharedAt ? (
              <p className="mt-2 text-sm text-ink-soft">
                Скрытие не удаляет то, что вторая сторона уже записала.
              </p>
            ) : null}
          </section>
        </div>
      </SheetBody>
    </Sheet>
  );
}
