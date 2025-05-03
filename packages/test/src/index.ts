import { BunServer } from '@glass-cannon/server-bun';
import { Router } from '@glass-cannon/router';
import { pipe, type Middleware } from '@glass-cannon/router/middleware';
import * as contentType from '@glass-cannon/router/middleware/contentType';

//const middlewares = pipe(contentType.json());

export const authenticated: Middleware<{ accessToken: string }> = async (handler, request) => {
  const accessToken = request.headers.get('Authorization')?.split(' ')[1] ?? '';
  return await handler({ ...request, accessToken });
};

const router = new Router({
  fallback: (req) => {
    console.log(req);
    return { status: 404 };
  },
});

const group = router.group({ middleware: authenticated });

const group2 = group.group({
  middleware: pipe(contentType.json(), contentType.text()),
});

group2.route({
  method: 'GET',
  path: '/hello',
  handler: ({ params }) => {
    return { status: 200 };
  },
});

router.route({
  path: '/hello/:name',
  handler: ({ params }) => {
    return { status: 200 };
  },
});

const server = new BunServer(router.handle);
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url}`);
