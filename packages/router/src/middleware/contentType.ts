import { readJson, readText, type Response } from '@glass-cannon/server';
import type { Middleware } from '.';
import type { RouteContext } from '..';

export interface ContentTypeOptions {
  allowNoConent?: boolean;
  onInvalidContentType?: (context: RouteContext) => Promise<Response> | Response;
}

export function textBody(options?: ContentTypeOptions): Middleware<{ text: string }> {
  const allowNoContent = options?.allowNoConent ?? true;
  const onInvalidContentType = options?.onInvalidContentType ?? (() => ({ status: 415 }));

  return async (handler, context) => {
    const contentType = context.headers.get('Content-Type');
    if (!contentType) {
      if (allowNoContent) {
        return await handler({ text: '' });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentType.startsWith('text/plain')) return await onInvalidContentType(context);
    const charsetMatch = /charset=([^;]*)/i.exec(contentType);
    const encoding = (charsetMatch?.[1]?.trim().toLowerCase() ?? 'utf-8') as BufferEncoding;
    let text: string;
    try {
      text = await readText(context.body, encoding);
    } catch {
      return await onInvalidContentType(context);
    }
    return await handler({ text });
  };
}

export function jsonBody(options?: ContentTypeOptions): Middleware<{ json: unknown }> {
  const allowNoContent = options?.allowNoConent ?? true;
  const onInvalidContentType = options?.onInvalidContentType ?? (() => ({ status: 415 }));

  return async (handler, context) => {
    const contentType = context.headers.get('Content-Type');
    if (!contentType) {
      if (allowNoContent) {
        return await handler({ json: undefined });
      } else {
        return await onInvalidContentType(context);
      }
    }

    if (!contentType.startsWith('application/json')) return await onInvalidContentType(context);
    let json: unknown;
    try {
      json = await readJson(context.body, 'utf-8');
    } catch {
      return await onInvalidContentType(context);
    }
    return await handler({ json });
  };
}
