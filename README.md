# Glass Cannon

Glass Cannon is a modular TypeScript framework designed for building high-performance web servers. Built on standard Web `Request` and `Response` APIs, it provides a declarative, type-safe routing and middleware architecture with server implementations for both Node.js and Bun runtimes.

## Features

- **Standard Web APIs**: Built around native `Request` and `Response` objects.
- **Modular Design**: Each package is self-contained and can be used independently.
- **Declarative Routing**: Compose routes, nested groups, and plugins with `routes()`, `route()`, and `Router.from()`.
- **End-to-End Type Safety**: Context requirements (`Requires`) propagate through routes, middlewares, and groups at compile time.
- **Composable Middleware**: Build and chain middlewares using `middleware()` and `pipe()`.
- **Validation & OpenAPI**: Built-in request/response validation and OpenAPI 3.1 generation using TypeBox schemas.
- **Runtime Support**: Compatible with both Node.js and Bun runtimes.

## Packages

This project is organized as a monorepo with the following packages:

- **[@glass-cannon/server](packages/server)**: Core server interfaces and response helpers (`json`, `text`, `html`).
- **[@glass-cannon/server-node](packages/server-node)**: Node.js server implementation.
- **[@glass-cannon/server-bun](packages/server-bun)**: Bun server implementation.
- **[@glass-cannon/router](packages/router)**: Declarative routing, groups, plugins, and middleware utilities.
- **[@glass-cannon/typebox](packages/typebox)**: TypeBox integration for validation and OpenAPI 3.1 schema generation.
- **[@glass-cannon/cors](packages/cors)**: CORS plugin for routes and groups.

## Getting Started

Node:

```bash
npm install @glass-cannon/server-node @glass-cannon/router
```

Bun:

```bash
bun install @glass-cannon/server-bun @glass-cannon/router
```

## Example

```typescript
import { route, Router } from '@glass-cannon/router';
import { NodeServer, text } from '@glass-cannon/server-node';

// Define a GET route for the root path ('/')
const api = route({
  method: 'GET',
  path: '/',
  handler() {
    // Return a plain text Response with status 200
    return text({ status: 200, body: 'Hello World!' });
  },
});

// Compile the route tree into a Router instance
const router = Router.from(api);

// Create an HTTP server using the router's handler
const server = new NodeServer(router.handle);

// Start the server on 127.0.0.1:3000
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url.href}`);
```

## Middleware

Glass Cannon allows you to define type-safe middlewares that inspect requests, short-circuit responses, or enrich the route context:

```typescript
import { route, Router } from '@glass-cannon/router';
import { middleware } from '@glass-cannon/router/middleware';
import { text } from '@glass-cannon/server';

const authenticate = middleware<{ role: string }>(async (next, context) => {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization) {
    return new Response(null, { status: 401 });
  }
  const role = obtainRoleFromToken(authorization);
  return await next({ ...context, role });
});

const api = route({
  method: 'GET',
  path: '/role',
  middleware: authenticate,
  handler({ role }) {
    return text({ status: 200, body: `Your role is ${role}` });
  },
});

const router = Router.from(api);
```

### Pipe middleware

You can combine multiple middlewares using `pipe` (or the `.pipe()` method on a middleware created with `middleware()`):

```typescript
import { route } from '@glass-cannon/router';
import { middleware, pipe } from '@glass-cannon/router/middleware';
import { text } from '@glass-cannon/server';

const authenticate = middleware<{ role: string }>(/* ... */);

const log = middleware(async (next, context) => {
  console.log(`${context.method} ${context.url.pathname}`);
  return await next(context);
});

const api = route({
  method: 'GET',
  path: '/role',
  // log middleware is executed first, then authenticate
  middleware: pipe(log, authenticate), // or log.pipe(authenticate)
  handler({ role }) {
    return text({ status: 200, body: `Your role is ${role}` });
  },
});
```

## Groups & Context Requirements

Groups allow you to mount a sub-tree of routes under a shared prefix and middleware. Child routes can declare context requirements (such as `{ userId: string }`), which are enforced by TypeScript until satisfied by an enclosing group's middleware:

```typescript
import { route, Router, routes } from '@glass-cannon/router';
import { middleware } from '@glass-cannon/router/middleware';
import { json } from '@glass-cannon/server';

const authMiddleware = middleware<{ userId: string }>(async (next, context) => {
  const token = context.request.headers.get('Authorization');
  if (!token) return new Response(null, { status: 401 });
  return await next({ ...context, userId: token });
});

// Declare routes that require { userId: string } from an outer group
const usersRoutes = route<{ userId: string }>({
  method: 'GET',
  path: '/me',
  handler({ userId }) {
    return json({ status: 200, body: { userId } });
  },
});

// Mount usersRoutes under '/users' with authMiddleware satisfying { userId: string }
const api = routes().group(
  { prefix: '/users', middleware: authMiddleware },
  usersRoutes
);

const router = Router.from(api);
```

## TypeBox Integration & OpenAPI

Glass Cannon integrates with [TypeBox](https://github.com/sinclairzx81/typebox) via `@glass-cannon/typebox` to validate `params`, `query`, `headers`, `body`, and `response` payloads, and to generate OpenAPI 3.1 specifications from your route tree.

```typescript
import { Router, routes } from '@glass-cannon/router';
import { json } from '@glass-cannon/server';
import { openapi, schemaTransform, typebox, validated } from '@glass-cannon/typebox';
import { Type } from '@sinclair/typebox';

const mathRoutes = routes()
  .apply(
    schemaTransform((schema) => ({
      ...schema,
      tags: [...(schema.tags ?? []), 'Math'],
    }))
  )
  .route(
    validated({
      method: 'POST',
      path: '/double',
      schema: {
        summary: 'Double a number',
        body: Type.Object({
          value: Type.Number(),
        }),
        response: {
          200: Type.Object({
            result: Type.Number(),
          }),
        },
      },
      // body is automatically validated and typed as { value: number }
      handler({ body }) {
        return { status: 200, body: { result: body.value * 2 } };
      },
    })
  );

const api = routes()
  .apply(
    typebox({
      onInvalidRequest: ({ errors }) => json({ status: 400, body: { errors } }),
    })
  )
  .group({ prefix: '/v1' }, mathRoutes);

// Generate an OpenAPI 3.1 document from the route tree
const openApiSpec = openapi(api, {
  info: { title: 'My API', version: '1.0.0' },
});

api.route({
  method: 'GET',
  path: '/openapi.json',
  handler: () => json({ status: 200, body: openApiSpec }),
});

const router = Router.from(api);
```

## CORS

You can apply the `cors` plugin from `@glass-cannon/cors` before registering routes or groups using `.apply()`:

```typescript
import { cors } from '@glass-cannon/cors';
import { Router, routes } from '@glass-cannon/router';
import { text } from '@glass-cannon/server';

const api = routes()
  .apply(
    cors({
      allowOrigin: (origin) => origin === 'https://www.example.com',
    })
  )
  .route({
    method: 'GET',
    path: '/',
    handler() {
      return text({ status: 200, body: 'CORS enabled!' });
    },
  });

const router = Router.from(api);
```
