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

interface BuilderSegment {
  plugins: Plugin[];
  node: RouteNode;
}

export class NodeBuilder<Requires = unknown, Provides = unknown> {
  private segments: BuilderSegment[] = [{ plugins: [], node: { children: {}, methods: {} } }];

  route<HandlerRequires = unknown, RouteProvides = unknown, MiddlewareRequires = unknown>({
    method,
    path,
    middleware: routeMiddleware,
    handler,
  }: RouteOptions<
    HandlerRequires,
    RouteProvides,
    MiddlewareRequires,
    Requires & Provides
  >): NodeBuilder<
    MergeRequires<
      Provides,
      Requires,
      MergeRequires<RouteProvides, MiddlewareRequires, HandlerRequires>
    >,
    Provides
  > {
    method ??= ALL_METHODS;
    const target = this.getOrCreateNode(this.currentNode(), path);
    target.methods[method] = routeMiddleware
      ? wrapHandler(routeMiddleware as Middleware, handler as RouteHandler)
      : (handler as RouteHandler);
    return this as unknown as NodeBuilder<
      MergeRequires<
        Provides,
        Requires,
        MergeRequires<RouteProvides, MiddlewareRequires, HandlerRequires>
      >,
      Provides
    >;
  }

  group<
    GroupProvides = unknown,
    MiddlewareRequires = unknown,
    NodeRequires = unknown,
    NodeProvides = unknown,
  >(
    { prefix, middleware: groupMiddleware }: GroupOptions<GroupProvides, MiddlewareRequires>,
    node: NodeBuilder<NodeRequires, NodeProvides>
  ): NodeBuilder<
    MergeRequires<
      Provides,
      Requires,
      MergeRequires<GroupProvides, MiddlewareRequires, NodeRequires>
    >,
    Provides
  > {
    const built = cloneNode(node.build() as RouteNode);
    if (groupMiddleware) {
      built.middleware = built.middleware
        ? pipe(groupMiddleware as Middleware, built.middleware)
        : (groupMiddleware as Middleware);
    }
    flushMiddleware(built);
    const target = this.getOrCreateNode(this.currentNode(), prefix);
    this.merge(target, built);
    return this as unknown as NodeBuilder<
      MergeRequires<
        Provides,
        Requires,
        MergeRequires<GroupProvides, MiddlewareRequires, NodeRequires>
      >,
      Provides
    >;
  }

  use<NodeRequires = unknown, NodeProvides = unknown>(
    node: NodeBuilder<NodeRequires, NodeProvides>
  ): NodeBuilder<MergeRequires<Provides, Requires, NodeRequires>, Provides> {
    const built = cloneNode(node.build() as RouteNode);
    flushMiddleware(built);
    this.merge(this.currentNode(), built);
    return this as unknown as NodeBuilder<
      MergeRequires<Provides, Requires, NodeRequires>,
      Provides
    >;
  }

  apply<PluginProvides = unknown, PluginRequires = unknown>(
    plugin: Plugin<PluginProvides, PluginRequires>
  ): NodeBuilder<
    MergeRequires<Provides, Requires, PluginRequires>,
    Provides & PluginProvides
  >;
  apply(plugin: Plugin | undefined | null): NodeBuilder<Requires, Provides>;
  apply<PluginProvides = unknown, PluginRequires = unknown>(
    plugin: Plugin<PluginProvides, PluginRequires> | undefined | null
  ): NodeBuilder<
    MergeRequires<Provides, Requires, PluginRequires>,
    Provides & PluginProvides
  > {
    if (plugin) {
      const current = this.currentSegment();
      if (isNodeEmpty(current.node)) {
        current.plugins.push(plugin as unknown as Plugin);
      } else {
        this.segments.push({
          plugins: [plugin as unknown as Plugin],
          node: { children: {}, methods: {} },
        });
      }
    }
    return this as unknown as NodeBuilder<
      MergeRequires<Provides, Requires, PluginRequires>,
      Provides & PluginProvides
    >;
  }

  build(): RouteNode<Requires> {
    let acc: RouteNode = { children: {}, methods: {} };
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i]!;
      const current = cloneNode(segment.node);
      flushMiddleware(acc);
      this.merge(current, acc);
      let transformed = current;
      for (let j = segment.plugins.length - 1; j >= 0; j--) {
        transformed = segment.plugins[j]!(transformed);
      }
      acc = transformed;
    }
    return acc as RouteNode<Requires>;
  }

  private currentSegment(): BuilderSegment {
    return this.segments[this.segments.length - 1]!;
  }

  private currentNode(): RouteNode {
    return this.currentSegment().node;
  }

  private getOrCreateNode(root: RouteNode, path?: string): RouteNode {
    const segments = path?.split('/').filter(Boolean) ?? [];
    let current = root;
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

function isNodeEmpty(node: RouteNode): boolean {
  return (
    Object.keys(node.methods).length === 0 &&
    Object.keys(node.children).length === 0 &&
    node.middleware === undefined
  );
}

function cloneNode(node: RouteNode): RouteNode {
  const children: Record<string, RouteNode> = {};
  for (const [segment, child] of Object.entries(node.children)) {
    children[segment] = cloneNode(child);
  }
  return {
    children,
    methods: { ...node.methods },
    ...(node.middleware ? { middleware: node.middleware } : {}),
  };
}

function wrapHandler(middleware: Middleware, handler: RouteHandler): RouteHandler {
  const wrapped = Object.assign(apply(middleware, handler), handler);
  if ('configure' in handler && typeof handler.configure === 'function') {
    (wrapped as unknown as { configure: (options: unknown) => RouteHandler }).configure = (
      options: unknown
    ) =>
      wrapHandler(
        middleware,
        (handler.configure as (options: unknown) => RouteHandler)(options)
      );
  }
  return wrapped;
}

function flushMiddleware(node: RouteNode, inherited?: Middleware): void {
  const middleware = inherited
    ? node.middleware
      ? pipe(inherited, node.middleware)
      : inherited
    : node.middleware;
  delete node.middleware;

  if (middleware) {
    for (const [method, handler] of Object.entries(node.methods)) {
      node.methods[method] = wrapHandler(middleware, handler);
    }
  }
  for (const child of Object.values(node.children)) {
    flushMiddleware(child, middleware);
  }
}

export function route<HandlerRequires = unknown, Provides = unknown, MiddlewareRequires = unknown>(
  options: RouteOptions<HandlerRequires, Provides, MiddlewareRequires>
): NodeBuilder<MergeRequires<Provides, MiddlewareRequires, HandlerRequires>> {
  const builder = new NodeBuilder();
  return builder.route(options) as unknown as NodeBuilder<
    MergeRequires<Provides, MiddlewareRequires, HandlerRequires>
  >;
}

export function routes<Requires = unknown>(): NodeBuilder<Requires> {
  return new NodeBuilder<Requires>();
}
