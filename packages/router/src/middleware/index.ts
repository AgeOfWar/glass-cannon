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
  return ((handler, request) => {
    return middlewares.reduceRight(
      (next, middleware) => (req) => middleware(next, req),
      handler
    )(request);
  }) as PipeMiddlewares<Middlewares>;
}

export const noop: Middleware = (handler, request) => {
  return handler(request);
};
