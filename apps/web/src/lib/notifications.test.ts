import { NOTIFICATION_KINDS, type NotificationDto } from '@agregator/shared';
import { describe, expect, it } from 'vitest';
import { describeNotification, newMessages } from './notifications';

const base: NotificationDto = {
  id: 'n1',
  kind: 'BID_RECEIVED',
  jobId: 'job1',
  jobTitle: 'Ремонт ванной',
  party: 'OWNER',
  count: 1,
  data: {},
  read: false,
  createdAt: '2026-10-20T10:00:00.000Z',
};
const view = (patch: Partial<NotificationDto>) => describeNotification({ ...base, ...patch });

describe('describeNotification', () => {
  it('every kind has a title and a link inside the site', () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const party of ['OWNER', 'CONTRACTOR'] as const) {
        const v = view({ kind, party });
        expect(v.title.length).toBeGreaterThan(3);
        expect(v.href.startsWith('/')).toBe(true);
        expect(v.href).not.toContain('//');
      }
    }
  });

  it('a bid shows its price and term and leads to the bids of the job', () => {
    expect(view({ data: { price: 90000, durationDays: 12 } })).toEqual({
      title: 'Новый отклик',
      detail: '90 000 ₽, срок 12 дней',
      href: '/account/jobs/job1#bids',
    });
    expect(view({ data: {} }).detail).toBeNull();
  });

  it('the owner goes to the job page, the contractor to the work page', () => {
    expect(view({ kind: 'MESSAGE', party: 'OWNER' }).href).toBe('/account/jobs/job1#chat');
    expect(view({ kind: 'MESSAGE', party: 'CONTRACTOR' }).href).toBe('/account/work/job1#chat');
    expect(view({ kind: 'STAGE_ACCEPTED', party: 'CONTRACTOR' }).href).toBe(
      '/account/work/job1#plan',
    );
    expect(view({ kind: 'BID_ACCEPTED', party: 'CONTRACTOR' }).href).toBe('/account/work/job1');
  });

  it('a rejected bid leads to the public job card and names the reason', () => {
    const other = view({
      kind: 'BID_REJECTED',
      party: 'CONTRACTOR',
      data: { reason: 'OTHER_ACCEPTED' },
    });
    expect(other).toMatchObject({
      title: 'Заказчик выбрал другого исполнителя',
      href: '/jobs/job1',
    });
    expect(view({ kind: 'BID_REJECTED', data: { reason: 'JOB_CLOSED' } }).title).toBe(
      'Заказ закрыт без выбора исполнителя',
    );
  });

  it('stages name the stage; closing names the outcome; messages are counted', () => {
    expect(view({ kind: 'STAGE_SUBMITTED', data: { stageTitle: 'Плитка' } }).detail).toBe(
      'Этап «Плитка»',
    );
    expect(view({ kind: 'JOB_CLOSED', data: { outcome: 'COMPLETED' } }).title).toBe(
      'Заказ завершён',
    );
    expect(view({ kind: 'JOB_CLOSED', data: { outcome: 'CANCELLED' } }).title).toBe(
      'Заказ отменён',
    );
    expect(view({ kind: 'MESSAGE', count: 1 }).title).toBe('Новое сообщение');
    expect(view({ kind: 'MESSAGE', count: 3 }).title).toBe('3 новых сообщения');
  });
});

describe('newMessages', () => {
  it('agrees the word with the number', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 101, 111].map(newMessages)).toEqual([
      '1 новое сообщение',
      '2 новых сообщения',
      '5 новых сообщений',
      '11 новых сообщений',
      '12 новых сообщений',
      '21 новое сообщение',
      '22 новых сообщения',
      '25 новых сообщений',
      '101 новое сообщение',
      '111 новых сообщений',
    ]);
  });
});
