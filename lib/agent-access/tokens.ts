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
import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { hashToken, keyExpired, looksLikeToken, scopesCanWrite } from "./token-format"

export { TOKEN_PREFIX, hashToken, looksLikeToken, mintToken, READ_ONLY_REFUSAL, DEFAULT_KEY_DAYS, keyExpired, scopesCanWrite, expiryFor } from "./token-format"

export interface AgentIdentity {
  tokenId: string
  installId: string
  creatorId: string
  /** What the creator called it: "Claude Code", "Codex on my laptop". */
  name: string
  /** The site's own name, read in the same query as the token. */
  siteName?: string
  /** False for a read only key: it can look at the site and change nothing. Absent means it can write. */
  canWrite?: boolean
  /** When the key stops working, or null for never. */
  expiresAt?: string | null
}


/**
 * Wrong tokens, counted per address. A token is 256 random bits, so guessing
 * one is not the worry; a script sending a stream of made-up ones is, since
 * each is a database read. Only a request that got as far as the database
 * and was refused is counted, so a working connection never pays for it.
 */
const FAILED_AUTH = [{ limit: 20, seconds: 60 }, { limit: 200, seconds: 3600 }] as const

async function refused(request: Request, message: string): Promise<NextResponse> {
  const limited = await rateLimit({
    bucket: "agent-auth-fail",
    subjects: [addressSubject(request)],
    windows: FAILED_AUTH,
    message: "Too many wrong connection tokens from here. Wait a minute.",
  })
  return limited ?? NextResponse.json({ error: message }, { status: 401 })
}

/** Runs after the answer when there is a request to run it after, else now. */
function later(task: () => Promise<unknown>) {
  try {
    after(task)
  } catch {
    void task().catch(() => {})
  }
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
  /*
    ONE READ, BY THE UNIQUE INDEX ON token_hash, with the site it reaches
    joined in. The join is the ownership check: the token must name a site
    that still exists and still belongs to the creator who made the token.
    `!inner` drops the row when the site is gone, so a token outliving its
    site is refused rather than trusted.
  */
  type TokenRow = {
    id: string
    install_id: string
    creator_id: string
    name: string
    token_hash: string
    revoked_at: string | null
    last_used_at: string | null
    expires_at?: string | null
    scopes?: string[] | null
    install: { creator_id?: string; name?: string } | { creator_id?: string; name?: string }[] | null
  }
  /* expires_at and scopes arrived with part 132; before it, a key is read as it always was. */
  let COLUMNS = "id, install_id, creator_id, name, token_hash, revoked_at, last_used_at, expires_at, scopes"
  const first = async () =>
    (await db
      .from("theme_agent_tokens")
      .select(`${COLUMNS}, install:store_theme_installs!inner(creator_id, name)`)
      .eq("token_hash", hash)
      .maybeSingle()) as { data: TokenRow | null; error: { message?: string } | null }
  let { data: row, error } = await first()
  if (error && /expires_at|scopes/.test(error.message ?? "")) {
    COLUMNS = "id, install_id, creator_id, name, token_hash, revoked_at, last_used_at"
    ;({ data: row, error } = await first())
  }

  /*
    A schema cache that has not learnt the relationship yet answers the join
    with an error. That must not take every connection down, so the same
    check is made in two reads instead.
  */
  if (error && /relationship/i.test(error.message ?? "")) {
    const plain = (await db.from("theme_agent_tokens").select(COLUMNS).eq("token_hash", hash).maybeSingle()) as {
      data: Omit<TokenRow, "install"> | null
      error: { message?: string } | null
    }
    error = plain.error
    row = null
    if (!plain.error && plain.data) {
      const { data: install } = await db.from("store_theme_installs").select("creator_id, name").eq("id", plain.data.install_id).maybeSingle()
      row = { ...plain.data, install: install ?? null }
    }
  }

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
  const site = Array.isArray(row?.install) ? row?.install[0] : row?.install
  const owned = !!row && !!site && site.creator_id === row.creator_id
  if (!row || !matches || row.revoked_at || !owned) {
    return refused(request, "This connection token is not valid, or it was disconnected.")
  }
  /* A key past its day: said plainly, with where to make a new one. */
  if (keyExpired(row.expires_at)) {
    return refused(request, `This connection key expired on ${String(row.expires_at).slice(0, 10)}. Make a new one in Website settings, Connections.`)
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

  /* Written at most once a minute, and after the answer: a busy agent is not
     a write per call, and no call waits for one. */
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0
  const tokenId = row.id
  if (!last || Date.now() - last > 60_000) {
    later(async () => {
      await db.from("theme_agent_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenId)
    })
  }

  return {
    tokenId: row.id,
    installId: row.install_id,
    creatorId: row.creator_id,
    name: row.name,
    siteName: site?.name ?? undefined,
    canWrite: scopesCanWrite(row.scopes),
    expiresAt: row.expires_at ?? null,
  }
}
