import type { GroupOptions, Route, RouteOptions, RouterGroup } from '@glass-cannon/router';
import { pipe, type Middleware } from '@glass-cannon/router/middleware';

export interface CorsOptions {
  allowOrigin: (origin: string) => boolean;
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}

export function cors<Context>(
  group: RouterGroup<Context>,
  options: CorsOptions
): CorsGroup<Context> {
  return new CorsGroup(group, options);
}

export class CorsGroup<Context = unknown> implements RouterGroup<Context> {
  private readonly allowOrigin: (origin: string) => boolean;
  private readonly allowMethods: string[];
  private readonly allowHeaders: string[];
  private readonly exposeHeaders: string[];
  private readonly allowCredentials: boolean;
  private readonly maxAge?: number;

  constructor(
    private readonly routerGroup: RouterGroup<Context>,
    options: CorsOptions
  ) {
    this.allowOrigin = options.allowOrigin;
    this.allowMethods = options.allowMethods ?? ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'];
    this.allowHeaders = options.allowHeaders ?? [];
    this.exposeHeaders = options.exposeHeaders ?? [];
    this.allowCredentials = options.allowCredentials ?? false;
    this.maxAge = options.maxAge;
  }

  route<NewContext>(options: RouteOptions<Context, NewContext>): Route {
    const middleware = options.middleware
      ? pipe(this.middleware, options.middleware)
      : (this.middleware as Middleware<NewContext>);
    this.routerGroup.route(this.preflight(options));
    return this.routerGroup.route({ ...options, middleware });
  }

  group<NewContext>(options: GroupOptions<NewContext>): CorsGroup<Context & NewContext> {
    const group = this.routerGroup.group(options);
    return new CorsGroup(group, {
      allowOrigin: this.allowOrigin,
      allowMethods: this.allowMethods,
      allowHeaders: this.allowHeaders,
      exposeHeaders: this.exposeHeaders,
      allowCredentials: this.allowCredentials,
      maxAge: this.maxAge,
    });
  }

  middleware: Middleware = async (next, context) => {
    let { status, body, headers } = await next(context);

    const origin = context.headers.get('Origin');
    if (origin && this.allowOrigin(origin)) {
      headers ??= new Headers();
      headers.append('Vary', 'Origin');
      if (!headers.has('Access-Control-Allow-Origin')) {
        headers.set('Access-Control-Allow-Origin', origin);
      }
      if (this.allowCredentials && !headers.has('Access-Control-Allow-Credentials')) {
        headers.set('Access-Control-Allow-Credentials', 'true');
      }
      if (this.exposeHeaders.length > 0 && !headers.has('Access-Control-Expose-Headers')) {
        headers.set('Access-Control-Expose-Headers', this.exposeHeaders.join(', '));
      }
    }

    return { status, body, headers };
  };

  preflight<NewContext>(options: RouteOptions<Context, NewContext>): RouteOptions<Context> {
    return {
      method: 'OPTIONS',
      path: options.path,
      handler: async (context) => {
        const origin = context.headers.get('Origin');

        if (!origin || !this.allowOrigin(origin)) return { status: 403 };

        const headers = new Headers();

        headers.append('Vary', 'Origin');

        if (!headers.has('Access-Control-Allow-Origin')) {
          headers.set('Access-Control-Allow-Origin', origin);
        }

        if (this.allowCredentials && !headers.has('Access-Control-Allow-Credentials')) {
          headers.set('Access-Control-Allow-Credentials', 'true');
        }

        if (this.exposeHeaders.length > 0 && !headers.has('Access-Control-Expose-Headers')) {
          headers.set('Access-Control-Expose-Headers', this.exposeHeaders.join(', '));
        }

        if (this.maxAge !== undefined && !headers.has('Access-Control-Max-Age')) {
          headers.set('Access-Control-Max-Age', this.maxAge.toString());
        }

        if (this.allowMethods.length > 0 && !headers.has('Access-Control-Allow-Methods')) {
          headers.set('Access-Control-Allow-Methods', this.allowMethods.join(', '));
        }

        if (this.allowHeaders.length > 0 && !headers.has('Access-Control-Allow-Headers')) {
          headers.set('Access-Control-Allow-Headers', this.allowHeaders.join(', '));
        }

        return { status: 204, headers };
      },
    };
  }
}
