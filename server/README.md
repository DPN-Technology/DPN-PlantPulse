# DPN PlantPulse Platform Service

This directory contains the v0.7 server implementation for the PlantPulse cloud/platform contract.

## Runtime

- Node.js 22+
- Fastify
- PostgreSQL
- JWKS/JWT identity verification
- S3-compatible signed upload grants

## Local development

From the repository root:

```bash
npm install
docker compose -f docker-compose.platform.yml up --build
```

The local compose stack uses the explicit development-only identity verifier. Protected API calls use a development credential with this shape:

```text
Authorization: Bearer dev:<tenant-id>:<user-id>
```

The server refuses development authentication when `NODE_ENV=production`.

## Production identity

Set:

```text
PLATFORM_AUTH_MODE=jwks
DPN_IDENTITY_ISSUER=...
DPN_IDENTITY_AUDIENCE=...
DPN_IDENTITY_JWKS_URL=...
DPN_TENANT_CLAIM=tenant_id
```

JWT signatures are validated against the configured remote JWKS and both issuer and audience are enforced.

## Rate limiting

The service registers `@fastify/rate-limit` before the API routes. The default is 120 requests per minute with standard rate-limit headers. GitHub Advanced Security checks the authenticated routes for rate limiting, and the integration suite verifies HTTP 429 behavior.

## Database

Apply the schema with:

```bash
npm run server:migrate
```

The PostgreSQL repository uses transactions and row locking for optimistic concurrency. A stale `baseRemoteRevision` returns a revision conflict instead of silently overwriting data.

## Verification

```bash
npm run server:typecheck
npm run server:build
npm run server:test
```

GitHub CI runs backend typecheck/build plus integration tests against a real disposable PostgreSQL instance.
