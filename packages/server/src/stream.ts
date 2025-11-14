import type { RequestBody } from './request';
import type { ResponseBody } from './response';

export function writeText(text: string): ResponseBody {
  return async (stream) => {
    const writer = stream.getWriter();
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(text));
    writer.releaseLock();
  };
}

export function writeJson(json: unknown): ResponseBody {
  if (json === undefined) return async () => {};
  return writeText(JSON.stringify(json));
}

export async function readText(
  body: RequestBody,
  encoding: BufferEncoding = 'utf-8'
): Promise<string> {
  const buffer = await new Response(body as unknown as ReadableStream).arrayBuffer();
  const decoder = new TextDecoder(encoding);
  return decoder.decode(buffer);
}

export async function readJson(
  body: RequestBody,
  encoding: BufferEncoding = 'utf-8'
): Promise<unknown> {
  const text = await readText(body, encoding);
  return JSON.parse(text);
}
