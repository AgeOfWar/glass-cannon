import type { Handler, Request, Response } from '@glass-cannon/server';
import { applyMiddleware, noop, pipe, type Middleware } from './middleware';

const ALL_METHODS = '*';

type StringWithSuggestions<T> = T | (string & {});

export type RouteHandler<Context = unknown> = (
  request: RouteContext<Context>
) => Promise<Response> | Response;

export type RouteContext<Context = unknown> = Request & {
  params: Record<string, string>;
  route: Route;
} & Context;

export interface Route {
  method?: string;
  path: string;
  handler: RouteHandler;
}

export interface RouterGroup<Context = unknown> {
  route<NewContext>(options: RouteOptions<Context, NewContext>): Route;
  group<NewContext>(options: GroupOptions<NewContext>): RouterGroup<Context & NewContext>;
}

export interface RouterOptions<Context = unknown> {
  fallback?: Handler;
  middleware?: Middleware<Context>;
}

export interface RouteOptions<Context = unknown, NewContext = unknown> {
  method?: StringWithSuggestions<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'>;
  path: string;
  middleware?: Middleware<NewContext>;
  handler: RouteHandler<Context & NewContext>;
}

export interface GroupOptions<Context = unknown> {
  prefix?: string;
  middleware?: Middleware<Context>;
}

interface RouteWithMetadata {
  route: Route;
  regex: string;
  score: number;
  capturingRegex: RegExp;
}

export class Router<Context = unknown> implements RouterGroup<Context> {
  private readonly fallback: Handler;
  private readonly middleware: Middleware<Context>;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private routes: Record<string, [RouteWithMetadata[], RegExp | undefined]> = Object.create(null);

  constructor(options?: RouterOptions<Context>) {
    this.fallback = options?.fallback ?? (() => ({ status: 404 }));
    this.middleware = options?.middleware ?? (noop as Middleware<Context>);
  }

  matchingRoute(method: string, path: string): Route | undefined {
    return this.matchingRouteWithMetadata(method, path)?.route;
  }

  handle: Handler = async (request) => {
    const path = request.url.pathname;
    const routeWithMetadata = this.matchingRouteWithMetadata(request.method, path);

    if (!routeWithMetadata) return await this.fallback(request);

    const { route, capturingRegex } = routeWithMetadata;

    const params = { ...capturingRegex.exec(path)!.groups };
    const context = { ...request, params, route };
    return await route.handler(context);
  };

  route<NewContext>(route: RouteOptions<Context, NewContext>): Route {
    const handler: RouteHandler = route.middleware
      ? applyMiddleware(this.middleware, applyMiddleware(route.middleware, route.handler))
      : applyMiddleware(this.middleware, route.handler as RouteHandler<Context>);
    const path = route.path.endsWith('/') ? route.path.slice(0, -1) : route.path;
    const metadata = this.computeMetadata({ method: route.method, path, handler });
    const method = route.method?.toUpperCase() ?? ALL_METHODS;
    this.routes[method] ??= [[], undefined];
    binaryInsert(this.routes[method][0], metadata, (route) => route.score);
    this.routes[method][1] = undefined;
    return metadata.route;
  }

  group<NewContext>(options: GroupOptions<NewContext>): RouterGroup<Context & NewContext> {
    const prefix = options.prefix?.endsWith('/')
      ? options.prefix.slice(0, -1)
      : (options.prefix ?? '');
    return {
      route: <NewerContext>(route: RouteOptions<Context & NewContext, NewerContext>) => {
        const path = `${prefix}${route.path}`;
        const middlewares: Middleware<NewContext | NewerContext>[] = [];
        if (options.middleware) middlewares.push(options.middleware);
        if (route.middleware) middlewares.push(route.middleware);
        const middleware = pipe(...middlewares) as Middleware<NewContext & NewerContext>;
        return this.route({ ...route, path, middleware });
      },
      group: <NewerContext>(group: GroupOptions<NewerContext>) => {
        const newPrefix = `${prefix}${group.prefix}`;
        const middlewares: Middleware<NewContext | NewerContext>[] = [];
        if (options.middleware) middlewares.push(options.middleware);
        if (group.middleware) middlewares.push(group.middleware);
        const middleware = pipe(...middlewares) as Middleware<NewContext & NewerContext>;
        return this.group({ prefix: newPrefix, middleware });
      },
    };
  }

  private matchingRouteWithMetadata(method: string, path: string): RouteWithMetadata | undefined {
    const routes = this.routes[method];
    if (!routes) return this.matchingGeneralRouteWithMetadata(path);

    routes[1] ??= this.compileRegex(method);
    const match = routes[1].exec(path);

    if (!match) return this.matchingGeneralRouteWithMetadata(path);

    const matchIndex = match.findLastIndex(Boolean) - 1;
    return routes[0][matchIndex];
  }

  private matchingGeneralRouteWithMetadata(path: string): RouteWithMetadata | undefined {
    const routes = this.routes[ALL_METHODS];
    if (!routes) return;

    routes[1] ??= this.compileRegex(ALL_METHODS);
    const match = routes[1].exec(path);

    if (!match) return;

    const matchIndex = match.findLastIndex(Boolean) - 1;
    return routes[0][matchIndex];
  }

  private computeMetadata(route: Route): RouteWithMetadata {
    const score = this.computeScore(route.path);
    const regex = this.pathToRegex(route.path);
    const capturingRegex = new RegExp(this.pathToCapturingRegex(route.path));

    return { route, regex, score, capturingRegex };
  }

  private computeScore(path: string): number {
    let score = 0;
    for (const c of path) {
      if (c === '/') {
        score += 2;
      } else if (c === ':') {
        score -= 1;
      } else if (c === '*') {
        score -= 2;
      }
    }
    return score;
  }

  private pathToRegex(path: string): string {
    return (
      '^(' +
      path
        .replace(/([.+?^=!:${}()[\]|/\\])/g, '\\$1')
        .replace(/\\:([a-zA-Z0-9_]+)\*/g, '(?:.*)')
        .replace(/\\\*/g, '(?:.*)')
        .replace(/\\:([a-zA-Z0-9_]+)/g, '(?:[^/]+)') +
      '/?)$'
    );
  }

  private pathToCapturingRegex(path: string): string {
    return (
      '^' +
      path
        .replace(/([.+?^=!:${}()[\]|/\\])/g, '\\$1')
        .replace(/\\:([a-zA-Z0-9_]+)\*/g, '(?<$1>.*)')
        .replace(/\\\*/g, '(?:.*)')
        .replace(/\\:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)') +
      '/?$'
    );
  }

  private compileRegex(method: string): RegExp {
    const regex = this.routes[method]![0].map((route) => route.regex).join('|');
    return new RegExp(regex);
  }
}

function binaryInsert<T>(array: T[], value: T, score: (route: T) => number): number {
  let low = 0;
  let high = array.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (score(value) < score(array[mid]!)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  array.splice(low, 0, value);
  return low;
}
