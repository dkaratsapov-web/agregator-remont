import type { NotificationDto } from '@agregator/shared';
import { formatAmount } from './format';

/** «1 новое сообщение», «3 новых сообщения», «12 новых сообщений». */
export function newMessages(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} новое сообщение`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} новых сообщения`;
  return `${n} новых сообщений`;
}

/** «Срок 1 день», «2 дня», «5 дней». */
function days(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
}

export interface NotificationView {
  /** Что случилось — одной фразой. */
  title: string;
  /** Подробность (цена отклика, этап), если есть. */
  detail: string | null;
  /** Куда ведёт уведомление. */
  href: string;
}

/**
 * Текст и ссылка уведомления. Заказчик попадает на страницу своего заказа, исполнитель — на
 * «Ход работ»; отклонённый отклик ведёт на карточку заказа в каталоге (сделки у него нет).
 */
export function describeNotification(n: NotificationDto): NotificationView {
  const own = `/account/jobs/${n.jobId}`;
  const work = `/account/work/${n.jobId}`;
  const deal = n.party === 'OWNER' ? own : work;
  const stage = n.data.stageTitle ? `Этап «${n.data.stageTitle}»` : null;
  switch (n.kind) {
    case 'BID_RECEIVED': {
      const parts = [
        n.data.price !== undefined ? `${formatAmount(n.data.price)}\u00a0₽` : null,
        n.data.durationDays !== undefined ? `срок ${days(n.data.durationDays)}` : null,
      ].filter(Boolean);
      return { title: 'Новый отклик', detail: parts.join(', ') || null, href: `${own}#bids` };
    }
    case 'BID_WITHDRAWN':
      return { title: 'Мастер отозвал отклик', detail: null, href: `${own}#bids` };
    case 'BID_ACCEPTED':
      return { title: 'Вас выбрали исполнителем', detail: null, href: work };
    case 'BID_REJECTED':
      return {
        title:
          n.data.reason === 'JOB_CLOSED'
            ? 'Заказ закрыт без выбора исполнителя'
            : 'Заказчик выбрал другого исполнителя',
        detail: null,
        href: `/jobs/${n.jobId}`,
      };
    case 'PLAN_PROPOSED':
      return { title: 'План работ ждёт вашего согласования', detail: null, href: `${deal}#plan` };
    case 'PLAN_APPROVED':
      return { title: 'План работ согласован', detail: null, href: `${deal}#plan` };
    case 'PLAN_RETURNED':
      return { title: 'План работ вернули на доработку', detail: null, href: `${deal}#plan` };
    case 'PLAN_AUTHOR_CHANGED':
      return { title: 'Заказчик сменил, кто составляет план', detail: null, href: `${deal}#plan` };
    case 'STAGE_SUBMITTED':
      return { title: 'Этап сдан, проверьте работу', detail: stage, href: `${deal}#plan` };
    case 'STAGE_ACCEPTED':
      return { title: 'Этап принят', detail: stage, href: `${deal}#plan` };
    case 'STAGE_REWORK':
      return { title: 'Этап вернули на доработку', detail: stage, href: `${deal}#plan` };
    case 'CONTRACTOR_QUIT':
      return {
        title: 'Исполнитель отказался от заказа',
        detail: 'Заказ снова открыт для откликов',
        href: own,
      };
    case 'JOB_CLOSED':
      return {
        title: n.data.outcome === 'COMPLETED' ? 'Заказ завершён' : 'Заказ отменён',
        detail: null,
        href: deal,
      };
    case 'MESSAGE':
      return {
        title: n.count > 1 ? newMessages(n.count) : 'Новое сообщение',
        detail: null,
        href: `${deal}#chat`,
      };
  }
}
