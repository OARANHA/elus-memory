# ELUS Memory — MCP OAuth ChatGPT Implementation Plan

> For agentic workers: use superpowers:executing-plans task-by-task with independent verification.

**Goal:** Connect ChatGPT to the self-hosted Hindsight at https://memo.elus360.com.br/mcp/ using standards-compliant OAuth without requiring Keycloak, without exposing bank data anonymously.

**Architecture:** Keep Hindsight's Control Plane (port 9999) and API (port 8888) unchanged. Place a small OAuth-aware MCP gateway in front of the MCP API; validate OAuth provider tokens and scope/bank access, then forward to Hindsight with the existing tenant API key held server-side only. Traefik routes /mcp and OAuth protected-resource metadata to the gateway; other routes retain the current panel behavior.

**Tech stack:** Hindsight v1.1.0, Docker Compose (Portainer Repository), Traefik file provider, OIDC/OAuth authorization provider, HTTPS (Cloudflare).

**Spec:** existing ELUS Memory deployment at deploy/elus/compose.yaml and OpenAI OAuth MCP auth requirements: https://developers.openai.com/plugins/build/auth

## Global constraints

- Never publish Hindsight tenant API key, Chutes API key, or CP key to browser or repository.
- Keep existing volume hindsight_data and functioning panel.
- Do not replace active Traefik routes before a tested gateway exists.
- Allowlist bank IDs per authenticated subject/client; `wandora_memory` is the local bank.
- Exact OAuth issuer, registered OAuth client, audience, scopes, and certificate/JWKS must be verified live before deployment.
- ChatGPT uses OAuth authorization-code with PKCE S256, supported client registration/metadata, issuer consistency and resource parameter binding.
- On failed auth return 401 + WWW-Authenticate Bearer challenge pointing to protected-resource metadata.
- Unauthenticated MCP tools/list and calls must fail; expired/wrong-audience/wrong-scope tokens must fail.

## Review Focus

1. Unknown/fake bearer token => 401, never proxied.
2. Valid JWT with wrong aud or iss => 401, never proxied.
3. Token without allowed bank/scope => 403 (or 401 challenge as appropriate), no memory disclosure.
4. Expired token => 401, even when JWKS cached.
5. Authorization redirect and resource mismatch => reject rather than accepting a token for another MCP server.

## Tasks

### Task 1 — Select verified OAuth provider and record integration settings

- [ ] For private MVP, prioritize a mature OAuth authorization provider supporting MCP, PKCE S256 and CIMD or DCR; inspect its issuer discovery/JWKS and verify audience and registration capabilities. Do not require Keycloak.
- [ ] Verify chatgpt callback URL and PKCE S256 compatibility. Never guess URLs or secrets.
- [ ] Document verified values in deploy/elus/oauth-integration.md (no secrets).
- [ ] Verify discovery endpoints return valid metadata and TLS passes.

### Task 2 — Build and test authenticated MCP gateway

- [ ] Create isolated gateway service under deploy/elus/mcp-gateway with JWT verification (JWKS, iss, aud, exp, scopes), bank ACLs, WWW-Authenticate challenges, and protected-resource metadata.
- [ ] Write negative tests for invalid/missing/expired/wrong-audience/wrong-scope tokens and forbidden banks; run RED then GREEN.
- [ ] Write positive test with authorized test identity and no exposure of the internal Hindsight key.
- [ ] Validate actual MCP initialize and tools/list with user-scoped OAuth bearer.

### Task 3 — Wire Repository stack and Traefik

- [ ] Add gateway container to deploy/elus/compose.yaml with env references to Portainer secrets, no host port publication.
- [ ] Change Traefik dynamic file: /mcp and /.well-known/oauth-protected-resource route to gateway, panel remains Control Plane.
- [ ] Validate compose config and Traefik config before deploy.
- [ ] Redeploy Portainer Git stack ID 12 with existing variables preserved. Re-read stack state.
- [ ] Stage and activate Traefik config using approved administration workflow.

### Task 4 — End-to-end ChatGPT and security verification

- [ ] Unauthenticated MCP POST returns 401 with resource_metadata challenge, discovery returns JSON not /login redirect.
- [ ] Valid OAuth session with PKCE succeeds, and retains/recalls within approved bank only.
- [ ] Confirm denied cross-bank access, logout/revocation/expiration, and TLS.
- [ ] Verify existing panel login, cloud API settings, and persistence still work.
- [ ] Record pass/fail evidence; no production-ready claim without passing tests.

## Verified status (2026-10-25)

- Portainer connector is configured at https://portainer.wandora.com.br, Stack ID 12, repository OARANHA/elus-memory.
- Panel root returns HTTP 307 to /login; unauthenticated POST /mcp/ returned 401 in prior validated test.
- GET https://memo.elus360.com.br/.well-known/oauth-protected-resource currently returns HTTP 307 to /login, not required JSON.
- The gateway and OAuth integration has NOT yet been deployed.

## Product decision and live check (2026-10-25)

- Scope NOW: only project operators; no public signup, no billing, no multi-tenant rollout yet. Preserve future per-account bank isolation design.
- The ChatGPT OAuth client must discover valid protected-resource and authorization-server metadata; do not equate Hindsight API-key auth with OAuth.
- Official Hindsight self-hosted MCP path is `/mcp/{bank_id}/`; use `https://memo.elus360.com.br/mcp/wandora_memory/` for the private bank. It currently returns HTTP 200 to an unauthenticated GET (which may be a transport response; GET alone does not prove a data exposure). Earlier unauthenticated POST to `/mcp/` returned 401.
- Discovery path `/.well-known/oauth-protected-resource/mcp/wandora_memory/` returned HTTP 308 on initial request; inspect final response and advertise bank-scoped resource URL as necessary.
- Before production enabling, select an established compatible OAuth provider. This requires the operator to provision issuer settings/credentials in the provider; do not invent secrets or deploy fake OAuth metadata.
- Do not route /mcp to a public auth bypass; retain existing tenant-key protections until validated OAuth gateway is ready.

## Auth0 discovery verified 2026-10-25

User created Auth0 tenant `elus360.us.auth0.com`, API identifier `https://memo.elus360.com.br/mcp`, scopes `memory:read` and `memory:write`, enabled RBAC and Resource Parameter Compatibility Profile (user-confirmed; RBAC and toggle not independently inspected).

Live GET to `https://elus360.us.auth0.com/.well-known/openid-configuration` returned:
- issuer: `https://elus360.us.auth0.com/` (trailing slash significant)
- authorization endpoint: `https://elus360.us.auth0.com/authorize`
- token endpoint: `https://elus360.us.auth0.com/oauth/token`
- JWKS: `https://elus360.us.auth0.com/.well-known/jwks.json`
- PKCE: `S256` supported
- client ID metadata support and DCR registration endpoint: NOT advertised at inspection time

**Next requirement:** Enable Auth0 **Client ID Metadata Document (CIMD) Registration** in Tenant Settings > Advanced, then recheck OIDC discovery; manually import the *actual* ChatGPT CIMD document URL displayed when defining the ChatGPT connector (do not guess callback-ID-dependent URL). Avoid enabling open DCR for private use. Use per-application API grants, not default third-party grants. See OpenAI MCPKit Auth0 guide in `https://github.com/openai/openai-mcpkit/blob/main/python-authenticated-mcp-server-scaffold/README.md`.

Until a tested JWT-validating gateway handles `/.well-known/oauth-protected-resource` and bank-scoped `/mcp/wandora_memory/`, do not deploy new Traefik routes or claim OAuth completion.
