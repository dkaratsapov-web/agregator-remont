import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * Схема ответов анкеты заказа (JobDetails из @agregator/shared): объект «id вопроса → значение».
 * Значение: строка (один вариант или текст), число, boolean или массив строк (несколько вариантов).
 * Состав вопросов зависит от категории и проверяется validateJobDetails, а не схемой.
 */
export const jobDetailsProperty = (description: string) => ({
  type: 'object' as const,
  description,
  additionalProperties: {
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
  } satisfies SchemaObject,
});
