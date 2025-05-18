import { readJson, readText, type RequestBody, type Response } from '@glass-cannon/server';
import type { Middleware } from '.';
import type { RouteContext } from '..';

export interface ContentTypeOptions {
  allowNoContent?: boolean;
  onInvalidContentType?: (context: RouteContext) => Promise<Response> | Response;
}

export function contentType<T>({
  contentType,
  deserializeRequest,
  allowNoContent = true,
  onInvalidContentType = () => ({ status: 415 }),
}: {
  contentType: string;
  deserializeRequest: (body?: RequestBody) => Promise<T> | T;
} & ContentTypeOptions): Middleware<{ body: T }> {
  return async (next, context) => {
    const contentTypeHeader = context.headers.get('Content-Type');
    if (!contentTypeHeader) {
      if (allowNoContent) {
        const body = await deserializeRequest();
        return await next({ body });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentTypeHeader.startsWith(contentType)) return await onInvalidContentType(context);
    let body: T;
    try {
      body = await deserializeRequest(context.stream);
    } catch {
      return await onInvalidContentType(context);
    }
    return await next({ body });
  };
}

export function textBody(options?: ContentTypeOptions): Middleware<{ body: string }> {
  return contentType({
    contentType: 'text/plain',
    deserializeRequest: (body) => (body ? readText(body, 'utf-8') : ''),
    ...options,
  });
}

export function jsonBody(options?: ContentTypeOptions): Middleware<{ body: unknown }> {
  return contentType({
    contentType: 'application/json',
    deserializeRequest: (body) => body && readJson(body),
    ...options,
  });
}
