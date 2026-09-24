/**
 * mcp.storelib.com is the MCP server and nothing else.
 *
 * Claude Code and Codex are given `https://mcp.storelib.com` (see
 * ./setup-commands.ts); the proxy sends it to the one route that answers MCP,
 * app/api/mcp. Every other path on that host is a 404: it is not a website,
 * so it must never fall through to the rule that treats <name>.storelib.com
 * as a creator's site. storelib.com/api/mcp keeps working for connections
 * made before the host existed.
 *
 * Edge-safe and pure: the proxy imports it, and so does the test.
 */
export const MCP_HOST_LABEL = "mcp"

export type McpHostRoute = { kind: "rewrite"; path: string } | { kind: "not-found" } | null

export function mcpHostRoute(host: string, pathname: string, mainDomain: string): McpHostRoute {
  const bare = host.split(":")[0].toLowerCase()
  if (bare !== `${MCP_HOST_LABEL}.${mainDomain}`) return null
  if (pathname === "/" || pathname === "/mcp" || pathname === "/mcp/") return { kind: "rewrite", path: "/api/mcp" }
  if (pathname === "/api/mcp") return { kind: "rewrite", path: "/api/mcp" }
  return { kind: "not-found" }
}
