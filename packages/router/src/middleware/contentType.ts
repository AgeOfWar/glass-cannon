import { middleware, type MiddlewareWrapper } from '.';
import type { RouteContext } from '..';

export interface ContentTypeOptions {
  allowNoContent?: boolean;
  onInvalidContentType?: (context: RouteContext) => Promise<Response> | Response;
}

export function contentType<T>({
  contentType,
  deserializeRequest,
  allowNoContent = true,
  onInvalidContentType = () => new Response(null, { status: 415 }),
}: {
  contentType: string;
  deserializeRequest: (request?: Request) => Promise<T> | T;
} & ContentTypeOptions): MiddlewareWrapper<{ body: T }> {
  return middleware(async (next, context) => {
    const contentTypeHeader = context.request.headers.get('Content-Type');
    if (!contentTypeHeader || !context.request.body) {
      if (allowNoContent) {
        const body = await deserializeRequest();
        return await next({ ...context, body });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentTypeHeader.startsWith(contentType)) return await onInvalidContentType(context);
    let body: T;
    try {
      body = await deserializeRequest(context.request);
    } catch {
      return await onInvalidContentType(context);
    }
    return await next({ ...context, body });
  });
}

export function textBody(options?: ContentTypeOptions): MiddlewareWrapper<{ body: string }> {
  return contentType({
    contentType: 'text/plain',
    deserializeRequest: (request) => (request ? request.text() : ''),
    ...options,
  });
}

export function jsonBody(options?: ContentTypeOptions): MiddlewareWrapper<{ body: unknown }> {
  return contentType({
    contentType: 'application/json',
    deserializeRequest: (request) => request?.json(),
    ...options,
  });
}
