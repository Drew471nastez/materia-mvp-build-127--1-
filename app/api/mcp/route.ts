/**
 * ===========================================================================
 *  storelib.com/api/mcp: A SITE'S SECTION FILES, AS MCP TOOLS
 * ===========================================================================
 * Claude Code, available from every folder (user scope):
 *   claude mcp add --transport http --scope user storelib https://mcp.storelib.com \
 *     --header "Authorization: Bearer slb_..."
 *
 * Codex, in ~/.codex/config.toml:
 *   [mcp_servers.storelib]
 *   url = "https://mcp.storelib.com"
 *   bearer_token_env_var = "STORELIB_TOKEN"
 *
 * The token is made in the builder, under Website settings, and reaches one
 * site. Everything this can do is in lib/agent-access/operations.ts, and
 * the protocol handling is in lib/agent-access/mcp.ts.
 *
 * Stateless Streamable HTTP: every POST carries a complete JSON-RPC message
 * (or a batch) and gets its answer as JSON. There is no stream to open, so
 * GET says so.
 */
import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/agent-access/tokens"
import { bindOps } from "@/lib/agent-access/bind"
import { handleMcp, type RpcRequest } from "@/lib/agent-access/mcp"
import { readBodyCapped } from "@/lib/agent-access/body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** A write carries a whole section file; this is well above the file limit. */
const MAX_BODY = 1_200_000

export async function POST(request: Request) {
  const who = await authenticateAgent(request)
  if (who instanceof NextResponse) return who

  /* Counted as it arrives and cut off at the limit, not read whole and then measured. */
  const read = await readBodyCapped(request, MAX_BODY)
  if (read.ok === false) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: read.error } }, { status: read.status })
  }
  let body: unknown
  try {
    body = JSON.parse(read.text)
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 })
  }

  const ops = await bindOps(who)
  const messages = (Array.isArray(body) ? body : [body]).slice(0, 20) as RpcRequest[]
  const answers = []
  for (const msg of messages) {
    const answer = await handleMcp(msg && typeof msg === "object" ? msg : {}, ops)
    if (answer) answers.push(answer)
  }

  /* Only notifications: accepted, and by the protocol, nothing to say. */
  if (answers.length === 0) return new Response(null, { status: 202 })
  return NextResponse.json(Array.isArray(body) ? answers : answers[0])
}

export function GET() {
  return NextResponse.json(
    { error: "This MCP server answers POST only; it has no event stream." },
    { status: 405, headers: { Allow: "POST" } },
  )
}

export function DELETE() {
  /* Stateless: there is no session to end. */
  return new Response(null, { status: 204 })
}
