import type { ReadableStream } from 'node:stream/web';

export type RequestBody = ReadableStream<Uint8Array>;

export interface Request {
  url: URL;
  method: string;
  headers: Headers;
  body: RequestBody;
}
