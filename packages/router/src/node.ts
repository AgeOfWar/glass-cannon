import type { Middleware } from './middleware';

export interface RouteContext {
  url: URL;
  method: string;
  params: Record<string, string>;
  request: Request;
  route: {
    method: string;
    path: string;
  };
}

export type RouteHandler<Requires = unknown> = (
  context: RouteContext & Requires
) => Promise<Response> | Response;

export interface RouteNode<Requires = unknown> {
  children: Record<string, RouteNode>;
  methods: Record<string, RouteHandler<Requires>>;
  middleware?: Middleware<unknown, Requires>;
}

export const ALL_METHODS = '*';
