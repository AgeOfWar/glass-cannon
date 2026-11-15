import type { RouteNode } from './node';

export type Plugin<Provides = unknown, Requires = unknown> = (
  node: RouteNode<Provides & NoInfer<Requires>>
) => RouteNode<Requires>;
