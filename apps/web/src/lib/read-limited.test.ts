import { describe, expect, it } from 'vitest';
import { readLimitedBody } from './read-limited';

/** Тело потоком без Content-Length (как chunked-запрос). */
function streamed(chunks: number[], onPull?: () => void): Request {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (i < chunks.length) controller.enqueue(new Uint8Array(chunks[i++]).fill(1));
      else controller.close();
    },
  });
  return new Request('http://localhost/x', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('readLimitedBody', () => {
  it('returns the whole body within the limit', async () => {
    const body = await readLimitedBody(streamed([3, 4]), 10);
    expect(body?.byteLength).toBe(7);
  });

  it('stops reading as soon as a chunked body without Content-Length exceeds the limit', async () => {
    let pulls = 0;
    const body = await readLimitedBody(
      streamed([6, 6, 6, 6, 6, 6], () => pulls++),
      10,
    );
    expect(body).toBeNull();
    // Прочитано два куска (12 байт > 10), остальные не запрашивались.
    expect(pulls).toBeLessThanOrEqual(3);
  });

  it('rejects by a declared Content-Length without reading', async () => {
    const request = new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-length': '999' },
      body: 'x',
    });
    expect(await readLimitedBody(request, 10)).toBeNull();
  });

  it('does not trust an understated Content-Length', async () => {
    const request = streamed([8, 8]);
    const lying = new Request(request, { headers: { 'content-length': '1' } });
    expect(await readLimitedBody(lying, 10)).toBeNull();
  });
});
