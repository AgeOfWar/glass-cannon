# Glass Cannon

Glass Cannon is a modular TypeScript framework designed for building high-performance web servers. It provides a flexible architecture with support for routing, middleware, and server implementations for both Node.js and Bun runtimes.

## Features

- **Modular Design**: Each package is self-contained and can be used independently.
- **Routing**: Powerful routing capabilities with support for middleware and nested groups.
- **Middleware**: Compose middleware using a type-safe functional pipeline.
- **Type Safety**: Leverages TypeScript for type-safe APIs and schemas.
- **Runtime Support**: Compatible with both Node.js and Bun runtimes.
- **Validation**: Built-in support for request validation using TypeBox schemas.

## Packages

This project is organized as a monorepo with the following packages:

- **[@glass-cannon/server](packages/server)**: Core server utilities and abstractions.
- **[@glass-cannon/server-node](packages/server-node)**: Node.js server implementation.
- **[@glass-cannon/server-bun](packages/server-bun)**: Bun server implementation.
- **[@glass-cannon/router](packages/router)**: Routing and middleware utilities.
- **[@glass-cannon/typebox](packages/typebox)**: TypeBox integration for request validation.
- **[@glass-cannon/cors](packages/cors)**: CORS policies for your APIs.

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
import { NodeServer, text } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';

// Create a new router instance to define HTTP routes
const router = new Router();

// Define a GET route for the root path ('/')
router.route({
  method: 'GET',
  path: '/',
  handler() {
    // Return a plain text response with status 200
    return text({ status: 200, body: 'Hello World!' });
  },
});

// Create an HTTP server using the router's handler
const server = new NodeServer(router.handle);

// Start the server on 127.0.0.1:3000
const runningServer = await server.listen({ host: '127.0.0.1', port: 3000 });
console.log(`Server is running on ${runningServer.url}`);
```

## Middleware

Glass Cannon allows you to use middleware to handle authentication before processing requests. Here's an example of implementing an authentication middleware:

```typescript
const authenticate: Middleware<{ role: string }> = (next, context) => {
  const authorization = context.headers.get('Authorization');
  if (!authorization) {
    return { status: 401 };
  }
  const role = obtainRoleFromToken(authorization);
  return next({ role });
};

router.route({
  method: 'GET',
  path: '/role',
  middleware: authenticate,
  handler({ role }) {
    return text({ status: 200, body: `Your role is ${role}` });
  },
});
```

### Pipe middlewares

You can combine multiple middleware functions using the `pipe` utility. Here's an example that combines a logging middleware with an authentication middleware:

```typescript
// Authentication middleware
const authenticate: Middleware<{ role: string }> = /*...*/

// Logging middleware
const log: Middleware = (next, context) => {
  console.log('New request:', context);
  return next(context);
};

router.route({
  method: 'GET',
  path: '/role',
  // log middleware is executed first, then authenticate
  middleware: pipe(log, authenticate),
  handler({ role }) {
    return text({ status: 200, body: `Your role is ${role}` });
  },
});
```

## Groups

Glass Cannon provides a powerful way to organize routes and middleware using groups. Groups allow you to define a common prefix and shared middleware for a set of related routes, simplifying the management of complex APIs.

```typescript
import { json, NodeServer } from '@glass-cannon/server-node';
import { Router } from '@glass-cannon/router';
import { jsonBody, pipe } from '@glass-cannon/router/middleware';

const router = new Router();

// Create a group with a prefix and shared middleware
const v1 = router.group({
  prefix: '/v1',
  middleware: jsonBody(), // Parse JSON body for all routes in this group
});

// Define a route within the group
v1.route({
  method: 'GET',
  path: '/double',
  // middleware order: jsonBody, log, authenticate
  middleware: pipe(log, authenticate),
  handler({ body }) {
    if (!body) return json({ status: 400, body: 'Missing body' });
    if (typeof body !== 'number') return json({ status: 400, body: 'Not a number' });
    return json({ status: 200, body: { result: body * 2 } });
  },
});
```

## TypeBox Integration

Glass Cannon integrates seamlessly with [TypeBox](https://github.com/sinclairzx81/typebox) to provide runtime validation and type-safe schemas for your routes. This integration ensures that your API requests and responses adhere to defined schemas, improving reliability and developer experience.

### Example: Validating Requests and Responses

Here's an example of using TypeBox to validate the request body and response:

```typescript
import { Router } from '@glass-cannon/router';
import { jsonBody } from '@glass-cannon/router/middleware';
import { typebox } from '@glass-cannon/typebox';
import { Type } from '@sinclair/typebox';

// Create a router with JSON body parsing middleware
const router = new Router({
  middleware: jsonBody(),
});

// Wrap router group with TypeBox integration
const v1 = typebox(
  router.group({
    prefix: '/v1',
    middleware: jsonBody(),
  })
);

// Define a validated route
v1.validatedRoute({
  schema: {
    body: Type.Number(),
    response: {
      200: Type.Object({
        result: Type.Number(),
      }),
    },
  },
  path: '/double',
  // body type is inferred as number
  handler: ({ body }) => {
    // return a status code different from 200 results in an error, same for body
    return { status: 200, body: { result: body * 2 } };
  },
});

// Could also be written as v1.route(v1.validated({ ... }))
```

## CORS

Glass Cannon makes it easy to handle CORS (Cross-Origin Resource Sharing). This allows you to enable or configure CORS policies for your APIs in a simple and modular way.

### Esempio: Abilitare CORS su tutte le rotte

You can use the `cors` from the `@glass-cannon/cors` package to add CORS headers to HTTP responses:

```typescript
import { cors } from '@glass-cannon/cors';

const group = cors(router, { allowOrigin: (origin) => origin === 'www.example.com' });

group.route({
  method: 'GET',
  path: '/',
  handler() {
    return { status: 200, body: 'CORS enabled!' };
  },
});
```
