import {
  PLAN_PARTY_LABELS,
  planCompleted,
  stagesToSubmit,
  type JobPlanDto,
  type PlanParty,
} from '@agregator/shared';
import {
  acceptStageAction,
  approvePlanAction,
  quitJobAction,
  returnPlanAction,
  reworkStageAction,
  savePlanAction,
  setPlanAuthorAction,
  submitStageAction,
} from '@/app/(site)/account/plan/actions';
import { ConfirmActionForm } from '@/components/bids/confirm-action-form';
import { PhotoGrid } from '@/components/chat/photo-grid';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { formatDate } from '@/lib/format';
import { CommentActionForm } from './comment-action-form';
import { PlanEditor } from './plan-editor';
import { PlanStatusBadge, StageStatusBadge } from './plan-status-badge';

const other = (party: PlanParty): PlanParty => (party === 'OWNER' ? 'CONTRACTOR' : 'OWNER');
const lower = (party: PlanParty) => PLAN_PARTY_LABELS[party].toLowerCase();

/**
 * «Ход работ»: план и этапы заказа в работе для заказчика и выбранного исполнителя. Что
 * доступно, зависит от стороны, составителя и состояния; окончательные правила проверяет API.
 */
export function JobPlanPanel({
  plan,
  jobOpen,
  returnTo,
}: {
  plan: JobPlanDto;
  /** Заказ в работе (не закрыт): иначе только просмотр. */
  jobOpen: boolean;
  returnTo: string;
}) {
  const { jobId, viewer, author, status, version } = plan;
  const isAuthor = viewer === author;
  const submittable = new Set(stagesToSubmit(plan).map((stage) => stage.id));
  const done = planCompleted(plan);

  const description = !jobOpen
    ? 'Заказ закрыт: план и этапы — только для просмотра.'
    : status === 'DRAFT'
      ? isAuthor
        ? 'Разбейте работу на этапы. Когда план готов, отправьте его на согласование.'
        : `План составляет ${lower(author)}. Вы увидите его, когда он будет отправлен на согласование.`
      : status === 'PROPOSED'
        ? isAuthor
          ? `План отправлен: ждём, что ${lower(other(author))} согласует его или вернёт с комментарием.`
          : 'Проверьте план: согласуйте его или верните с комментарием, что изменить.'
        : done
          ? viewer === 'OWNER'
            ? 'Все этапы приняты. Закройте заказ как выполненный.'
            : 'Все этапы приняты. Заказчик закроет заказ.'
          : plan.sequential
            ? 'Этапы сдаются по порядку: следующий — после приёмки предыдущего.'
            : 'Этапы сдаются в любом порядке.';

  return (
    <Sheet labelledBy="plan-title" id="plan">
      <SheetHeader
        id="plan-title"
        title="Ход работ"
        description={description}
        action={<PlanStatusBadge status={status} />}
      />
      <SheetBody className="space-y-5">
        <p className="text-sm text-ink-soft">
          План составляет: <span className="font-medium text-ink">{lower(author)}</span>
          {status !== 'DRAFT' ? (
            <>
              {' · '}
              {plan.sequential ? 'этапы по порядку' : 'этапы в любом порядке'}
            </>
          ) : null}
        </p>

        {status === 'DRAFT' && plan.returnReason ? (
          <p className="rounded-[10px] border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink">
            <span className="font-semibold">План вернули с комментарием:</span>{' '}
            <span className="whitespace-pre-line">{plan.returnReason}</span>
          </p>
        ) : null}

        {jobOpen && status === 'DRAFT' && viewer === 'OWNER' ? (
          <ConfirmActionForm
            action={setPlanAuthorAction.bind(null, jobId, version, other(author), returnTo)}
            summary={author === 'OWNER' ? 'Пусть план составит исполнитель' : 'Составлю план сам'}
            explanation={
              author === 'OWNER'
                ? 'План будет составлять исполнитель, а вы — согласовывать.'
                : 'Вы составите план сами, а исполнитель его согласует. Черновик исполнителя, если он есть, останется.'
            }
            confirmLabel="Да, передать"
            pendingLabel="Сохраняем…"
          />
        ) : null}

        {jobOpen && status === 'DRAFT' && isAuthor ? (
          <PlanEditor
            action={savePlanAction.bind(null, jobId, version, returnTo)}
            stages={plan.stages}
            sequential={plan.sequential}
          />
        ) : status === 'DRAFT' ? null : (
          <ol className="divide-y divide-line rounded-[12px] border border-line">
            {plan.stages.map((stage) => (
              <li key={stage.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">
                    <span className="tabular-nums text-ink-soft">{stage.position}.</span>{' '}
                    {stage.title}
                    {stage.durationDays !== null ? (
                      <span className="ml-2 text-sm font-normal text-ink-soft">
                        {stage.durationDays} дн.
                      </span>
                    ) : null}
                  </p>
                  {status === 'APPROVED' ? <StageStatusBadge status={stage.status} /> : null}
                </div>
                {stage.description ? (
                  <p className="mt-1 max-w-[72ch] whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                    {stage.description}
                  </p>
                ) : null}
                {stage.submitComment && stage.status !== 'PLANNED' ? (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-medium">Исполнитель:</span>{' '}
                    <span className="whitespace-pre-line">{stage.submitComment}</span>
                    {stage.submittedAt ? (
                      <span className="text-ink-soft">
                        {' '}
                        · <time dateTime={stage.submittedAt}>{formatDate(stage.submittedAt)}</time>
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <PhotoGrid
                  jobId={jobId}
                  photos={stage.photos}
                  label={`Фото-отчёт: этап ${stage.position}`}
                />
                {stage.status === 'REWORK' && stage.reworkComment ? (
                  <p className="mt-2 rounded-[10px] border border-accent/40 bg-accent-tint px-3 py-2 text-sm text-ink">
                    <span className="font-semibold">Доработать:</span>{' '}
                    <span className="whitespace-pre-line">{stage.reworkComment}</span>
                  </p>
                ) : null}

                {jobOpen && viewer === 'CONTRACTOR' && submittable.has(stage.id) ? (
                  <div className="mt-3">
                    <CommentActionForm
                      action={submitStageAction.bind(null, jobId, stage.id, returnTo)}
                      summary={stage.status === 'REWORK' ? 'Сдать после доработки' : 'Этап сдан'}
                      label="Что сделано"
                      hint="Заказчик увидит комментарий и фото и примет этап или вернёт на доработку."
                      submitLabel="Сдать этап"
                      pendingLabel="Отправляем…"
                      photos
                    />
                  </div>
                ) : null}

                {jobOpen && viewer === 'OWNER' && stage.status === 'SUBMITTED' ? (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <ConfirmActionForm
                      action={acceptStageAction.bind(null, jobId, stage.id, returnTo)}
                      summary="Принять этап"
                      explanation="Этап будет отмечен как принятый. Вернуть его на доработку после этого нельзя."
                      confirmLabel="Да, принять"
                      pendingLabel="Принимаем…"
                    />
                    <CommentActionForm
                      action={reworkStageAction.bind(null, jobId, stage.id, returnTo)}
                      summary="На доработку"
                      label="Что доработать"
                      submitLabel="Вернуть на доработку"
                      pendingLabel="Отправляем…"
                      tone="secondary"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {jobOpen && status === 'PROPOSED' && !isAuthor ? (
          <div className="flex flex-wrap items-start gap-3">
            <ConfirmActionForm
              action={approvePlanAction.bind(null, jobId, version, returnTo)}
              summary="Согласовать план"
              explanation="После согласования план не меняется, исполнитель начнёт сдавать этапы."
              confirmLabel="Да, согласовать"
              pendingLabel="Согласуем…"
            />
            <CommentActionForm
              action={returnPlanAction.bind(null, jobId, version, returnTo)}
              name="reason"
              summary="Нужно изменить"
              label="Что изменить в плане"
              submitLabel="Вернуть план"
              pendingLabel="Отправляем…"
              tone="secondary"
            />
          </div>
        ) : null}

        {jobOpen && viewer === 'CONTRACTOR' ? (
          <div className="border-t border-line pt-4">
            <CommentActionForm
              action={quitJobAction.bind(null, jobId, returnTo)}
              name="reason"
              summary="Отказаться от заказа"
              label="Почему вы отказываетесь"
              hint="Заказчик увидит причину. Заказ снова откроется, ваш отклик будет отозван, план удалён."
              submitLabel="Отказаться от заказа"
              pendingLabel="Отправляем…"
              tone="secondary"
            />
          </div>
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
