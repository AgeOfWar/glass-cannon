import { describe, expect, test } from 'bun:test';
import { Router, routes } from '@glass-cannon/router';
import { cors, type CorsOptions } from '../src';

const allowed = 'https://www.example.com';

function createRouter(options?: Partial<CorsOptions>): Router {
  return Router.from(
    routes()
      .apply(cors({ allowOrigin: (origin) => origin === allowed, ...options }))
      .route({ method: 'GET', path: '/', handler: () => new Response('ok') })
      .route({
        method: 'GET',
        path: '/vary',
        handler: () => new Response('ok', { headers: { Vary: 'Accept-Encoding' } }),
      })
  );
}

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

describe('cors', () => {
  test('adds CORS headers for allowed origins', async () => {
    const router = createRouter({ allowCredentials: true, exposeHeaders: ['X-Total', 'X-Page'] });
    const response = await router.handle(request('/', { headers: { Origin: allowed } }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowed);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-Total, X-Page');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  test('keeps the Vary header set by the handler', async () => {
    const router = createRouter();
    const response = await router.handle(request('/vary', { headers: { Origin: allowed } }));

    expect(response.headers.get('Vary')).toBe('Accept-Encoding, Origin');
  });

  test('does not add CORS headers for other origins', async () => {
    const router = createRouter();
    const crossOrigin = await router.handle(
      request('/', { headers: { Origin: 'https://evil.example.com' } })
    );
    const sameOrigin = await router.handle(request('/'));

    for (const response of [crossOrigin, sameOrigin]) {
      expect(response.status).toBe(200);
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    }
  });

  test('answers preflight requests', async () => {
    const router = createRouter({ allowHeaders: ['Content-Type'], maxAge: 600 });
    const response = await router.handle(
      request('/', {
        method: 'OPTIONS',
        headers: { Origin: allowed, 'Access-Control-Request-Method': 'GET' },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowed);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, HEAD, PUT, POST, DELETE, PATCH'
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(response.headers.get('Access-Control-Max-Age')).toBe('600');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  test('rejects preflight requests from other origins', async () => {
    const router = createRouter();
    const response = await router.handle(
      request('/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } })
    );

    expect(response.status).toBe(403);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
