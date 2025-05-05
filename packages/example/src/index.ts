import { NodeServer } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';
import { jsonBody, noop, pipe } from '@glass-cannon/router/middleware';
import { typebox } from '@glass-cannon/typebox';
import { Type } from '@sinclair/typebox';

const log = noop;
const authenticate = noop;

const router = new Router();

const v1 = typebox(
  router.group({
    prefix: '/v1',
    middleware: jsonBody(),
  })
);

v1.route(
  v1.validated({
    method: 'GET',
    path: '/double',
    schema: {
      body: Type.Number(),
      response: {
        200: Type.Object({
          result: Type.Number(),
        }),
      },
    },
    middleware: pipe(log, authenticate),
    handler({ body }) {
      return { status: 200, body: { result: body * 2 } };
    },
  })
);

const server = new NodeServer(router.handle);
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url}`);
