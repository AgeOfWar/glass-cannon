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
  if (body === undefined) return new Response(null, { status, headers });
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(body), { status, headers });
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
  if (body === undefined) return new Response(null, { status, headers });
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/plain');
  }
  return new Response(body, { status, headers });
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
  if (body === undefined) return new Response(null, { status, headers });
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/html');
  }
  return new Response(body, { status, headers });
}
