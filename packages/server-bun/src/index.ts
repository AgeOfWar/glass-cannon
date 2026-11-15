import type { Handler, ListenOptions, RunningServer, Server } from '@glass-cannon/server';

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
      fetch: (request) => this.handle(request),
    });
    return {
      host: server.hostname ?? host,
      port: server.port ?? port,
      url: server.url,
      stop: async () => server.stop(),
    };
  }
}

export function defaultErrorHandler(error: unknown): Response {
  console.error(error);
  return new Response(null, { status: 500 });
}
