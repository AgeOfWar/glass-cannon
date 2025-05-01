/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Handler, Request, Response } from '@glass-cannon/server';
import { pipe, type Middleware } from './middleware';

export type RouteHandler<Context> = (
  request: RouteContext & Context
) => Promise<Response> | Response;

export type RouteContext = Request & {
  params: Record<string, string>;
  route: Route<any>;
};

export interface Route<Context> {
  method?: string;
  path: string;
  handler: RouteHandler<Context>;
}

export interface RouterGroup<Context> {
  route(options: RouteOptions<Context>): void;
  group<NewContext>(options: GroupOptions<NewContext>): RouterGroup<Context & NewContext>;
}

export interface RouterOptions<Context = unknown> {
  fallback?: Handler;
  middleware?: Middleware<Context>;
}

export interface RouteOptions<Context> {
  method?: string;
  path: string;
  handler: RouteHandler<Context>;
}

export interface GroupOptions<Context> {
  prefix?: string;
  middleware: Middleware<Context>;
}

interface RouteWithMetadata<Context> {
  route: Route<Context>;
  regex: string;
  score: number;
  capturingRegex: RegExp;
}

export class Router<Context = unknown> implements RouterGroup<Context> {
  private readonly fallback: Handler;
  private readonly middleware: Middleware<Context>;

  private routes: RouteWithMetadata<Context>[] = [];
  private regex: RegExp | undefined;

  constructor(options?: RouterOptions<Context>) {
    this.fallback = options?.fallback ?? (() => ({ status: 404 }));
    this.middleware = options?.middleware ?? ((x): any => x);
  }

  matchingRoute(request: Pick<Request, 'method' | 'path'>): Route<Context> | undefined {
    return this.matchingRouteWithMetadata(request)?.route;
  }

  handle: Handler = async (request) => {
    const routeWithMetadata = this.matchingRouteWithMetadata(request);

    if (!routeWithMetadata) return await this.fallback(request);

    const { route, capturingRegex } = routeWithMetadata;

    const params = { ...capturingRegex.exec(request.path)!.groups };
    const context = { ...request, params, route };
    return await this.middleware(route.handler, context);
  };

  route(route: RouteOptions<Context>): void {
    const metadata = this.computeMetadata(route);
    binaryInsert(this.routes, metadata, (route) => route.score);
  }

  group<NewContext>(options: GroupOptions<NewContext>): RouterGroup<Context & NewContext> {
    return {
      route: (route) => {
        const path = options.prefix ? `${options.prefix}${route.path}` : route.path;
        const handler: RouteHandler<Context> = async (context) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          options.middleware(route.handler as any, context);
        this.route({ ...route, path, handler });
      },
      group: (group) => {
        const prefix = options.prefix ? `${options.prefix}${group.prefix}` : group.prefix;
        const middleware = pipe(options.middleware, group.middleware);
        return this.group({ prefix, middleware });
      },
    };
  }

  private matchingRouteWithMetadata(
    request: Pick<Request, 'method' | 'path'>
  ): RouteWithMetadata<Context> | undefined {
    this.regex ??= this.compileRegex();
    const match = this.regex.exec(request.path);

    if (!match) return;

    const matchIndex = match.findLastIndex(Boolean) - 1;
    return this.routes[matchIndex];
  }

  private computeMetadata(route: Route<Context>): RouteWithMetadata<Context> {
    const score = this.computeScore(route.path);
    const regex = this.pathToRegex(route.path);
    const capturingRegex = new RegExp(this.pathToCapturingRegex(route.path));

    return { route, regex, score, capturingRegex };
  }

  private computeScore(path: string): number {
    let score = 0;
    for (const c of path) {
      if (c === ':') {
        score += 1;
      } else if (c === '/') {
        score += 2;
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
      ')$'
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
      '$'
    );
  }

  private compileRegex(): RegExp {
    if (this.routes.length === 0) return new RegExp('$^');
    const regex = this.routes.map((route) => route.regex).join('|');
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
