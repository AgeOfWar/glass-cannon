import type { Response } from '@glass-cannon/server';
import type { RouteContext, RouteHandler } from '..';

export * from './contentType';

export type Middleware<T = unknown> = (
  next: (context: T) => Promise<Response> | Response,
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
  return middlewares.reduce(pipeTwo, noop) as PipeMiddlewares<Middlewares>;
}

function pipeTwo<Context1, Context2>(
  middleware1: Middleware<Context1>,
  middleware2: Middleware<Context2>
): Middleware<Context1 & Context2> {
  return (next, context) => {
    return middleware1((newContext1) => {
      return middleware2((newContext2) => next({ ...newContext1, ...newContext2 }), {
        ...context,
        ...newContext1,
      });
    }, context);
  };
}

export function applyMiddleware<Context, NewContext>(
  middleware: Middleware<NewContext>,
  handler: RouteHandler<Context & NewContext>
): RouteHandler<Context> {
  return async (context) => {
    return await middleware(
      (newContext) => handler({ ...context, ...newContext } as RouteContext<Context & NewContext>),
      context as RouteContext
    );
  };
}

export const noop: Middleware = (next) => {
  return next({});
};
