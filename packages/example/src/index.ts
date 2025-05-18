import { NodeServer } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';
import { noop, pipe } from '@glass-cannon/router/middleware';
import { typebox } from '@glass-cannon/typebox';
import { Type } from '@sinclair/typebox';
import { BunServer } from '@glass-cannon/server-bun';

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

const serverNode = new NodeServer(router.handle);
const runningServerNode = await serverNode.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Node Server is running on ${runningServerNode.url}`);

const serverBun = new BunServer(router.handle);
const runningServerBun = await serverBun.listen({ host: '127.0.0.1', port: 3001 });
console.log(`Bun Server is running on ${runningServerBun.url}`);
