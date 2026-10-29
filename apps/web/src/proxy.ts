import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, CSP_HEADER } from './lib/csp';

/** 16 случайных байт в base64: свой nonce на каждый ответ, угадать его заранее нельзя. */
function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * CSP с nonce (docs/SECURITY.md, раздел 3; независимый аудит, AUD-02). Политика уходит и в
 * ответ, и в заголовки запроса: из запроса Next.js берёт nonce и ставит его своим скриптам.
 */
export function proxy(request: NextRequest): NextResponse {
  const csp = buildCsp({ dev: process.env.NODE_ENV !== 'production', nonce: newNonce() });
  const headers = new Headers(request.headers);
  headers.set(CSP_HEADER, csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Страницы и Server Actions; статика, кадры пролёта, service worker и иконки — без CSP.
      source:
        '/((?!_next/static|_next/image|landing/|sw\\.js|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|csp-report).*)',
      // Предзагрузка ссылок не рендерит документ: nonce ей не нужен.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
