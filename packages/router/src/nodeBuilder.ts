import { apply, pipe, type MergeRequires, type Middleware } from './middleware';
import { ALL_METHODS, type RouteHandler, type RouteNode } from './node';
import type { Plugin } from './plugin';

export interface RouteOptions<
  HandlerRequires = unknown,
  Provides = unknown,
  MiddlewareRequires = unknown,
  ContextRequires = unknown,
> {
  method?: string;
  path: string;
  middleware?: Middleware<Provides, MiddlewareRequires>;
  handler: RouteHandler<NoInfer<Provides & MiddlewareRequires & ContextRequires> & HandlerRequires>;
}

export interface GroupOptions<Provides = unknown, MiddlewareRequires = unknown> {
  prefix?: string;
  middleware?: Middleware<Provides, MiddlewareRequires>;
}

export class NodeBuilder<Requires = unknown> {
  private root: RouteNode = { children: {}, methods: {} };

  route<HandlerRequires = unknown, Provides = unknown, MiddlewareRequires = unknown>({
    method,
    path,
    middleware: routeMiddleware,
    handler,
  }: RouteOptions<HandlerRequires, Provides, MiddlewareRequires, Requires>): NodeBuilder<
    Requires & MergeRequires<Provides, MiddlewareRequires, HandlerRequires>
  > {
    method ??= ALL_METHODS;
    const target = this.getOrCreateNode(path);
    target.methods[method] = routeMiddleware
      ? (apply(routeMiddleware, handler) as RouteHandler)
      : (handler as RouteHandler);
    return this as unknown as NodeBuilder<
      Requires & MergeRequires<Provides, MiddlewareRequires, HandlerRequires>
    >;
  }

  group<Provides = unknown, MiddlewareRequires = unknown, NodeRequires = unknown>(
    { prefix, middleware: groupMiddleware }: GroupOptions<Provides, MiddlewareRequires>,
    node: NodeBuilder<NodeRequires>
  ): NodeBuilder<Requires & MergeRequires<Provides, MiddlewareRequires, NodeRequires>> {
    const target = this.getOrCreateNode(prefix);
    if (groupMiddleware) {
      target.middleware = target.middleware
        ? pipe(target.middleware, groupMiddleware as Middleware)
        : (groupMiddleware as Middleware);
    }
    this.merge(target, node.build());
    return this as unknown as NodeBuilder<
      Requires & MergeRequires<Provides, MiddlewareRequires, NodeRequires>
    >;
  }

  use<NodeRequires = unknown>(
    node: NodeBuilder<NodeRequires>
  ): NodeBuilder<Requires & NodeRequires> {
    this.merge(this.root, node.build());
    return this as unknown as NodeBuilder<Requires & NodeRequires>;
  }

  apply<NextRequires = Requires>(
    plugin: Plugin<Requires, NextRequires>
  ): NodeBuilder<NextRequires> {
    this.root = plugin(this.root as RouteNode<Requires>) as RouteNode;
    return this as unknown as NodeBuilder<NextRequires>;
  }

  build(): RouteNode<Requires> {
    return this.root as RouteNode<Requires>;
  }

  private getOrCreateNode(path?: string): RouteNode {
    const segments = path?.split('/').filter(Boolean) ?? [];
    let current = this.root;
    for (const segment of segments) {
      current.children[segment] ??= { children: {}, methods: {} };
      current = current.children[segment];
    }
    return current;
  }

  private merge<NodeRequires>(target: RouteNode, source: RouteNode<NodeRequires>): void {
    if (source.middleware) {
      target.middleware = target.middleware
        ? pipe(target.middleware, source.middleware as Middleware)
        : (source.middleware as Middleware);
    }
    for (const [method, handler] of Object.entries(source.methods)) {
      target.methods[method] = handler as RouteHandler;
    }
    for (const [segment, child] of Object.entries(source.children)) {
      target.children[segment] ??= { children: {}, methods: {} };
      this.merge(target.children[segment], child);
    }
  }
}

export function route<HandlerRequires = unknown, Provides = unknown, MiddlewareRequires = unknown>(
  options: RouteOptions<HandlerRequires, Provides, MiddlewareRequires>
): NodeBuilder<MergeRequires<Provides, MiddlewareRequires, HandlerRequires>> {
  const builder = new NodeBuilder();
  return builder.route(options);
}

export function routes<Requires = unknown>(): NodeBuilder<Requires> {
  return new NodeBuilder<Requires>();
}
