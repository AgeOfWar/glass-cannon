import { NodeServer } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';
import { authenticated, pipe } from '@glass-cannon/router/middleware';
import contentType from '@glass-cannon/router/middleware/contentType';

//const middlewares = pipe(contentType.json());

const router = new Router();

const group = router.group({ middleware: authenticated });

const group2 = group.group({
  prefix: '/v1',
  middleware: pipe(contentType.json(), contentType.text()),
});

group2.route({
  path: '/hello',
  handler: ({ params }) => {
    console.log('/hello', params);
    return { status: 200 };
  },
});

router.route({
  path: '/hello/:name',
  handler: ({ params }) => {
    console.log(params);
    return { status: 200 };
  },
});

const server = new NodeServer(router.handle);
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url}`);
