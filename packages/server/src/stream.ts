import type { RequestBody } from './request';
import type { ResponseBody } from './response';

export function writeText(text: string, encoding: BufferEncoding = 'utf-8'): ResponseBody {
  return async (stream) => {
    const writer = stream.getWriter();
    await writer.write(Buffer.from(text, encoding));
    writer.releaseLock();
  };
}

export function writeJson(json: unknown, encoding: BufferEncoding = 'utf-8'): ResponseBody {
  return writeText(JSON.stringify(json), encoding);
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
