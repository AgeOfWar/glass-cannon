import http from 'node:http';
import type {
  Handler,
  ListenOptions,
  Request,
  Response,
  RunningServer,
  Server,
} from '@glass-cannon/server';
import { Writable, Readable } from 'node:stream';
import type { ReadableStream, WritableStream } from 'node:stream/web';

export * from '@glass-cannon/server';

export class NodeServer implements Server {
  constructor(
    private handler: Handler,
    private errorHandler: (error: unknown) => Promise<Response> | Response = defaultErrorHandler
  ) {}

  async handle(request: Request): Promise<Response> {
    try {
      return await this.handler(request);
    } catch (error) {
      return await this.errorHandler(error);
    }
  }

  listen({ host = 'localhost', port = 0 }: ListenOptions): Promise<RunningServer> {
    return new Promise((resolve, reject) => {
      const server = http.createServer({ joinDuplicateHeaders: true }, (request, response) => {
        void (async () => {
          try {
            const req = this.toRequest(request);
            const res = await this.handler(req);
            await this.fromResponse(res, response);
          } catch (error) {
            const res = await this.errorHandler(error);
            await this.fromResponse(res, response);
          }
        })();
      });
      server.on('error', (error) => {
        reject(error);
      });
      server.on('listening', () => {
        const address = server.address();
        if (!address) return reject(new Error('Server address is not available'));
        if (typeof address === 'string') return reject(new Error('Socket address not supported'));
        const host = address.address;
        const port = address.port;
        const url =
          address.family === 'IPv6'
            ? new URL(`http://[${host}]:${port}`)
            : new URL(`http://${host}:${port}`);
        resolve({
          host,
          port,
          url,
          stop: () =>
            new Promise((resolve) => {
              server.close((error) => {
                if (error) return reject(error);
                resolve();
              });
            }),
        });
      });
      server.listen(port, host);
    });
  }

  private toRequest(request: http.IncomingMessage): Request {
    if (request.url === undefined || request.method === undefined) {
      throw new Error('Request URL is missing');
    }
    return {
      path: request.url,
      method: request.method,
      headers: new Headers(request.headers as HeadersInit),
      body: Readable.toWeb(request) as ReadableStream<Uint8Array>,
    };
  }

  private async fromResponse(
    response: Response,
    serverResponse: http.ServerResponse
  ): Promise<void> {
    serverResponse.writeHead(response.status, undefined, response.headers?.toJSON());
    const writable = Writable.toWeb(serverResponse) as WritableStream<Uint8Array>;
    await response.body?.(writable);
    serverResponse.end();
  }
}

export function defaultErrorHandler(error: unknown): Response {
  console.error(error);
  return {
    status: 500,
    headers: new Headers(),
  };
}
