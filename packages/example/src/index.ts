import { NodeServer } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';
import { noop, pipe } from '@glass-cannon/router/middleware';
import { typebox } from '@glass-cannon/typebox';
import { Type } from '@sinclair/typebox';

const log = noop;
const authenticate = noop;

const router = new Router();

const v1 = typebox(
  router.group({
    prefix: '/v1',
  })
);

v1.validatedRoute({
  method: 'GET',
  path: '/double',
  schema: {
    query: {
      x: Type.Number(),
    },
    response: {
      200: Type.Object({
        result: Type.Number(),
      }),
    },
  },
  middleware: pipe(log, authenticate),
  handler({ query }) {
    return { status: 200, body: { result: query.x * 2 } };
  },
});

const server = new NodeServer(router.handle);
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url}`);
