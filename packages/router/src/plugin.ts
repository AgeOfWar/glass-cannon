import type { RouteNode } from './node';

export type Plugin<Requires = unknown, NextRequires = Requires> = (
  node: RouteNode<Requires>
) => RouteNode<NextRequires>;
