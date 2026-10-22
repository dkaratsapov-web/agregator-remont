import type { ApiErrorBody, ApiErrorCode, FieldError, FieldErrorCode } from '@agregator/shared';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ApiError, QuotaExceeded } from './api-error';

/** Код по статусу — для ошибок без более точного кода (ADR 0002, раздел 5). */
const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
  502: 'BAD_GATEWAY',
  503: 'UNAVAILABLE',
};
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};
const INTERNAL_MESSAGE = 'Не удалось выполнить запрос. Попробуйте позже.';
const UNAVAILABLE_MESSAGE = 'Сервис временно недоступен. Попробуйте позже.';
const RATE_LIMITED_MESSAGE = 'Слишком много запросов. Подождите и попробуйте снова.';
/** Ошибки Prisma «база недоступна»: P1001 нет связи, P1002 таймаут, P1017 сервер закрыл связь. */
const DB_UNAVAILABLE = new Set(['P1001', 'P1002', 'P1017']);

/** Ограничение class-validator → код поля. */
export function fieldErrorCode(constraint: string): FieldErrorCode {
  if (constraint === 'whitelistValidation') return 'UNKNOWN_FIELD';
  if (['isDefined', 'isNotEmpty', 'arrayNotEmpty'].includes(constraint)) return 'REQUIRED';
  if (['minLength', 'arrayMinSize'].includes(constraint)) return 'TOO_SHORT';
  if (['maxLength', 'arrayMaxSize'].includes(constraint)) return 'TOO_LONG';
  if (['min', 'max', 'isLength', 'length'].includes(constraint)) return 'OUT_OF_RANGE';
  return 'INVALID';
}

/**
 * ValidationPipe с машинным форматом ошибок: `message` — тот же массив текстов, что и раньше
 * (прежний web показывает его как есть), плюс `fieldErrors` с путём и кодом каждого.
 */
export class ApiValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => this.toApiError(errors),
    });
  }

  private toApiError(errors: ValidationError[]): ApiError {
    const fieldErrors = collectFieldErrors(errors);
    return new ApiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      fieldErrors.map((f) => f.message),
      { fieldErrors },
    );
  }
}

/** Полный путь к полю (`stages.1.title`) и чистый текст ошибки — по дереву class-validator. */
export function collectFieldErrors(errors: ValidationError[], prefix = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      out.push({ path, code: fieldErrorCode(constraint), message });
    }
    if (error.children?.length) out.push(...collectFieldErrors(error.children, path));
  }
  return out;
}

/** Ошибка разбора тела (body-parser, http-errors): свой 4xx-статус, но не HttpException. */
function bodyParserStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const { status, type } = exception as { status?: unknown; type?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && typeof type === 'string'
    ? status
    : null;
}
const BODY_MESSAGES: Record<number, string> = {
  400: 'Тело запроса не разобрано: проверьте формат JSON',
  413: 'Слишком большой запрос',
  415: 'Неподдерживаемый формат тела запроса',
};

/**
 * Все ошибки — в одном формате с `code` (ADR 0002). Статус известных HttpException не
 * меняется, заголовки не удаляются. Непредвиденное — 500 INTERNAL (база недоступна — 503
 * UNAVAILABLE) с общим текстом: без стека, SQL и данных запроса; в журнал — код, статус,
 * маршрут и id пользователя.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & Partial<AuthenticatedRequest>>();
    const body = this.toBody(exception, res);
    if (body.statusCode >= 500) {
      const detail =
        exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception);
      this.logger.error(
        `${body.code} ${body.statusCode} ${req.method} ${req.route?.path ?? req.path} user=${req.auth?.user.id ?? '-'} ${detail}`,
      );
    }
    if (res.headersSent) return;
    // Маршрут картинки мог заранее поставить свой тип и кэширование: ошибка — всегда JSON.
    res.removeHeader('Cache-Control');
    res.status(body.statusCode).type('application/json').json(body);
  }

  private toBody(exception: unknown, res: Response): ApiErrorBody & Record<string, unknown> {
    if (exception instanceof ThrottlerException) {
      // throttler ставит Retry-After только для лимита default, для именованных —
      // Retry-After-<имя>; клиенту нужен один стандартный — наибольший из них.
      const waits = Object.entries(res.getHeaders())
        .filter(([name]) => name === 'retry-after' || name.startsWith('retry-after-'))
        .map(([, value]) => Number(value))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (waits.length > 0 && !res.headersSent) res.setHeader('Retry-After', Math.max(...waits));
      return {
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: RATE_LIMITED_MESSAGE,
        error: STATUS_TEXT[429],
      };
    }
    if (exception instanceof QuotaExceeded && !res.headersSent) {
      res.setHeader('Retry-After', exception.retryAfterSeconds);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const fields: Record<string, unknown> =
        typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
      const message =
        typeof raw === 'string'
          ? raw
          : typeof fields.message === 'string' || Array.isArray(fields.message)
            ? (fields.message as string | string[])
            : exception.message;
      return {
        ...fields,
        statusCode: status,
        code: typeof fields.code === 'string' ? fields.code : (STATUS_CODES[status] ?? 'INTERNAL'),
        // Голая 500 могла бы показать внутренний текст; у ошибок со своим кодом он для людей.
        message: status === 500 && typeof fields.code !== 'string' ? INTERNAL_MESSAGE : message,
        error: typeof fields.error === 'string' ? fields.error : (STATUS_TEXT[status] ?? 'Error'),
      };
    }
    const parserStatus = bodyParserStatus(exception);
    if (parserStatus !== null) {
      return {
        statusCode: parserStatus,
        code: STATUS_CODES[parserStatus] ?? 'BAD_REQUEST',
        message: BODY_MESSAGES[parserStatus] ?? 'Некорректный запрос',
        error: STATUS_TEXT[parserStatus] ?? 'Bad Request',
      };
    }
    const unavailable =
      exception instanceof Prisma.PrismaClientInitializationError ||
      (exception instanceof Prisma.PrismaClientKnownRequestError &&
        DB_UNAVAILABLE.has(exception.code));
    const status = unavailable ? 503 : 500;
    return {
      statusCode: status,
      code: unavailable ? 'UNAVAILABLE' : 'INTERNAL',
      message: unavailable ? UNAVAILABLE_MESSAGE : INTERNAL_MESSAGE,
      error: STATUS_TEXT[status],
    };
  }
}
