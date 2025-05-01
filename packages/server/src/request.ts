import type { ReadableStream } from 'node:stream/web';

export type RequestBody = ReadableStream<Uint8Array>;

export interface Request {
  path: string;
  method: string;
  headers: Headers;
  body: RequestBody;
}
