import {
  type GroupOptions,
  type RouteContext,
  type RouteHandler,
  type RouteOptions,
  type RouterGroup,
} from '@glass-cannon/router';
import { pipe, type Middleware } from '@glass-cannon/router/middleware';
import { json } from '@glass-cannon/server';
import type { Response as RawResponse } from '@glass-cannon/server';
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
  onInvalidRequest?: RouteHandler<ValidationErrorContext>;
  serializeResponse?: (response: ValidatedResponse<Schema>) => RawResponse | Promise<RawResponse>;
}

export interface ValidationErrorContext {
  errors: ValueError[];
}

export interface TypeBoxGroupOptions {
  serializeResponse?: (response: ValidatedResponse) => RawResponse | Promise<RawResponse>;
  onInvalidRequest?: RouteHandler<ValidationErrorContext>;
}

export function typebox<Context>(
  routerGroup: RouterGroup<Context>,
  options?: TypeBoxGroupOptions
): TypeBoxGroup<Context> {
  return new TypeBoxGroup(routerGroup, options);
}

export class TypeBoxGroup<Context> implements RouterGroup<Context> {
  private readonly onInvalidRequest: RouteHandler<ValidationErrorContext>;
  private readonly serializeResponse: (
    response: ValidatedResponse
  ) => RawResponse | Promise<RawResponse>;

  constructor(
    private readonly routerGroup: RouterGroup<Context>,
    options?: TypeBoxGroupOptions
  ) {
    this.onInvalidRequest = options?.onInvalidRequest ?? (() => ({ status: 400 }));
    this.serializeResponse = options?.serializeResponse ?? json;
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
  ): RouteOptions<Context, ValidatedContext<Schema> & NewContext> & { schema: Schema } {
    const validationMiddleware = validation(
      options.schema,
      options.onInvalidRequest ?? this.onInvalidRequest
    );
    const serializeResponse = options.serializeResponse ?? this.serializeResponse;

    return {
      method: options.method,
      path: options.path,
      middleware: options.middleware
        ? pipe(validationMiddleware, options.middleware)
        : (validationMiddleware as Middleware<ValidatedContext<Schema> & NewContext>),
      handler: async (context) => {
        const response = await options.handler(context);
        return await serializeResponse(response);
      },
      schema: options.schema,
    };
  }
}

export function validation<Schema extends RouteSchema>(
  schema: Schema,
  onInvalidRequest?: RouteHandler<ValidationErrorContext>
): Middleware<ValidatedContext<Schema>> {
  const bodyValidator = schema.body && TypeCompiler.Compile(schema.body);
  const queryValidator = schema.query && TypeCompiler.Compile(schema.query);
  const paramsValidator = schema.params && TypeCompiler.Compile(schema.params);

  return async (next, context) => {
    if (!('body' in context)) {
      throw new Error('validated route must be used with a context that has body field');
    }

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
      return onInvalidRequest
        ? await onInvalidRequest({ ...context, errors } as RouteContext<ValidationErrorContext>)
        : { status: 400 };
    }

    return await next({
      body: bodyValidator?.Decode(body),
      params: queryValidator?.Decode(query) ?? {},
      query: paramsValidator?.Decode(params) ?? {},
    } as ValidatedContext<Schema>);
  };
}
