# Hardened personal SwissGroceries MCP

This fork preserves [nicktcode/swissgroceries-mcp](https://github.com/nicktcode/swissgroceries-mcp) and its PolyForm Shield license. This deployment is for the owner's personal grocery research; it is not a public directory listing or a commercial grocery product.

## Explicit retailer choice

Every multi-retailer tool requires `chains`. There is no default selection.

```json
{"query":"milch","chains":["coop"]}
{"query":"milch","chains":["migros","coop","aldi"]}
{"query":"milch","chains":"all"}
```

`all` includes Migros, Coop, Aldi, Denner, Lidl, Volgshop, Otto's, and Coop City. Empty/unknown/missing selections fail validation before any network request. Single-retailer detail/stock tools require a `chain`. Plugin instructions use the user's explicitly selected retailers and ask when the choice is unknown.

## Data boundary

- Free-text address geocoding was removed. Tools accept a Swiss ZIP (resolved using a bundled local table) or explicitly supplied coordinates. ZIP-derived coordinates may be sent to selected retailers for nearby-store lookups. No address is sent to Nominatim or another geocoding service.
- `src/util/outbound.ts` limits application requests to known retailer HTTPS origins and API paths. MCP calls carry an isolated retailer scope; contacting an unselected retailer is blocked before network access and before cached-response lookup.
- Redirects are disabled. The Migros client disables environment proxies and uses only public guest authentication. The broader migros-api-wrapper dependency was removed.
- Retailer clients construct their own headers. Incoming MCP auth/cookies/IP headers are not passed to them. The MCP server receives tool arguments, not automatic access to the user's files or chat history.
- Query-bearing debug logs were removed and debug logging is disabled even if selected accidentally. Production logging is silent except the startup message. No analytics/telemetry, database, mounted user files, persistent query history, or retailer-account credentials are configured.
- Public response caching is in memory, normally five minutes, bounded to 128 entries / approximately 32 MB in the shared HTTP cache. Some original adapters separately cache public catalogs/campaigns. Anonymous guest tokens and Denner's anonymous client ID remain in memory for the process lifetime. No personal Denner JWT is read from the environment.
- Dependency lifecycle scripts are disabled during installation. Runtime dependencies are pruned, versions/integrity hashes are locked, and the container runs as an unprivileged user.

Railway hosts this service and can access requests processed by the service. Retailers see the service's IP and the selected search terms, public product/store identifiers, language/pagination, and location when required for store searches. The application allowlist is not an infrastructure firewall or a complete transitive-dependency audit. Review code/dependency updates before redeploying.

## Hosting and verification

Requires Node.js >=22.12. Use the Dockerfile, `PORT=3000`, domain port 3000, and `GET /health`. MCP uses stateless Streamable HTTP at `POST /mcp` with no account login. The original stdio entrypoint remains available.

Railway infrastructure is in `.railway/railway.ts`. Run `railway config plan` before applying it. Production follows this fork's master branch; upstream updates are not automatically synced.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm audit
npm run start:http
```

Tests include MCP-level selection validation, one/several/all routing, disabled geocoding, unselected-retailer blocking, cache isolation, endpoint allowlists, redirect settings, and the upstream adapter/planner suite. Live verification uses generic grocery terms and public ZIPs only. Upstream APIs remain unofficial and may change; a retailer failure is unknown coverage, not proof of no products.
