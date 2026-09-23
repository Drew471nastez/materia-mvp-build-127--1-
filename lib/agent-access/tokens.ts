/**
 * ===========================================================================
 *  A CONNECTION BETWEEN ONE SITE AND ONE AGENT
 * ===========================================================================
 * A creator connects Claude Code, Codex or anything else that speaks MCP or
 * HTTP to ONE of their sites. What the agent holds is a token; what the
 * database holds is the token's SHA-256. The token is shown once, when it
 * is made, and never again: a leaked row cannot be used to connect, and a
 * lost token is revoked and replaced rather than recovered.
 *
 * A token reaches one install and nothing else: not the creator's other
 * sites, not their products, orders, subscribers or account. What it may do
 * there is in ./operations.ts.
 */
import "server-only"
import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { hashToken, looksLikeToken } from "./token-format"

export { TOKEN_PREFIX, hashToken, looksLikeToken, mintToken } from "./token-format"

export interface AgentIdentity {
  tokenId: string
  installId: string
  creatorId: string
  /** What the creator called it: "Claude Code", "Codex on my laptop". */
  name: string
}

/**
 * Who is asking, from the Authorization header, or the response to send
 * back instead. Every agent route starts here and does nothing else first.
 */
export async function authenticateAgent(request: Request): Promise<AgentIdentity | NextResponse> {
  const header = request.headers.get("authorization") ?? ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token || !looksLikeToken(token)) {
    return NextResponse.json(
      { error: "Send the connection token from Website settings as: Authorization: Bearer slb_..." },
      { status: 401 },
    )
  }

  const hash = hashToken(token)
  const db = createAdminClient()
  const { data: row, error } = await db
    .from("theme_agent_tokens")
    .select("id, install_id, creator_id, name, token_hash, revoked_at, last_used_at")
    .eq("token_hash", hash)
    .maybeSingle()

  if (error) {
    /* The table is missing until the migration has run. Say so, not "no". */
    if (/theme_agent_tokens|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json(
        { error: "Agent connections are not set up on this Storelib yet. Run supabase/sql/RUN_AGENT_CONNECTIONS.sql." },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: "Could not check the token" }, { status: 500 })
  }
  /**
   * Compared again, in constant time. The lookup is by hash already, so this
   * is belt and braces; it costs nothing and it is the comparison anybody
   * reading this file expects to see.
   */
  const matches =
    !!row &&
    typeof row.token_hash === "string" &&
    row.token_hash.length === hash.length &&
    timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(hash))
  if (!row || !matches || row.revoked_at) {
    return NextResponse.json({ error: "This connection token is not valid, or it was disconnected." }, { status: 401 })
  }

  /* Per connection: generous for an agent at work, useless for a script
     hammering a creator's site with writes. */
  const limited = await rateLimit({
    bucket: "agent",
    subjects: [`token:${row.id}`],
    windows: [{ limit: 120, seconds: 60 }, { limit: 2000, seconds: 3600 }],
    message: "Too many requests from this connection. Wait a minute.",
  })
  if (limited) return limited

  /* Written at most once a minute: a busy agent is not a write per call. */
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0
  if (!last || Date.now() - last > 60_000) {
    await db.from("theme_agent_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id)
  }

  return { tokenId: row.id, installId: row.install_id, creatorId: row.creator_id, name: row.name }
}
