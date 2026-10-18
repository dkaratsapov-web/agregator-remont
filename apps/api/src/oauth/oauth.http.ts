import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { Agent, request as httpsRequest } from 'node:https';
import type { OAuthTls } from './oauth.config';

const TIMEOUT_MS = 10_000;
/** Ответы банка маленькие (токены, профиль); больше — ошибка, а не повод читать дальше. */
const MAX_BODY = 256 * 1024;

export interface BankResponse {
  status: number;
  body: unknown;
}

export class BankRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankRequestError';
  }
}

/** Идентификатор запроса для заголовков Сбера (rquid): 32 шестнадцатеричных символа. */
export const requestId = (): string => randomUUID().replaceAll('-', '');

const agents = new WeakMap<OAuthTls, Agent>();

function agentFor(tls: OAuthTls | undefined): Agent | undefined {
  if (!tls) return undefined;
  let agent = agents.get(tls);
  if (!agent) {
    agent = new Agent({
      pfx: tls.pfx,
      passphrase: tls.passphrase,
      ca: tls.ca,
      minVersion: 'TLSv1.2',
      keepAlive: true,
    });
    agents.set(tls, agent);
  }
  return agent;
}

/**
 * Запрос к банку с сервера: тело формы (application/x-www-form-urlencoded) или без тела, ответ
 * JSON. С сертификатом клиента — mTLS (Сбер ID). Таймаут и предел размера ответа: зависший или
 * огромный ответ не держит запрос пользователя.
 */
export function bankRequest(options: {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  form?: Record<string, string>;
  tls?: OAuthTls;
}): Promise<BankResponse> {
  const url = new URL(options.url);
  const body = options.form ? new URLSearchParams(options.form).toString() : undefined;
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: options.method,
        headers,
        agent: url.protocol === 'https:' ? agentFor(options.tls) : undefined,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY) {
            req.destroy(new BankRequestError(`response from ${url.host} is too large`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = undefined;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = undefined;
            }
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on('error', (error) => reject(new BankRequestError(error.message)));
      },
    );
    req.on('timeout', () => req.destroy(new BankRequestError(`${url.host} timed out`)));
    req.on('error', (error) =>
      reject(error instanceof BankRequestError ? error : new BankRequestError(error.message)),
    );
    if (body !== undefined) req.write(body);
    req.end();
  });
}
