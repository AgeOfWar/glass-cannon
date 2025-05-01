import type { Response } from '@glass-cannon/server';
import type { RouteContext, RouteHandler } from '..';

export type Middleware<T = unknown> = (
  handler: RouteHandler<T>,
  request: RouteContext
) => Promise<Response> | Response;

export type PipeMiddlewares<Middlewares extends Middleware[]> = Middlewares extends [
  infer First,
  ...infer Rest,
]
  ? First extends Middleware<infer FirstContext>
    ? Rest extends Middleware[]
      ? PipeMiddlewares<Rest> extends Middleware<infer RestContext>
        ? Middleware<FirstContext & RestContext>
        : never
      : never
    : never
  : Middleware;

export function pipe<Middlewares extends Middleware[]>(
  ...middlewares: Middlewares
): PipeMiddlewares<Middlewares> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((handler: any, request: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return middlewares.reduceRight((acc, middleware) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return middleware(acc, request);
    }, handler);
  }) as unknown as PipeMiddlewares<Middlewares>;
}

export const authenticated: Middleware<{ accessToken: string }> = async (handler, request) => {
  const accessToken = request.headers.get('Authorization')?.split(' ')[1];
  if (!accessToken) throw new Error('Unauthorized');
  return await handler({ ...request, accessToken });
};
