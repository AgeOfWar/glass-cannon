import type { Plugin, RouteHandler, RouteNode } from '@glass-cannon/router';
import { middleware, pipe } from '@glass-cannon/router/middleware';

export interface CorsOptions {
  allowOrigin: (origin: string) => boolean;
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}

export function cors(options: CorsOptions): Plugin {
  const allowOrigin = options.allowOrigin;
  const allowMethods = options.allowMethods ?? ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'];
  const allowHeaders = options.allowHeaders ?? [];
  const exposeHeaders = options.exposeHeaders ?? [];
  const allowCredentials = options.allowCredentials ?? false;
  const maxAge = options.maxAge;

  const corsMiddleware = middleware(async (next, context) => {
    const response = await next(context);

    const origin = context.request.headers.get('Origin');
    if (origin && allowOrigin(origin)) {
      const headers = new Headers(response.headers);
      if (!varies(headers, 'Origin')) {
        headers.append('Vary', 'Origin');
      }
      if (!headers.has('Access-Control-Allow-Origin')) {
        headers.set('Access-Control-Allow-Origin', origin);
      }
      if (allowCredentials && !headers.has('Access-Control-Allow-Credentials')) {
        headers.set('Access-Control-Allow-Credentials', 'true');
      }
      if (exposeHeaders.length > 0 && !headers.has('Access-Control-Expose-Headers')) {
        headers.set('Access-Control-Expose-Headers', exposeHeaders.join(', '));
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  });

  const preflightHandler: RouteHandler = (context) => {
    const origin = context.request.headers.get('Origin');
    if (!origin || !allowOrigin(origin)) {
      return new Response(null, { status: 403 });
    }

    const headers = new Headers();
    headers.append('Vary', 'Origin');
    headers.set('Access-Control-Allow-Origin', origin);

    if (allowCredentials) {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
    if (exposeHeaders.length > 0) {
      headers.set('Access-Control-Expose-Headers', exposeHeaders.join(', '));
    }
    if (maxAge !== undefined) {
      headers.set('Access-Control-Max-Age', maxAge.toString());
    }
    if (allowMethods.length > 0) {
      headers.set('Access-Control-Allow-Methods', allowMethods.join(', '));
    }
    if (allowHeaders.length > 0) {
      headers.set('Access-Control-Allow-Headers', allowHeaders.join(', '));
    }

    return new Response(null, { status: 204, headers });
  };

  function addPreflightRoutes(node: RouteNode): void {
    if (Object.keys(node.methods).length > 0 && !node.methods.OPTIONS) {
      node.methods.OPTIONS = preflightHandler;
    }
    for (const child of Object.values(node.children)) {
      addPreflightRoutes(child);
    }
  }

  return (node: RouteNode): RouteNode => {
    node.middleware = node.middleware ? pipe(corsMiddleware, node.middleware) : corsMiddleware;
    addPreflightRoutes(node);
    return node;
  };
}

function varies(headers: Headers, name: string): boolean {
  const vary = headers.get('Vary')?.toLowerCase().split(',') ?? [];
  return vary.some((value) => value.trim() === name.toLowerCase());
}
