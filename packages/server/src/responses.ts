import type { Response } from './response';
import { writeJson, writeText } from './stream';

export function json({
  status,
  body,
  headers: customHeaders,
}: {
  status: number;
  body?: unknown;
  headers?: HeadersInit;
}): Response {
  const headers = new Headers(customHeaders);
  if (body === undefined) return { status, headers };
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return { status, headers, body: writeJson(body) };
}

export function text({
  status,
  body,
  headers: customHeaders,
}: {
  status: number;
  body?: string;
  headers?: HeadersInit;
}): Response {
  const headers = new Headers(customHeaders);
  if (body === undefined) return { status, headers };
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/plain');
  }
  return { status, headers, body: writeText(body) };
}

export function html({
  status,
  body,
  headers: customHeaders,
}: {
  status: number;
  body?: string;
  headers?: HeadersInit;
}): Response {
  const headers = new Headers(customHeaders);
  if (body === undefined) return { status, headers };
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/html');
  }
  return { status, headers, body: writeText(body) };
}
