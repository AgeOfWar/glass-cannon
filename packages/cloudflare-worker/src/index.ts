import type { Handler, RequestBody } from '@glass-cannon/server';
import type { WritableStream } from 'stream/web';

export * from '@glass-cannon/server';

export async function fetch(
  request: Request,
  ctx: ExecutionContext,
  handler: Handler
): Promise<Response> {
  const response = await handler({
    headers: request.headers,
    method: request.method,
    url: new URL(request.url),
    stream: (request.body ??
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      })) as RequestBody,
  });

  if (response.body === undefined) {
    return new Response(undefined, {
      status: response.status,
      headers: response.headers ?? {},
    });
  }

  const { readable, writable } = new TransformStream<Uint8Array>();
  ctx.waitUntil(response.body(writable as WritableStream<Uint8Array>).then(() => writable.close()));
  return new Response(readable, {
    status: response.status,
    headers: response.headers,
  });
}
