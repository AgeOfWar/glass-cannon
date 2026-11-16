import type { Handler } from '@glass-cannon/server';
import { apply, pipe, type Middleware } from './middleware';
import { ALL_METHODS, type RouteHandler, type RouteNode } from './node';
import type { NodeBuilder } from './nodeBuilder';

export interface RouterOptions {
  fallback?: Handler;
}

interface RouteWithMetadata {
  handler: RouteHandler;
  regex: string;
  score: number;
  capturingRegex: RegExp;
}

interface CompiledMethodRoutes {
  static: Record<string, RouteHandler>;
  dynamic?: {
    routes: RouteWithMetadata[];
    regex: RegExp;
  };
}

export class Router {
  private constructor(
    private readonly routes: Record<string, CompiledMethodRoutes>,
    private readonly fallback: Handler
  ) {}

  static from<Provides = unknown>(
    node: RouteNode | NodeBuilder<unknown, Provides>,
    options?: RouterOptions
  ): Router {
    const rootNode = 'build' in node ? node.build() : node;
    const routes = compileRouteNode(rootNode);
    const fallback = options?.fallback ?? (() => new Response(null, { status: 404 }));
    return new Router(routes, fallback);
  }

  handle: Handler = async (request) => {
    const url = new URL(request.url);
    const rawPath = url.pathname;
    const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const method = request.method.toUpperCase();

    const match = this.matchMethod(method, path) ?? this.matchMethod(ALL_METHODS, path);
    if (!match) return await this.fallback(request);

    return await match.handler({
      url,
      method,
      params: match.params,
      request,
    });
  };

  private matchMethod(
    method: string,
    path: string
  ): { handler: RouteHandler; params: Record<string, string> } | undefined {
    const methodRoutes = this.routes[method];
    if (!methodRoutes) return undefined;

    const staticHandler = methodRoutes.static[path];
    if (staticHandler) {
      return { handler: staticHandler, params: {} };
    }

    const dynamic = methodRoutes.dynamic;
    if (!dynamic) return undefined;

    const match = dynamic.regex.exec(path);
    if (!match) return undefined;

    const matchIndex = match.findLastIndex(Boolean) - 1;
    const route = dynamic.routes[matchIndex]!;
    const params = { ...route.capturingRegex.exec(path)?.groups };
    return { handler: route.handler, params };
  }
}

function compileRouteNode(root: RouteNode): Record<string, CompiledMethodRoutes> {
  const staticByMethod = Object.create(null) as Record<string, Record<string, RouteHandler>>;
  const dynamicByMethod = Object.create(null) as Record<string, RouteWithMetadata[]>;

  function visit(node: RouteNode, currentPath: string, inheritedMiddleware?: Middleware): void {
    const middleware = inheritedMiddleware
      ? node.middleware
        ? pipe(inheritedMiddleware, node.middleware)
        : inheritedMiddleware
      : node.middleware;

    const isDynamic = currentPath.includes(':') || currentPath.includes('*');

    for (const [rawMethod, rawHandler] of Object.entries(node.methods)) {
      const method = rawMethod.toUpperCase();
      const handler = middleware ? apply(middleware, rawHandler) : rawHandler;

      if (isDynamic) {
        dynamicByMethod[method] ??= [];
        const metadata = computeMetadata(currentPath, handler);
        binaryInsert(dynamicByMethod[method], metadata, (item) => item.score);
      } else {
        staticByMethod[method] ??= Object.create(null);
        staticByMethod[method]![currentPath || '/'] = handler;
      }
    }

    for (const [segment, child] of Object.entries(node.children)) {
      visit(child, `${currentPath}/${segment}`, middleware);
    }
  }

  visit(root, '');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const compiled: Record<string, CompiledMethodRoutes> = Object.create(null);
  const methods = new Set([...Object.keys(staticByMethod), ...Object.keys(dynamicByMethod)]);

  for (const method of methods) {
    const dynamicRoutes = dynamicByMethod[method];
    compiled[method] = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      static: staticByMethod[method] ?? Object.create(null),
      ...(dynamicRoutes && dynamicRoutes.length > 0
        ? {
            dynamic: {
              routes: dynamicRoutes,
              regex: new RegExp(dynamicRoutes.map((r) => r.regex).join('|')),
            },
          }
        : {}),
    };
  }

  return compiled;
}

function computeMetadata(path: string, handler: RouteHandler): RouteWithMetadata {
  const score = computeScore(path);
  const regex = pathToRegex(path);
  const capturingRegex = new RegExp(pathToCapturingRegex(path));
  return { handler, regex, score, capturingRegex };
}

function computeScore(path: string): number {
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

function pathToRegex(path: string): string {
  return (
    '^(' +
    path
      .replace(/([.+*?^=!:${}()[\]|/\\])/g, '\\$1')
      .replace(/\\:([a-zA-Z0-9_]+)\\\*/g, '(?:.*)')
      .replace(/\\\*/g, '(?:.*)')
      .replace(/\\:([a-zA-Z0-9_]+)/g, '(?:[^/]+)') +
    '/?)$'
  );
}

function pathToCapturingRegex(path: string): string {
  return (
    '^' +
    path
      .replace(/([.+*?^=!:${}()[\]|/\\])/g, '\\$1')
      .replace(/\\:([a-zA-Z0-9_]+)\\\*/g, '(?<$1>.*)')
      .replace(/\\\*/g, '(?:.*)')
      .replace(/\\:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)') +
    '/?$'
  );
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
