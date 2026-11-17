import { describe, expect, test } from 'bun:test';
import { route, Router, routes, type RouteHandler } from '../src';
import { middleware } from '../src/middleware';

const respondWith =
  (name: string): RouteHandler =>
  ({ params }) =>
    Response.json({ name, params });

async function get(router: Router, path: string, method = 'GET'): Promise<unknown> {
  const response = await router.handle(new Request(`http://localhost${path}`, { method }));
  return response.status === 200 ? await response.json() : response.status;
}

describe('Router', () => {
  test('matches static routes and falls back to 404', async () => {
    const router = Router.from(
      routes()
        .route({ method: 'GET', path: '/', handler: respondWith('root') })
        .route({ method: 'GET', path: '/users', handler: respondWith('users') })
    );

    expect(await get(router, '/')).toEqual({ name: 'root', params: {} });
    expect(await get(router, '/users')).toEqual({ name: 'users', params: {} });
    expect(await get(router, '/users/')).toEqual({ name: 'users', params: {} });
    expect(await get(router, '/missing')).toBe(404);
    expect(await get(router, '/users', 'POST')).toBe(404);
  });

  test('uses the provided fallback', async () => {
    const router = Router.from(route({ method: 'GET', path: '/', handler: respondWith('root') }), {
      fallback: () => new Response(null, { status: 418 }),
    });

    expect(await get(router, '/missing')).toBe(418);
  });

  test('falls back to routes registered without a method', async () => {
    const router = Router.from(
      routes()
        .route({ path: '/users', handler: respondWith('any') })
        .route({ method: 'POST', path: '/users', handler: respondWith('post') })
    );

    expect(await get(router, '/users', 'POST')).toEqual({ name: 'post', params: {} });
    expect(await get(router, '/users', 'DELETE')).toEqual({ name: 'any', params: {} });
  });

  test('extracts named parameters', async () => {
    const router = Router.from(
      route({ method: 'GET', path: '/users/:userId/posts/:postId', handler: respondWith('post') })
    );

    expect(await get(router, '/users/1/posts/2')).toEqual({
      name: 'post',
      params: { userId: '1', postId: '2' },
    });
    expect(await get(router, '/users/1/posts/2/')).toEqual({
      name: 'post',
      params: { userId: '1', postId: '2' },
    });
    expect(await get(router, '/users/1/posts')).toBe(404);
  });

  test('matches wildcards', async () => {
    const router = Router.from(
      routes()
        .route({ method: 'GET', path: '/files/*', handler: respondWith('files') })
        .route({ method: 'GET', path: '/assets/:path*', handler: respondWith('assets') })
    );

    expect(await get(router, '/files/a.txt')).toEqual({ name: 'files', params: {} });
    expect(await get(router, '/files/a/b.txt')).toEqual({ name: 'files', params: {} });
    expect(await get(router, '/assets/a/b.css')).toEqual({
      name: 'assets',
      params: { path: 'a/b.css' },
    });
    expect(await get(router, '/other/a.txt')).toBe(404);
  });

  test('prefers the most specific route', async () => {
    const router = Router.from(
      routes()
        .route({ method: 'GET', path: '/users/*', handler: respondWith('wildcard') })
        .route({ method: 'GET', path: '/users/:id', handler: respondWith('param') })
        .route({ method: 'GET', path: '/users/me', handler: respondWith('static') })
    );

    expect(await get(router, '/users/me')).toEqual({ name: 'static', params: {} });
    expect(await get(router, '/users/1')).toEqual({ name: 'param', params: { id: '1' } });
    expect(await get(router, '/users/1/posts')).toEqual({ name: 'wildcard', params: {} });
  });

  test('escapes special characters in paths', async () => {
    const router = Router.from(
      route({ method: 'GET', path: '/files/:name.json', handler: respondWith('json') })
    );

    expect(await get(router, '/files/a.json')).toEqual({ name: 'json', params: { name: 'a' } });
    expect(await get(router, '/files/axjson')).toBe(404);
  });

  test('applies group prefixes and middleware', async () => {
    const calls: string[] = [];
    const log = (name: string): ReturnType<typeof middleware> =>
      middleware(async (next, context) => {
        calls.push(name);
        return await next(context);
      });
    const auth = middleware<{ userId: string }>(async (next, context) => {
      const userId = context.request.headers.get('Authorization');
      if (!userId) return new Response(null, { status: 401 });
      return await next({ ...context, userId });
    });

    const users = routes<{ userId: string }>().route({
      method: 'GET',
      path: '/me',
      middleware: log('route'),
      handler: ({ userId }) => Response.json({ userId }),
    });
    const router = Router.from(
      routes({ middleware: log('root') })
        .route({ method: 'GET', path: '/public', handler: respondWith('public') })
        .group({ prefix: '/users', middleware: log('group').pipe(auth) }, users)
    );

    expect(await get(router, '/users/me')).toBe(401);
    expect(calls).toEqual(['root', 'group']);

    calls.length = 0;
    const response = await router.handle(
      new Request('http://localhost/users/me', { headers: { Authorization: 'alice' } })
    );
    expect(await response.json()).toEqual({ userId: 'alice' });
    expect(calls).toEqual(['root', 'group', 'route']);

    calls.length = 0;
    expect(await get(router, '/public')).toEqual({ name: 'public', params: {} });
    expect(calls).toEqual(['root']);
  });
});
