import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Notice } from '@/components/notice';
import { MarkAllRead } from '@/components/notifications/mark-all-read';
import { NotificationList } from '@/components/notifications/notification-list';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetHeader } from '@/components/ui/sheet';
import { isEntityId } from '@/lib/action-helpers';
import { getNotifications } from '@/lib/api';
import { requireUserPage } from '@/lib/customer';

export const metadata: Metadata = { title: 'Уведомления', robots: { index: false } };

const pagerLinkClass =
  'inline-flex min-h-9 items-center rounded-[8px] px-2 text-ink underline decoration-ink/25 underline-offset-4 transition-colors duration-150 hover:decoration-accent';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([
    requireUserPage('/account/notifications'),
    searchParams,
  ]);
  const cursor =
    typeof query.cursor === 'string' && isEntityId(query.cursor) ? query.cursor : undefined;

  let data: Awaited<ReturnType<typeof getNotifications>> | null = null;
  try {
    data = await getNotifications(token, cursor);
  } catch (error) {
    console.error('Notifications: failed to load', error);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Уведомления"
        description="Что произошло по вашим заказам: отклики, план работ, этапы и сообщения. Уведомления заказа становятся прочитанными, когда вы его открываете."
        action={data && data.unread > 0 ? <MarkAllRead /> : undefined}
      />
      {query.read ? (
        <div className="mt-6">
          <Notice>Все уведомления отмечены прочитанными.</Notice>
        </div>
      ) : null}
      <div className="mt-8 max-w-3xl">
        {data === null ? (
          <ApiUnavailable />
        ) : (
          <Sheet labelledBy="notifications-title">
            <SheetHeader
              id="notifications-title"
              title={
                <>
                  {cursor ? 'Ранние' : 'Последние'}
                  {data.unread > 0 ? (
                    <span className="ml-2 text-base font-normal text-ink-soft">
                      непрочитанных <span className="tabular-nums">{data.unread}</span>
                    </span>
                  ) : null}
                </>
              }
            />
            {data.items.length === 0 ? (
              <EmptyState title={cursor ? 'Ранних уведомлений нет' : 'Уведомлений пока нет'}>
                Здесь появятся новые отклики, план работ, сданные этапы и сообщения по вашим
                заказам.
              </EmptyState>
            ) : (
              <NotificationList items={data.items} />
            )}
            {cursor || data.nextCursor ? (
              <nav
                aria-label="Страницы"
                className="flex items-center justify-between border-t border-line px-5 py-2.5 text-sm font-semibold sm:px-6"
              >
                {cursor ? (
                  <Link href="/account/notifications" className={pagerLinkClass}>
                    К последним
                  </Link>
                ) : (
                  <span />
                )}
                {data.nextCursor ? (
                  <Link
                    href={`/account/notifications?cursor=${data.nextCursor}`}
                    className={pagerLinkClass}
                  >
                    Ранние
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </Sheet>
        )}
      </div>
    </div>
  );
}
