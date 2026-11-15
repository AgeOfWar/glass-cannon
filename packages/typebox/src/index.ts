import {
  ALL_METHODS,
  type NodeBuilder,
  type Plugin,
  type RouteContext,
  type RouteHandler,
  type RouteNode,
  type RouteOptions,
} from '@glass-cannon/router';
import {
  apply,
  contentType,
  middleware,
  type MergeRequires,
  type Middleware,
  type MiddlewareWrapper,
} from '@glass-cannon/router/middleware';
import { json } from '@glass-cannon/server';
import { Type, TypeGuard, type StaticDecode, type TObject, type TSchema } from '@sinclair/typebox';
import { TypeCompiler, type ValueError, type ValueErrorIterator } from '@sinclair/typebox/compiler';
import { Value } from '@sinclair/typebox/value';
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
  query: Schema['query'] extends Record<string, TSchema>
    ? StaticDecode<TObject<Schema['query']>>
    : Record<string, never>;
  params: Schema['params'] extends Record<string, TSchema>
    ? StaticDecode<TObject<Schema['params']>>
    : Record<string, never>;
}

export type Response<StatusCode extends number = number, T = unknown> = undefined extends T
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

export type ValidatedRouteHandler<Schema extends RouteSchema, Requires = unknown> = (
  request: Omit<RouteContext, 'params'> & NoInfer<ValidatedContext<Schema>> & Requires
) => Promise<ValidatedResponse<Schema>> | ValidatedResponse<Schema>;

type CompatibleMiddlewareRequires<
  Schema extends RouteSchema,
  MiddlewareRequires,
> = ValidatedContext<Schema> extends Pick<
  MiddlewareRequires,
  keyof MiddlewareRequires & keyof ValidatedContext<Schema>
>
  ? MiddlewareRequires
  : Omit<MiddlewareRequires, keyof ValidatedContext<Schema>> & ValidatedContext<Schema>;

export type ValidatedMiddleware<
  Schema extends RouteSchema,
  Provides = unknown,
  MiddlewareRequires = unknown,
  ContextRequires = unknown,
  HandlerRequires = unknown,
> = (
  next: RouteHandler<Provides & NoInfer<CompatibleMiddlewareRequires<Schema, MiddlewareRequires>>>,
  context: RouteContext &
    NoInfer<ValidatedContext<Schema> & ContextRequires & HandlerRequires> &
    MiddlewareRequires
) => Promise<globalThis.Response> | globalThis.Response;

type StringWithSuggestions<T> = T | (string & {});
export interface ValidatedRouteOptions<
  Schema extends RouteSchema,
  HandlerRequires = unknown,
  Provides = unknown,
  MiddlewareRequires = unknown,
  ContextRequires = unknown,
> {
  method?: StringWithSuggestions<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'>;
  path: string;
  schema: Schema;
  middleware?: ValidatedMiddleware<
    NoInfer<Schema>,
    Provides,
    MiddlewareRequires,
    ContextRequires,
    HandlerRequires
  >;
  handler: ValidatedRouteHandler<
    Schema,
    NoInfer<
      Provides & MergeRequires<ValidatedContext<Schema>, unknown, MiddlewareRequires> & ContextRequires
    > &
      HandlerRequires
  >;
  schemaTransform?: SchemaTransform;
}

export interface ValidationErrorContext {
  errors: ValueError[];
}

export type SchemaTransform = (spec: RouteSchema) => RouteSchema;

export interface TypeBoxOptions {
  deserializeRequest?: {
    contentType: string;
    deserialize: (request?: Request) => unknown;
  };
  serializeResponse?: {
    contentType: string;
    serialize: (response: Response) => Promise<globalThis.Response> | globalThis.Response;
  };
  onInvalidRequest?: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<globalThis.Response> | globalThis.Response;
  schemaTransform?: SchemaTransform;
  aot?: boolean;
}

export interface OpenApiOptions {
  info?: InfoObject;
  components?: ComponentsObject;
  servers?: ServerObject[];
  externalDocs?: ExternalDocumentationObject;
  security?: SecurityRequirementObject[];
  tags?: TagObject[];
  webhooks?: PathsObject;
  schemaTransform?: SchemaTransform;
}

export interface SchemaMetadata {
  schema: RouteSchema;
  requestContentType: string;
  responseContentType: string;
}

export interface ValidatedHandler<Requires = unknown> extends RouteHandler<Requires> {
  metadata: SchemaMetadata;
  configure: (options: TypeBoxOptions) => ValidatedHandler<Requires>;
}

function isValidatedHandler(handler: RouteHandler): handler is ValidatedHandler {
  return 'metadata' in handler;
}

const defaultDeserializeRequest = {
  contentType: 'application/json',
  deserialize: (request?: Request) => request?.json(),
};

const defaultSerializeResponse = {
  contentType: 'application/json',
  serialize: (response: Response) => json(response),
};

const defaultOnInvalidRequest = (): globalThis.Response =>
  new globalThis.Response(null, { status: 400 });

export function validated<
  Schema extends RouteSchema,
  HandlerRequires = unknown,
  Provides = unknown,
  MiddlewareRequires = unknown,
  ContextRequires = unknown,
>(
  options: ValidatedRouteOptions<
    Schema,
    HandlerRequires,
    Provides,
    MiddlewareRequires,
    ContextRequires
  >,
  typeboxOptions?: TypeBoxOptions
): RouteOptions<
  HandlerRequires &
    MergeRequires<
      NoInfer<ValidatedContext<Schema>>,
      unknown,
      NoInfer<MiddlewareRequires>
    >,
  unknown,
  unknown,
  ContextRequires
> {
  let initialSchema: RouteSchema = options.schema;
  if (options.schemaTransform) initialSchema = options.schemaTransform(initialSchema);
  if (typeboxOptions?.schemaTransform) initialSchema = typeboxOptions.schemaTransform(initialSchema);

  type InferredHandlerRequires = HandlerRequires &
    MergeRequires<
      NoInfer<ValidatedContext<Schema>>,
      unknown,
      NoInfer<MiddlewareRequires>
    >;

  function createHandler(
    currentOptions: TypeBoxOptions | undefined,
    currentSchema: RouteSchema
  ): ValidatedHandler<InferredHandlerRequires> {
    const deserializeRequest = currentOptions?.deserializeRequest ?? defaultDeserializeRequest;
    const serializeResponse = currentOptions?.serializeResponse ?? defaultSerializeResponse;
    const onInvalidRequest = currentOptions?.onInvalidRequest ?? defaultOnInvalidRequest;
    const aot = currentOptions?.aot ?? true;

    const contentTypeMiddleware = contentType({
      contentType: deserializeRequest.contentType,
      deserializeRequest: (request) => deserializeRequest.deserialize(request),
      allowNoContent: true,
      onInvalidContentType: () => new globalThis.Response(null, { status: 415 }),
    });

    const validationMiddleware = validation(options.schema, onInvalidRequest, aot);
    const baseMiddleware = contentTypeMiddleware.pipe(validationMiddleware);
    const fullMiddleware = options.middleware
      ? baseMiddleware.pipe(options.middleware as unknown as Middleware)
      : baseMiddleware;

    const rawHandler: RouteHandler<ValidatedContext<Schema>> = async (context) => {
      const {
        status,
        body,
        headers: headersInit,
      } = await (options.handler as ValidatedRouteHandler<Schema>)(context);
      const headers = new Headers(headersInit);
      if (body === undefined) {
        return new globalThis.Response(null, { status, headers });
      }
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', serializeResponse.contentType);
      }
      return await serializeResponse.serialize({ status, body, headers });
    };

    return Object.assign(
      apply(fullMiddleware as Middleware, rawHandler) as RouteHandler<InferredHandlerRequires>,
      {
        metadata: {
          schema: currentSchema,
          requestContentType: deserializeRequest.contentType,
          responseContentType: serializeResponse.contentType,
        },
        configure(pluginOptions: TypeBoxOptions): ValidatedHandler<InferredHandlerRequires> {
          const nextSchema = pluginOptions.schemaTransform
            ? pluginOptions.schemaTransform(this.metadata.schema)
            : this.metadata.schema;
          const mergedOptions: TypeBoxOptions = { ...pluginOptions, ...currentOptions };
          return createHandler(mergedOptions, nextSchema);
        },
      }
    );
  }

  return {
    method: options.method,
    path: options.path,
    handler: createHandler(typeboxOptions, initialSchema),
  };
}

export function typebox(options: TypeBoxOptions): Plugin {
  function visit(node: RouteNode): void {
    for (const [method, handler] of Object.entries(node.methods)) {
      if (isValidatedHandler(handler)) {
        node.methods[method] = handler.configure(options);
      }
    }
    for (const child of Object.values(node.children)) {
      visit(child);
    }
  }

  return (node: RouteNode): RouteNode => {
    visit(node);
    return node;
  };
}

export function schemaTransform(transform: SchemaTransform): Plugin {
  return typebox({ schemaTransform: transform });
}

export function openapi<Requires = unknown, Provides = unknown>(
  node: RouteNode<Requires> | NodeBuilder<Requires, Provides>,
  options?: OpenApiOptions
): OpenAPIObject {
  const rootNode = ('build' in node ? node.build() : node) as RouteNode;
  const builder = new OpenApiBuilder({
    openapi: '3.1.0',
    info: options?.info ?? { title: 'API', version: '1.0.0' },
    servers: options?.servers,
    components: options?.components,
    externalDocs: options?.externalDocs,
    security: options?.security,
    tags: options?.tags,
    webhooks: options?.webhooks,
  });

  const globalTransform = options?.schemaTransform ?? ((spec: RouteSchema) => spec);

  function visit(currentNode: RouteNode, currentPath: string): void {
    const openApiPath = (currentPath || '/').replace(/:([a-zA-Z0-9_]+)\*?/g, '{$1}');

    for (const [rawMethod, handler] of Object.entries(currentNode.methods)) {
      if (!isValidatedHandler(handler)) continue;
      const { metadata } = handler;

      const schema = globalTransform(metadata.schema);
      const methods =
        rawMethod === ALL_METHODS
          ? ['get', 'post', 'put', 'delete', 'patch']
          : [rawMethod.toLowerCase()];

      for (const method of methods) {
        const spec: PathItemObject = {
          [method]: {
            description: schema.description,
            summary: schema.summary,
            tags: schema.tags,
            security: schema.security?.map((s) => ({ [s]: [] })),
            ...(schema.body &&
              !TypeGuard.IsUndefined(schema.body) && {
                requestBody: {
                  description: schema.body.description,
                  content: {
                    [metadata.requestContentType]: {
                      schema: schema.body,
                    },
                  },
                },
              }),
            parameters: [
              ...Object.entries(schema.params ?? {}).map(([name, paramSchema]) => ({
                name,
                in: 'path' as const,
                schema: paramSchema,
                required: !TypeGuard.IsOptional(paramSchema),
                description: paramSchema.description,
              })),
              ...Object.entries(schema.query ?? {}).map(([name, querySchema]) => ({
                name,
                in: 'query' as const,
                schema: querySchema,
                required: !TypeGuard.IsOptional(querySchema),
                description: querySchema.description,
              })),
            ],
            responses: mapValues(schema.response, (resSchema) => ({
              description: resSchema.description ?? '',
              ...(!TypeGuard.IsUndefined(resSchema) &&
                !TypeGuard.IsNever(resSchema) && {
                  content: {
                    [metadata.responseContentType]: {
                      schema: resSchema,
                    },
                  },
                }),
            })),
          },
        };
        builder.addPath(openApiPath, spec);
      }
    }

    for (const [segment, child] of Object.entries(currentNode.children)) {
      visit(child, `${currentPath}/${segment}`);
    }
  }

  visit(rootNode, '');
  return builder.getSpec();
}

export function validation<Schema extends RouteSchema>(
  schema: Schema,
  onInvalidRequest: (
    request: RouteContext & ValidationErrorContext
  ) => Promise<globalThis.Response> | globalThis.Response = defaultOnInvalidRequest,
  aot = true
): MiddlewareWrapper<ValidatedContext<Schema>, { body: unknown }> {
  const bodyValidator = schema.body && compile(schema.body, aot);
  const queryValidator = schema.query && compile(Type.Object(schema.query), aot);
  const paramsValidator = schema.params && compile(Type.Object(schema.params), aot);

  return middleware(async (next, context) => {
    const errors: ValueError[] = [];

    let body = context.body;
    if (bodyValidator) {
      body = Value.Clean(bodyValidator.Schema(), body);
      body = Value.Default(bodyValidator.Schema(), body);
      body = Value.Convert(bodyValidator.Schema(), body);
      for (const error of bodyValidator.Errors(body)) {
        errors.push(error);
      }
    }

    let query = Object.fromEntries(context.url.searchParams.entries()) as unknown;
    if (queryValidator) {
      query = Value.Clean(queryValidator.Schema(), query);
      query = Value.Default(queryValidator.Schema(), query);
      query = Value.Convert(queryValidator.Schema(), query);
      for (const error of queryValidator.Errors(query)) {
        errors.push(error);
      }
    }

    let params = context.params as unknown;
    if (paramsValidator) {
      params = Value.Clean(paramsValidator.Schema(), params);
      params = Value.Default(paramsValidator.Schema(), params);
      params = Value.Convert(paramsValidator.Schema(), params);
      for (const error of paramsValidator.Errors(params)) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      return await onInvalidRequest({ ...context, errors });
    }

    return await next({
      ...context,
      body: bodyValidator?.Decode(body),
      params: paramsValidator?.Decode(params) ?? {},
      query: queryValidator?.Decode(query) ?? {},
    } as RouteContext & ValidatedContext<Schema> & { body: unknown });
  });
}

function compile(
  schema: TSchema,
  aot: boolean
): {
  Errors: (value: unknown) => ValueErrorIterator;
  Schema: () => TSchema;
  Decode: (value: unknown) => unknown;
} {
  return aot
    ? TypeCompiler.Compile(schema)
    : {
        Errors: (value) => Value.Errors(schema, value),
        Decode: (value) => Value.Decode(schema, value),
        Schema: () => schema,
      };
}

function mapValues<T, U>(obj: Record<string, T>, fn: (value: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, fn(value)]));
}
