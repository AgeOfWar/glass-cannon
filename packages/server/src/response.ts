import type { WritableStream } from 'stream/web';

export type ResponseBody = (stream: WritableStream<Uint8Array>) => Promise<void>;

export interface Response {
  status: number;
  headers?: Headers;
  body?: ResponseBody;
}
