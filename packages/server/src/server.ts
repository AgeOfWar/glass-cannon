import type { Request } from './request';
import type { Response } from './response';

export interface ListenOptions {
  host?: string;
  port: number;
}

export interface Server {
  listen(options: ListenOptions): Promise<RunningServer>;
  handle(req: Request): Promise<Response> | Response;
}

export interface RunningServer {
  host: string;
  port: number;
  url: URL;
  stop(): Promise<void>;
}

export type Handler = (request: Request) => Promise<Response> | Response;
