import type { RouteContext, RouteHandler } from '..';

export * from './contentType';

export type MergeRequires<Provides, Requires, NextRequires> = Provides &
  Requires extends NextRequires
  ? Requires
  : Requires & Omit<NextRequires, keyof Provides>;

export type Middleware<Provides = unknown, Requires = unknown> = (
  next: RouteHandler<Provides & NoInfer<Requires>>,
  context: RouteContext & Requires
) => Promise<Response> | Response;

export interface MiddlewareWrapper<Provides = unknown, Requires = unknown>
  extends Middleware<Provides, Requires> {
  pipe<NextProvides, NextRequires = unknown>(
    other: Middleware<NextProvides, NextRequires>
  ): MiddlewareWrapper<Provides & NextProvides, MergeRequires<Provides, Requires, NextRequires>>;
}

export function apply<
  Provides = unknown,
  Requires = unknown,
  HandlerRequires = Provides & Requires,
>(
  fn: Middleware<Provides, Requires>,
  handler: RouteHandler<HandlerRequires>
): RouteHandler<MergeRequires<Provides, Requires, HandlerRequires>> {
  return (context) =>
    fn(
      handler as unknown as RouteHandler<Provides & Requires>,
      context as unknown as RouteContext & Requires
    );
}

export function pipe<
  Provides = unknown,
  Requires = unknown,
  NextProvides = unknown,
  NextRequires = unknown,
>(
  first: Middleware<Provides, Requires>,
  second: Middleware<NextProvides, NextRequires>
): MiddlewareWrapper<Provides & NextProvides, MergeRequires<Provides, Requires, NextRequires>> {
  return middleware((next, context) =>
    first(
      (nextContext) =>
        second(
          next as unknown as RouteHandler<NextProvides & NextRequires>,
          nextContext as unknown as RouteContext & NextRequires
        ),
      context as unknown as RouteContext & Requires
    )
  );
}

export function middleware<Provides = unknown, Requires = unknown>(
  fn: Middleware<Provides, Requires> | MiddlewareWrapper<Provides, Requires>
): MiddlewareWrapper<Provides, Requires> {
  if ('pipe' in fn) return fn;
  return Object.assign(fn, {
    pipe<NextProvides, NextRequires = unknown>(
      other: Middleware<NextProvides, NextRequires>
    ): MiddlewareWrapper<Provides & NextProvides, MergeRequires<Provides, Requires, NextRequires>> {
      return pipe(fn, other);
    },
  });
}
