import { PLAN_PARTY_LABELS, type JobMessagesDto } from '@agregator/shared';
import Link from 'next/link';
import { sendMessageAction } from '@/app/(site)/account/plan/actions';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/format';
import { AutoRefresh } from './auto-refresh';
import { MessageForm } from './message-form';
import { PhotoGrid } from './photo-grid';

const historyLinkClass =
  'inline-flex min-h-10 items-center rounded-[8px] px-1 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors duration-150 hover:decoration-accent';

/**
 * «Переписка» по заказу между заказчиком и выбранным исполнителем. Контакты сервис не
 * показывает: договариваются здесь. Новые сообщения подгружаются, пока вкладка открыта.
 * Видны последние сообщения; ранние — по ссылке «Показать ранние сообщения» (страница с
 * ?before=…, на ней не пишут и не обновляют).
 */
export function JobChatPanel({
  chat,
  requestId,
  returnTo,
  earlier = false,
}: {
  chat: JobMessagesDto;
  /** Ключ этой формы: повтор той же отправки не создаёт копию сообщения. */
  requestId: string;
  /** Страница заказа без параметров: сюда ведут ссылки истории и возврат после отправки. */
  returnTo: string;
  /** Показаны ранние сообщения (страница с ?before=…). */
  earlier?: boolean;
}) {
  const other = chat.viewer === 'OWNER' ? 'исполнителем' : 'заказчиком';
  return (
    <Sheet labelledBy="chat-title" id="chat">
      <SheetHeader
        id="chat-title"
        title="Переписка"
        description={
          chat.canWrite
            ? `Договоритесь с ${other} о деталях. Фото помогут показать, что и где сделать.`
            : 'Заказ закрыт: переписка только для чтения.'
        }
      />
      <SheetBody className="space-y-5">
        {earlier ? (
          <p className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-canvas px-4 py-2 text-sm text-ink-soft">
            Ранние сообщения
            <Link href={`${returnTo}#chat`} className={historyLinkClass}>
              К последним сообщениям
            </Link>
          </p>
        ) : null}
        {chat.hasEarlier && chat.items.length > 0 ? (
          <Link href={`${returnTo}?before=${chat.items[0].id}#chat`} className={historyLinkClass}>
            Показать ранние сообщения
          </Link>
        ) : null}
        {chat.items.length === 0 ? (
          <p className="text-sm text-ink-soft">Сообщений пока нет.</p>
        ) : (
          <ol className="space-y-3" aria-label="Сообщения">
            {chat.items.map((message) => (
              <li
                key={message.id}
                className={`max-w-[44rem] rounded-[12px] border px-4 py-3 ${
                  message.own ? 'ml-auto border-accent/30 bg-accent-tint' : 'border-line bg-canvas'
                }`}
              >
                <p className="text-xs text-ink-soft">
                  <span className="font-semibold text-ink">
                    {message.own ? 'Вы' : PLAN_PARTY_LABELS[message.author]}
                  </span>{' '}
                  · <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                </p>
                {message.body ? (
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
                    {message.body}
                  </p>
                ) : null}
                <PhotoGrid jobId={chat.jobId} photos={message.photos} label="Фото к сообщению" />
              </li>
            ))}
          </ol>
        )}
        {chat.canWrite && !earlier ? (
          <>
            <MessageForm action={sendMessageAction.bind(null, chat.jobId, requestId, returnTo)} />
            <AutoRefresh />
          </>
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
