# ELUS Memory OAuth MCP Gateway — PREPARED, NOT DEPLOYED

This gateway routes a single bank (`wandora_memory`) to Hindsight after verifying the Auth0-signed JWT with JWKS (issuer, audience, signature, expiration), both read and write scopes, and an explicit subject allowlist.

**Do not deploy until**:
- Set `ALLOWED_AUTH0_SUBJECTS` to the exact Auth0 user `sub` identifiers for the two operators. This is sensitive operational identity data; set only in Portainer.
- Pass `HINDSIGHT_API_TENANT_API_KEY` as a Portainer secret/env reference, never commit.
- Review stream handling, long-lived SSE, MCP session affinity, and per-operation permissions; use security tests before exposure.
- Route `/.well-known/oauth-protected-resource` and `/mcp/wandora_memory/` through the gateway **only after it is running**.
- Verify `resource` vs Auth0 API audience. Hindsight API remains on an internal Docker network.
- The gateway currently requires BOTH memory scopes for any MCP traffic (least functionality, conservative enforcement). Future work: per-tool RBAC.
- Auth0 can now advertise CIMD, but the ChatGPT connector's exact client metadata URL and callback URI still need to be confirmed in the ChatGPT UI.

## Endpoint
`https://memo.elus360.com.br/mcp/wandora_memory/`

Auth0 issuer: `https://elus360.us.auth0.com/`
API audience: `https://memo.elus360.com.br/mcp`

No public registration, billing or multi-tenant service in current scope.
