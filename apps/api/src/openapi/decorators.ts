import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ErrorSchema } from './schemas';

export const BEARER_AUTH = 'session';

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Ошибка валидации запроса',
  401: 'Нет действующей сессии или неверные учётные данные',
  403: 'Роль не допускает операцию',
  404: 'Ресурса нет или он принадлежит другому пользователю',
  409: 'Конфликт с текущим состоянием ресурса',
  429: 'Превышен лимит частоты запросов или суточная квота',
  503: 'Функция временно выключена',
};

/** Ответы-ошибки операции в текущем формате NestJS (ErrorSchema). */
export const ApiErrors = (...statuses: (keyof typeof ERROR_DESCRIPTIONS)[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, type: ErrorSchema, description: ERROR_DESCRIPTIONS[status] }),
    ),
  );

/** Защищённый маршрут: Bearer-токен сессии; без него — 401. */
export const ApiSession = () => applyDecorators(ApiBearerAuth(BEARER_AUTH), ApiErrors(401));

/** Маршрут с ролью: дополнительно 403, если роль не подходит. */
export const ApiRole = () => applyDecorators(ApiSession(), ApiErrors(403));
