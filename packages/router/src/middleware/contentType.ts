import { readJson, readText, type Response } from '@glass-cannon/server';
import type { Middleware } from '.';
import type { RouteContext } from '..';

export interface ContentTypeOptions {
  allowNoConent?: boolean;
  onInvalidContentType?: (context: RouteContext) => Promise<Response> | Response;
}

export function text(options?: ContentTypeOptions): Middleware<{ text: string }> {
  const allowNoContent = options?.allowNoConent ?? true;
  const onInvalidContentType = options?.onInvalidContentType ?? (() => ({ status: 415 }));

  return async (handler, context) => {
    const contentType = context.headers.get('Content-Type');
    if (!contentType) {
      if (allowNoContent) {
        return await handler({ ...context, text: '' });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentType.startsWith('text/plain')) return await onInvalidContentType(context);
    const charsetMatch = /charset=([^;]*)/i.exec(contentType);
    const encoding = (charsetMatch?.[1]?.trim().toLowerCase() ?? 'utf-8') as BufferEncoding;
    const text = await readText(context.body, encoding);
    return await handler({ ...context, text });
  };
}

export function json(options?: ContentTypeOptions): Middleware<{ json: unknown }> {
  const allowNoContent = options?.allowNoConent ?? true;
  const onInvalidContentType = options?.onInvalidContentType ?? (() => ({ status: 415 }));

  return async (handler, context) => {
    const contentType = context.headers.get('Content-Type');
    if (!contentType) {
      if (allowNoContent) {
        return await handler({ ...context, json: undefined });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentType.startsWith('application/json')) return await onInvalidContentType(context);
    const json = await readJson(context.body, 'utf-8');
    return await handler({ ...context, json });
  };
}
