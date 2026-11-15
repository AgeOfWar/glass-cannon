import { cors } from '@glass-cannon/cors';
import { route, Router, routes } from '@glass-cannon/router';
import { middleware } from '@glass-cannon/router/middleware';
import { json } from '@glass-cannon/server';
import { BunServer } from '@glass-cannon/server-bun';
import { NodeServer } from '@glass-cannon/server-node';
import { openapi, schemaTransform, typebox, validated } from '@glass-cannon/typebox';
import { Type } from '@sinclair/typebox';

const logMiddleware = middleware(async (next, context) => {
  console.log(`${context.method} ${context.url.pathname}`);
  return await next(context);
});

const authMiddleware = middleware<{ userId: string }>(async (next, context) => {
  const token = context.request.headers.get('Authorization');
  if (!token) return new Response(null, { status: 401 });
  return await next({ ...context, userId: token });
});

const roleMiddleware = middleware<{ role: 'admin' | 'user' }>(async (next, context) => {
  const isAdmin = context.request.headers.get('X-Role') === 'admin';
  return await next({ ...context, role: isAdmin ? 'admin' : 'user' });
});

const usersRoutes = route<{ userId: string }>(
  validated({
    method: 'GET',
    path: '/me',
    schema: {
      summary: 'Get current user',
      response: {
        200: Type.Object({
          userId: Type.String(),
        }),
      },
    },
    handler({ userId }) {
      return { status: 200, body: { userId } };
    },
  })
)
  .route(
    validated({
      method: 'POST',
      path: '/',
      middleware: roleMiddleware,
      schema: {
        summary: 'Create user',
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
        }),
        response: {
          201: Type.Object({
            id: Type.String(),
            name: Type.String(),
            role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
            createdBy: Type.String(),
          }),
        },
      },
      handler({ body, role, userId }) {
        return {
          status: 201,
          body: {
            id: crypto.randomUUID(),
            name: body.name,
            role,
            createdBy: userId,
          },
        };
      },
    })
  )
  .apply(
    schemaTransform((schema) => ({
      ...schema,
      tags: [...(schema.tags ?? []), 'Users'],
    }))
  );

const v1Routes = route(
  validated({
    method: 'GET',
    path: '/double',
    schema: {
      summary: 'Double a number',
      query: {
        x: Type.Number(),
      },
      response: {
        200: Type.Object({
          result: Type.Number(),
        }),
      },
    },
    handler({ query }) {
      return { status: 200, body: { result: query.x * 2 } };
    },
  })
).group({ prefix: '/users', middleware: authMiddleware }, usersRoutes);

const api = routes()
  .group({ prefix: '/v1', middleware: logMiddleware }, v1Routes)
  .apply(
    typebox({
      onInvalidRequest: ({ errors }) => json({ status: 400, body: { errors } }),
    })
  );

const openApiSpec = openapi(api, {
  info: { title: 'Example API', version: '2.0.0' },
});

api
  .route({
    method: 'GET',
    path: '/openapi.json',
    handler: () => json({ status: 200, body: openApiSpec }),
  })
  .apply(
    cors({
      allowOrigin: () => true,
    })
  );

const router = Router.from(api);

const serverNode = new NodeServer(router.handle);
const runningServerNode = await serverNode.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Node Server is running on ${runningServerNode.url.href}`);

const serverBun = new BunServer(router.handle);
const runningServerBun = await serverBun.listen({ host: '127.0.0.1', port: 3001 });
console.log(`Bun Server is running on ${runningServerBun.url.href}`);
