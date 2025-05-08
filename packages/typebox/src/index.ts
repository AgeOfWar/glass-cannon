import {
  type GroupOptions,
  type RouteContext,
  type RouteOptions,
  type RouterGroup,
} from '@glass-cannon/router';
import { contentType, pipe, type Middleware } from '@glass-cannon/router/middleware';
import { readJson, writeJson } from '@glass-cannon/server';
import type { Response as RawResponse, RequestBody, ResponseBody } from '@glass-cannon/server';
import { Type, TypeGuard, type StaticDecode, type TObject, type TSchema } from '@sinclair/typebox';
import { TypeCompiler, type ValueError } from '@sinclair/typebox/compiler';
import {
  OpenApiBuilder,
  type ComponentsObject,
  type ExternalDocumentationObject,
  type InfoObject,
  type OpenAPIObject,
  type PathItemObject,
  type PathsObject,
  type SecurityRequirementObject,
  type ServerObject,
  type TagObject,
} from 'openapi3-ts/oas31';

export interface RouteSchema {
  body?: TSchema;
  query?: Record<string, TSchema>;
  params?: Record<string, TSchema>;
  response: Record<number, TSchema>;

  description?: string;
  tags?: string[];
  summary?: string;
  security?: string[];
}

export interface ValidatedContext<Schema extends RouteSchema> {
  body: Schema['body'] extends TSchema ? StaticDecode<Schema['body']> : undefined;
  query: Schema['query'] extends TSchema
    ? StaticDecode<TObject<Schema['query']>>
    : Record<string, never>;
  params: Schema['params'] extends TSchema
    ? StaticDecode<TObject<Schema['params']>>
    : Record<string, never>;
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
  schemaTransform?: SchemaTransform;
}

export interface ValidationErrorContext {
  errors: ValueError[];
}

export type SchemaTransform = (spec: RouteSchema) => RouteSchema;

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
  openapi?: {
    info?: InfoObject;
    components?: ComponentsObject;
    servers?: ServerObject[];
    externalDocs?: ExternalDocumentationObject;
    security?: SecurityRequirementObject[];
    tags?: TagObject[];
    webhooks?: PathsObject;
    schemaTransform?: SchemaTransform;
  };
}

export function typebox<Context>(
  routerGroup: RouterGroup<Context>,
  options?: TypeBoxGroupOptions
): TypeBoxGroup<Context> {
  return new TypeBoxGroup(routerGroup, options);
}

export class TypeBoxGroup<Context> implements RouterGroup<Context> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parent?: TypeBoxGroup<any>;
  private readonly builder: OpenApiBuilder | undefined;
  private readonly schemaTransform: SchemaTransform;

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
    if (options?.openapi) {
      this.builder = new OpenApiBuilder({
        openapi: '3.1.0',
        info: options.openapi.info ?? { title: 'API', version: '1.0.0' },
        servers: options.openapi.servers,
        components: options.openapi.components,
        externalDocs: options.openapi.externalDocs,
        security: options.openapi.security,
        tags: options.openapi.tags,
        webhooks: options.openapi.webhooks,
      });
    }
    this.schemaTransform = options?.openapi?.schemaTransform ?? ((spec) => spec);
  }

  route<NewContext>(options: RouteOptions<Context, NewContext> & { schema?: RouteSchema }): void {
    this.routerGroup.route(options);
    if (options.schema) {
      if (options.method) {
        this.registerSchema(options.method, options.path, options.schema);
      } else {
        for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
          this.registerSchema(method, options.path, options.schema);
        }
      }
    }
  }

  group<NewContext>(
    options: GroupOptions<NewContext> & { schemaTransform?: SchemaTransform }
  ): TypeBoxGroup<Context & NewContext> {
    const group = new TypeBoxGroup(this.routerGroup.group(options), {
      deserializeRequest: this.deserializeRequest,
      serializeResponse: this.serializeResponse,
      onInvalidRequest: this.onInvalidRequest,
      openapi: this.builder && {
        components: this.builder.getSpec().components,
        info: this.builder.getSpec().info,
        servers: this.builder.getSpec().servers,
        externalDocs: this.builder.getSpec().externalDocs,
        security: this.builder.getSpec().security,
        tags: this.builder.getSpec().tags,
        webhooks: this.builder.getSpec().webhooks,
        schemaTransform: options.schemaTransform
          ? (spec) => options.schemaTransform!(this.schemaTransform(spec))
          : this.schemaTransform,
      },
    });
    group.parent = this;
    return group;
  }

  validatedRoute<NewContext, Schema extends RouteSchema>(
    options: ValidatedRouteOptions<Context, NewContext, Schema>
  ): void {
    this.route(this.validated(options));
  }

  validated<NewContext, Schema extends RouteSchema>(
    options: ValidatedRouteOptions<Context, NewContext, Schema>
  ): RouteOptions<Context, ValidatedContext<Schema> & NewContext> & { schema: RouteSchema } {
    const validationMiddleware = validation(options.schema, this.onInvalidRequest);

    const contentTypeMiddleware = contentType({
      contentType: this.deserializeRequest.contentType,
      deserializeRequest: (body) => this.deserializeRequest.deserialize(body),
      allowNoContent: true,
      onInvalidContentType: async () => ({ status: 415 }),
    });

    let schema: RouteSchema = options.schema;
    if (options.schemaTransform) schema = options.schemaTransform(schema);
    schema = this.schemaTransform(schema);

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
          headers.set('Content-Type', this.serializeResponse.contentType);
        }
        return { status, body: this.serializeResponse.serialize(body), headers };
      },
      schema,
    };
  }

  registerSchema(method: string, path: string, schema: RouteSchema): void {
    if (!this.builder) return;

    path = path.replace(/:(\w+)/g, '{$1}');
    method = method.toLowerCase();
    schema = this.schemaTransform(schema);
    const spec: PathItemObject = {
      [method]: {
        ...(schema.body &&
          !TypeGuard.IsUndefined(schema.body) && {
            requestBody: {
              description: schema.body.description,
              content: {
                [this.deserializeRequest.contentType]: {
                  schema: schema.body,
                },
              },
            },
          }),
        parameters: [
          ...Object.entries(schema.params ?? {}).map(([name, schema]) => ({
            name,
            in: 'path',
            schema,
            required: !TypeGuard.IsOptional(schema),
            description: schema.description,
          })),
          ...Object.entries(schema.query ?? {}).map(([name, schema]) => ({
            name,
            in: 'query',
            schema,
            required: !TypeGuard.IsOptional(schema),
            description: schema.description,
          })),
        ],
        responses: mapValues(schema.response, (schema) => ({
          description: schema.description ?? '',
          ...(!TypeGuard.IsUndefined(schema) &&
            !TypeGuard.IsNever(schema) && {
              content: {
                [this.serializeResponse.contentType]: {
                  schema,
                },
              },
            }),
        })),
      },
    };
    this.builder.addPath(path, spec);
    if (this.parent) this.parent.registerSchema(method, path, schema);
  }

  openapi(): OpenAPIObject {
    if (!this.builder) {
      throw new Error(
        'OpenAPI builder not initialized, specify openapi settings in group options to use this function'
      );
    }
    return this.builder.getSpec();
  }
}

export function validation<Schema extends RouteSchema>(
  schema: Schema,
  onInvalidRequest: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<RawResponse> | RawResponse = () => ({ status: 400 })
): Middleware<ValidatedContext<Schema>> {
  const bodyValidator = schema.body && TypeCompiler.Compile(schema.body);
  const queryValidator = schema.query && TypeCompiler.Compile(Type.Object(schema.query));
  const paramsValidator = schema.params && TypeCompiler.Compile(Type.Object(schema.params));

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
    } as ValidatedContext<Schema>);
  };
}

function mapValues<T, U>(obj: Record<string, T>, fn: (value: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, fn(value)]));
}
