import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OAuthConfig } from '../src/oauth/oauth.config';

/**
 * Поддельный банк для тестов входа через Сбер ID и Т-Банк ID: локальный HTTP-сервер с ответами
 * токена и userinfo в формате банков. grant() — человек прошёл вход в банке, вернулся код.
 */

export const ORIGIN = 'https://xn--80aah6bno9a5a.xn--p1ai';
export const NONCE = 'n'.repeat(32);
export const VERIFIER = 'v'.repeat(43);
export const STATE = 's'.repeat(32);
export const CHALLENGE = 'c'.repeat(43);

export interface BankUser {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  phone_number?: string;
}

export interface FakeBank {
  config: OAuthConfig;
  /** Запросы к банку: путь, заголовки, тело. */
  seen: { path: string; headers: IncomingMessage['headers']; body: string }[];
  grant(user: BankUser, extra?: { nonce?: string; aud?: string }): string;
  /** Статус ответа токена (для имитации сбоя банка). */
  setTokenStatus(status: number): void;
  reset(): void;
  close(): Promise<void>;
}

function jwt(payload: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(payload)}.`;
}

export async function startFakeBank(): Promise<FakeBank> {
  const codes = new Map<string, { user: BankUser; nonce?: string; aud?: string }>();
  const tokens = new Map<string, BankUser>();
  const seen: FakeBank['seen'] = [];
  let tokenStatus = 200;

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const path = new URL(req.url ?? '/', 'http://bank').pathname;
      seen.push({ path, headers: req.headers, body });
      const form = new URLSearchParams(body);
      const send = (status: number, json?: object) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(json ? JSON.stringify(json) : '');
      };
      if (path.endsWith('/token')) {
        const grant = codes.get(form.get('code') ?? '');
        if (tokenStatus !== 200 || !grant) return send(tokenStatus === 200 ? 400 : tokenStatus);
        const accessToken = `at-${Math.random().toString(36).slice(2)}`;
        tokens.set(accessToken, grant.user);
        return send(200, {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: path.startsWith('/sber')
            ? jwt({
                sub: grant.user.sub,
                aud: grant.aud ?? 'sber-client',
                nonce: grant.nonce ?? NONCE,
              })
            : undefined,
        });
      }
      if (path.endsWith('/userinfo')) {
        const user = tokens.get((req.headers.authorization ?? '').replace('Bearer ', ''));
        return user ? send(200, user) : send(401);
      }
      if (path.endsWith('/completed')) return send(204);
      return send(404);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    seen,
    config: {
      redirectOrigin: ORIGIN,
      providers: [
        {
          id: 'sber',
          clientId: 'sber-client',
          clientSecret: 'sber-secret',
          authorizeUrl: 'https://id.sber.ru/CSAFront/oidc/authorize.do',
          tokenUrl: `${base}/sber/token`,
          userinfoUrl: `${base}/sber/userinfo`,
          completedUrl: `${base}/sber/completed`,
          scope: 'openid name email mobile',
        },
        {
          id: 'tbank',
          clientId: 'tbank-client',
          clientSecret: 'tbank-secret',
          authorizeUrl: 'https://id.tbank.ru/auth/authorize',
          tokenUrl: `${base}/tbank/token`,
          userinfoUrl: `${base}/tbank/userinfo`,
          scope: '',
        },
      ],
    },
    grant(user, extra = {}) {
      const code = `code-${Math.random().toString(36).slice(2)}`;
      codes.set(code, { user, ...extra });
      return code;
    },
    setTokenStatus(status) {
      tokenStatus = status;
    },
    reset() {
      codes.clear();
      tokens.clear();
      seen.length = 0;
      tokenStatus = 200;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
