import {
  type GroupOptions,
  type RouteContext,
  type RouteOptions,
  type RouterGroup,
} from '@glass-cannon/router';
import { contentType, pipe, type Middleware } from '@glass-cannon/router/middleware';
import { readJson, writeJson } from '@glass-cannon/server';
import type { Response as RawResponse, RequestBody, ResponseBody } from '@glass-cannon/server';
import { type StaticDecode, type TSchema } from '@sinclair/typebox';
import { TypeCompiler, type ValueError } from '@sinclair/typebox/compiler';

export interface RouteSchema {
  body?: TSchema;
  query?: TSchema;
  params?: TSchema;
  response: Record<number, TSchema>;
}

export interface ValidatedContext<Schema extends RouteSchema> {
  body: Schema['body'] extends TSchema ? StaticDecode<Schema['body']> : undefined;
  query: Schema['query'] extends TSchema ? StaticDecode<Schema['query']> : Record<string, never>;
  params: Schema['params'] extends TSchema ? StaticDecode<Schema['params']> : Record<string, never>;
}

export type Response<StatusCode extends number, T> = undefined extends T
  ? {
      status: StatusCode;
      body?: T;
      headers?: HeadersInit;
    }
  : {
      status: StatusCode;
      body: T;
      headers?: HeadersInit;
    };

type AsNumber<T> = T extends number ? T : T extends `${infer N extends number}` ? N : never;
export type ValidatedResponse<Schema extends RouteSchema = RouteSchema> = {
  [K in keyof Schema['response']]: Schema['response'][K] extends TSchema
    ? Response<AsNumber<K>, StaticDecode<Schema['response'][K]>>
    : never;
}[keyof Schema['response']];

export type ValidatedRouteHandler<Context, NewContext, Schema extends RouteSchema> = (
  request: RouteContext<Context & ValidatedContext<Schema> & NewContext>
) => Promise<ValidatedResponse<Schema>> | ValidatedResponse<Schema>;

type StringWithSuggestions<T> = T | (string & {});
export interface ValidatedRouteOptions<Context, NewContext, Schema extends RouteSchema> {
  method?: StringWithSuggestions<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'>;
  path: string;
  schema: Schema;
  middleware?: Middleware<NewContext>;
  handler: ValidatedRouteHandler<Context, NewContext, Schema>;
  onInvalidRequest?: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<RawResponse> | RawResponse;
  deserializeRequest?: {
    contentType: string;
    deserialize: (body?: RequestBody) => unknown;
  };
  serializeResponse?: {
    contentType: string;
    serialize: (response: unknown) => ResponseBody;
  };
}

export interface ValidationErrorContext {
  errors: ValueError[];
}

export interface TypeBoxGroupOptions {
  deserializeRequest?: {
    contentType: string;
    deserialize: (body?: RequestBody) => unknown;
  };
  serializeResponse?: {
    contentType: string;
    serialize: (response: unknown) => ResponseBody;
  };
  onInvalidRequest?: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<RawResponse> | RawResponse;
}

export function typebox<Context>(
  routerGroup: RouterGroup<Context>,
  options?: TypeBoxGroupOptions
): TypeBoxGroup<Context> {
  return new TypeBoxGroup(routerGroup, options);
}

export class TypeBoxGroup<Context> implements RouterGroup<Context> {
  private readonly onInvalidRequest: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<RawResponse> | RawResponse;
  private readonly serializeResponse: {
    contentType: string;
    serialize: (response: unknown) => ResponseBody;
  };
  private readonly deserializeRequest: {
    contentType: string;
    deserialize: (body?: RequestBody) => unknown;
  };

  constructor(
    private readonly routerGroup: RouterGroup<Context>,
    options?: TypeBoxGroupOptions
  ) {
    this.onInvalidRequest = options?.onInvalidRequest ?? (() => ({ status: 400 }));
    this.serializeResponse = options?.serializeResponse ?? {
      contentType: 'application/json',
      serialize: (body: unknown) => writeJson(body),
    };
    this.deserializeRequest = options?.deserializeRequest ?? {
      contentType: 'application/json',
      deserialize: (body?: RequestBody) => body && readJson(body),
    };
  }

  route<NewContext>(options: RouteOptions<Context, NewContext>): void {
    this.routerGroup.route(options);
  }

  group<NewContext>(options: GroupOptions<NewContext>): TypeBoxGroup<Context & NewContext> {
    return new TypeBoxGroup(this.routerGroup.group(options));
  }

  validatedRoute<NewContext, Schema extends RouteSchema>(
    options: ValidatedRouteOptions<Context, NewContext, Schema>
  ): void {
    this.route(this.validated(options));
  }

  validated<NewContext, Schema extends RouteSchema>(
    options: ValidatedRouteOptions<Context, NewContext, Schema>
  ): RouteOptions<Context, ValidatedContext<Schema> & NewContext> {
    const validationMiddleware = validation(
      options.schema,
      options.onInvalidRequest ?? this.onInvalidRequest
    );
    const deserializeRequest = options.deserializeRequest ?? this.deserializeRequest;
    const serializeResponse = options.serializeResponse ?? this.serializeResponse;

    const contentTypeMiddleware = contentType({
      contentType: deserializeRequest.contentType,
      deserializeRequest: (body) => deserializeRequest.deserialize(body),
      allowNoContent: true,
      onInvalidContentType: async () => ({ status: 415 }),
    });

    return {
      method: options.method,
      path: options.path,
      middleware: options.middleware
        ? pipe(contentTypeMiddleware, validationMiddleware, options.middleware)
        : (pipe(contentTypeMiddleware, validationMiddleware) as Middleware<
            ValidatedContext<Schema> & NewContext
          >),
      handler: async (context) => {
        const { status, body, headers: headersInit } = await options.handler(context);
        const headers = new Headers(headersInit);
        if (body === undefined) {
          return { status, headers };
        }
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', serializeResponse.contentType);
        }
        return { status, body: serializeResponse.serialize(body), headers };
      },
    };
  }
}

export function validation<Schema extends RouteSchema>(
  schema: Schema,
  onInvalidRequest: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<RawResponse> | RawResponse = () => ({ status: 400 })
): Middleware<ValidatedContext<Schema>> {
  const bodyValidator = schema.body && TypeCompiler.Compile(schema.body);
  const queryValidator = schema.query && TypeCompiler.Compile(schema.query);
  const paramsValidator = schema.params && TypeCompiler.Compile(schema.params);

  return async (next, context) => {
    if (!('body' in context)) throw new Error('should not happen');

    const errors: ValueError[] = [];

    const body = context.body;
    if (bodyValidator) {
      for (const error of bodyValidator.Errors(body)) {
        errors.push(error);
      }
    }

    const query = Object.fromEntries(context.url.searchParams.entries());
    if (queryValidator) {
      for (const error of queryValidator.Errors(query)) {
        errors.push(error);
      }
    }

    const params = context.params;
    if (paramsValidator) {
      for (const error of paramsValidator.Errors(params)) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      return await onInvalidRequest({ ...context, errors });
    }

    return await next({
      body: bodyValidator?.Decode(body),
      params: queryValidator?.Decode(query) ?? {},
      query: paramsValidator?.Decode(params) ?? {},
    });
  };
}
