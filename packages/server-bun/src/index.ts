import type {
  Handler,
  ListenOptions,
  Request,
  Response,
  RunningServer,
  Server,
} from '@glass-cannon/server';
import type { WritableStream } from 'node:stream/web';
import { ReadableStream } from 'node:stream/web';

export * from '@glass-cannon/server';

export class BunServer implements Server {
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

  async listen({ host = 'localhost', port = 0 }: ListenOptions): Promise<RunningServer> {
    const server = Bun.serve({
      hostname: host,
      port: port,
      fetch: async (request) => {
        const req = this.toRequest(request);
        const res = await this.handler(req);
        return await this.fromResponse(res);
      },
    });
    return {
      host: server.hostname ?? host,
      port: server.port ?? port,
      url: server.url,
      stop: async () => server.stop(),
    };
  }

  private toRequest(request: globalThis.Request): Request {
    return {
      url: new URL(request.url),
      method: request.method,
      headers: new Headers(request.headers as HeadersInit),
      body: (request.body as ReadableStream<Uint8Array> | null) ?? this.emptyReadableStream(),
    };
  }

  private emptyReadableStream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  }

  private async fromResponse(response: Response): Promise<globalThis.Response> {
    if (response.body === undefined) {
      return new globalThis.Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }

    const { readable, writable } = new TransformStream<Uint8Array>();
    await response.body(writable as WritableStream<Uint8Array>);
    return new globalThis.Response(readable, {
      status: response.status,
      headers: response.headers,
    });
  }
}

export function defaultErrorHandler(error: unknown): Response {
  console.error(error);
  return {
    status: 500,
    headers: new Headers(),
  };
}
