import { readJson, readText, type Response } from '@glass-cannon/server';
import type { Middleware } from '.';
import type { RouteContext } from '..';

export interface ContentTypeOptions {
  allowNoConent?: boolean;
  onInvalidContentType?: (context: RouteContext) => Promise<Response> | Response;
}

export function textBody(options?: ContentTypeOptions): Middleware<{ body: string }> {
  const allowNoContent = options?.allowNoConent ?? true;
  const onInvalidContentType = options?.onInvalidContentType ?? (() => ({ status: 415 }));

  return async (handler, context) => {
    const contentType = context.headers.get('Content-Type');
    if (!contentType) {
      if (allowNoContent) {
        return await handler({ body: '' });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentType.startsWith('text/plain')) return await onInvalidContentType(context);
    const charsetMatch = /charset=([^;]*)/i.exec(contentType);
    const encoding = (charsetMatch?.[1]?.trim().toLowerCase() ?? 'utf-8') as BufferEncoding;
    let body: string;
    try {
      body = await readText(context.stream, encoding);
    } catch {
      return await onInvalidContentType(context);
    }
    return await handler({ body });
  };
}

export function jsonBody(options?: ContentTypeOptions): Middleware<{ body: unknown }> {
  const allowNoContent = options?.allowNoConent ?? true;
  const onInvalidContentType = options?.onInvalidContentType ?? (() => ({ status: 415 }));

  return async (handler, context) => {
    const contentType = context.headers.get('Content-Type');
    if (!contentType) {
      if (allowNoContent) {
        return await handler({ body: undefined });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentType.startsWith('application/json')) return await onInvalidContentType(context);
    let body: unknown;
    try {
      body = await readJson(context.stream, 'utf-8');
    } catch {
      return await onInvalidContentType(context);
    }
    return await handler({ body });
  };
}
