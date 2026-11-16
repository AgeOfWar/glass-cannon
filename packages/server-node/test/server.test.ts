import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import os from 'node:os';
import { NodeServer, type Handler, type RunningServer } from '../src';

const hasIPv6 = Object.values(os.networkInterfaces()).some((addresses) =>
  addresses?.some((address) => address.address === '::1')
);

async function withServer(
  server: NodeServer,
  host: string,
  run: (running: RunningServer) => Promise<void>
): Promise<void> {
  const running = await server.listen({ host, port: 0 });
  try {
    await run(running);
  } finally {
    await running.stop();
  }
}

const echoUrl: Handler = (request) => new Response(request.url);

describe('NodeServer', () => {
  test('serves requests', async () => {
    const server = new NodeServer(
      async (request) =>
        new Response(`${request.method} ${await request.text()}`, {
          status: 201,
          headers: { 'X-Test': 'yes' },
        })
    );

    await withServer(server, '127.0.0.1', async ({ url }) => {
      const response = await fetch(url, { method: 'POST', body: 'hello' });

      expect(response.status).toBe(201);
      expect(response.headers.get('X-Test')).toBe('yes');
      expect(await response.text()).toBe('POST hello');
    });
  });

  test('builds the request url from the listening address', async () => {
    await withServer(new NodeServer(echoUrl), '127.0.0.1', async ({ url, port }) => {
      const response = await fetch(new URL('/users?page=2', url));

      expect(await response.text()).toBe(`http://127.0.0.1:${port}/users?page=2`);
    });
  });

  test.skipIf(!hasIPv6)('serves requests on IPv6 addresses', async () => {
    await withServer(new NodeServer(echoUrl), '::1', async ({ url, port }) => {
      const response = await fetch(new URL('/users', url));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(`http://[::1]:${port}/users`);
    });
  });

  test('uses the error handler when the handler throws', async () => {
    const server = new NodeServer(
      () => {
        throw new Error('boom');
      },
      (error) => new Response((error as Error).message, { status: 503 })
    );

    await withServer(server, '127.0.0.1', async ({ url }) => {
      const response = await fetch(url);

      expect(response.status).toBe(503);
      expect(await response.text()).toBe('boom');
    });
  });

  test('keeps serving after a client disconnects mid-response', async () => {
    const errors: unknown[] = [];
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    const server = new NodeServer(
      (request) => {
        if (new URL(request.url).pathname !== '/stream') return new Response('ok');
        return new Response(
          new ReadableStream({
            async pull(controller) {
              await new Promise((resolve) => setTimeout(resolve, 5));
              controller.enqueue(chunk);
            },
          })
        );
      },
      (error) => {
        errors.push(error);
        return new Response(null, { status: 500 });
      }
    );

    await withServer(server, '127.0.0.1', async ({ url, port }) => {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          socket.write('GET /stream HTTP/1.1\r\nHost: localhost\r\n\r\n');
        });
        socket.once('data', () => socket.destroy());
        socket.once('close', () => resolve());
        socket.once('error', reject);
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const response = await fetch(url);
      expect(await response.text()).toBe('ok');
      expect(errors).toEqual([]);
    });
  });

  test('rejects when stopping a server that is not running', async () => {
    const running = await new NodeServer(echoUrl).listen({ host: '127.0.0.1', port: 0 });
    await running.stop();

    expect(running.stop()).rejects.toThrow();
  });
});
