import type {
  GroupOptions,
  RouteContext,
  RouteHandler,
  RouteOptions,
  RouterGroup,
} from '@glass-cannon/router';
import { pipe, type Middleware } from '@glass-cannon/router/middleware';
import { json } from '@glass-cannon/server';
import type { Response as RawResponse } from '@glass-cannon/server';
import type { StaticDecode, TSchema } from '@sinclair/typebox';
import { TypeCompiler, type ValueError } from '@sinclair/typebox/compiler';

export interface RouteSchema {
  body?: TSchema;
  query?: TSchema;
  params?: TSchema;
  response: Record<number, TSchema>;
}

export interface ValidatedContext<Schema extends RouteSchema> {
  json: Schema['body'] extends TSchema ? StaticDecode<Schema['body']> : undefined;
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
}[number];

export type ValidatedRouteHandler<Context, NewContext, Schema extends RouteSchema> = (
  request: RouteContext<Context & ValidatedContext<Schema> & NewContext>
) => Promise<ValidatedResponse<Schema>> | ValidatedResponse<Schema>;

type StringWithSuggestions<T> = T | (string & {});
export interface ValidatedRouteOptions<Context, NewContext, Schema extends RouteSchema> {
  method?: StringWithSuggestions<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'>;
  path: string;
  middleware: Middleware<NewContext>;
  schema: Schema;
  handler: ValidatedRouteHandler<Context, NewContext, Schema>;
  onInvalidRequest?: RouteHandler<{ json: unknown } & ValidationErrorContext>;
  serializeResponse?: (response: ValidatedResponse<Schema>) => RawResponse | Promise<RawResponse>;
}

export interface ValidationErrorContext {
  errors: ValueError[];
}

export interface TypeBoxGroupOptions {
  serializeResponse?: (response: ValidatedResponse) => RawResponse | Promise<RawResponse>;
  onInvalidRequest?: RouteHandler<{ json: unknown } & ValidationErrorContext>;
}

export function typebox<Context>(
  routerGroup: RouterGroup<Context>,
  options?: TypeBoxGroupOptions
): TypeBoxGroup<Context> {
  return new TypeBoxGroup(routerGroup, options);
}

export class TypeBoxGroup<Context> implements RouterGroup<Context> {
  private readonly onInvalidRequest: RouteHandler<{ json: unknown } & ValidationErrorContext>;
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

  route<NewContext, Schema extends RouteSchema = RouteSchema>(
    options: RouteOptions<Context, NewContext> | ValidatedRouteOptions<Context, NewContext, Schema>
  ): void {
    if ('schema' in options) {
      this.routerGroup.route(
        validated({
          ...options,
          onInvalidRequest: options.onInvalidRequest ?? this.onInvalidRequest,
          serializeResponse: options.serializeResponse ?? this.serializeResponse,
        })
      );
    } else {
      this.routerGroup.route(options);
    }
  }

  group<NewContext>(options: GroupOptions<NewContext>): TypeBoxGroup<Context & NewContext> {
    return new TypeBoxGroup(this.routerGroup.group(options));
  }
}

export function validated<Context, NewContext, Schema extends RouteSchema>(
  options: ValidatedRouteOptions<Context, NewContext, Schema>
): RouteOptions<Context, ValidatedContext<Schema> & NewContext> {
  const validationMiddleware = validation(options.schema, options.onInvalidRequest);
  const serializeResponse = options.serializeResponse ?? json;

  return {
    method: options.method,
    path: options.path,
    middleware: pipe(validationMiddleware, options.middleware),
    handler: async (context) => {
      const response = await options.handler(context);
      return await serializeResponse(response);
    },
  };
}

export function validation<Schema extends RouteSchema>(
  schema: Schema,
  onInvalidRequest?: RouteHandler<{ json: unknown } & ValidationErrorContext>
): Middleware<ValidatedContext<Schema>> {
  const bodyValidator = schema.body && TypeCompiler.Compile(schema.body);
  const queryValidator = schema.query && TypeCompiler.Compile(schema.query);
  const paramsValidator = schema.params && TypeCompiler.Compile(schema.params);

  return async (next, context) => {
    if (!('json' in context)) {
      throw new Error('validated route must be used with a context that has json field');
    }

    const errors: ValueError[] = [];

    const json = context.json;
    if (bodyValidator) {
      for (const error of bodyValidator.Errors(json)) {
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
        ? await onInvalidRequest({ ...context, errors } as RouteContext<
            { json: unknown } & ValidationErrorContext
          >)
        : { status: 400 };
    }

    return await next({
      json: bodyValidator?.Decode(json),
      params: queryValidator?.Decode(query) ?? {},
      query: paramsValidator?.Decode(params) ?? {},
    } as ValidatedContext<Schema>);
  };
}
