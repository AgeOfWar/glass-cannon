import { json, NodeServer } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';
import { jsonBody, noop, pipe } from '@glass-cannon/router/middleware';

const log = noop;
const authenticate = noop;

const router = new Router();

const v1 = router.group({
  prefix: '/v1',
  middleware: jsonBody(),
});

v1.route({
  method: 'GET',
  path: '/double',
  middleware: pipe(log, authenticate),
  handler({ body }) {
    if (!body) return json({ status: 400, body: 'Missing body' });
    if (typeof body !== 'number') return json({ status: 400, body: 'Not a number' });
    return json({ status: 200, body: { result: body * 2 } });
  },
});

const server = new NodeServer(router.handle);
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url}`);
