/**
 * ===========================================================================
 *  A CREATOR'S AGENT CONNECTIONS FOR ONE SITE
 * ===========================================================================
 *   GET     the connections this site has, without their tokens, each with
 *           when it expires and whether it can change the site
 *   POST    { name, access?: "write" | "read", days?: number } makes one,
 *           and answers with its token ONCE. It works for `days` (180 when
 *           not said, 0 for no end); a "read" key can look and not change.
 *   DELETE  ?id= disconnects one. It stops working on the next request.
 *
 * Signed in, and only for a site that is this creator's. The token is never
 * stored, only its hash, so the answer to POST is the one chance to copy it.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { expiryFor, keyExpired, mintToken } from "@/lib/agent-access/token-format"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

/** A site can hold a few; nobody needs a hundred live tokens for one site. */
const MAX_CONNECTIONS = 10

const BASE_COLUMNS = "id, name, prefix, created_at, last_used_at"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `strict`: a key made or ended (round 52), so Supabase Auth itself must say who this is (lib/auth/route-user `fresh`). */
async function ownInstall(installId: string, { strict = false }: { strict?: boolean } = {}) {
  /* Not a site id at all: no session lookup, no query, and no database
     error about a malformed uuid on its way back to the browser. */
  if (!UUID.test(installId)) return null
  /* Supabase Auth not answering is "Try again" (503), never "Not found" (lib/auth/route-user). */
  const who = await routeUser({ fresh: strict })
  if (who.kind === "unavailable") return "unavailable" as const
  if (who.kind !== "user") return null
  const user = who.user
  const supabase = await createClient()
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return null
  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  return install ? { creatorId: creator.id as string, installId: install.id as string, userId: user.id } : null
}

function notSetUp(message: string | undefined) {
  return /theme_agent_tokens|does not exist|schema cache/i.test(message ?? "")
}

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (own === "unavailable") return authUnavailableResponse()
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const read = (cols: string) =>
    createAdminClient()
      .from("theme_agent_tokens")
      .select(cols)
      .eq("install_id", own.installId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_CONNECTIONS)
  /* expires_at and scopes arrived with part 132. */
  let { data, error } = await read(`${BASE_COLUMNS}, expires_at, scopes`)
  if (error && /expires_at|scopes/.test(error.message ?? "")) ({ data, error } = await read(BASE_COLUMNS))
  if (error) {
    if (notSetUp(error.message)) return NextResponse.json({ connections: [], ready: false })
    return NextResponse.json({ error: "Could not read connections" }, { status: 500 })
  }
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ...r,
    expires_at: (r.expires_at as string | null | undefined) ?? null,
    expired: keyExpired(r.expires_at as string | null | undefined),
    access: Array.isArray(r.scopes) && !(r.scopes as string[]).includes("write") ? "read" : "write",
  }))
  return NextResponse.json({ connections: rows, ready: true })
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId, { strict: true })
  if (own === "unavailable") return authUnavailableResponse()
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let name = ""
  let access: "read" | "write" = "write"
  let days: unknown = undefined
  try {
    const body = (await req.json()) as { name?: unknown; access?: unknown; days?: unknown }
    name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : ""
    if (body.access === "read") access = "read"
    days = body.days
  } catch {
    /* an empty body falls through to the default name */
  }
  if (!name) name = "AI agent"

  /* Making tokens, per person. The cap of ten live ones per site does not
     stop a loop of make and disconnect; this does. */
  const limited = await rateLimit({
    bucket: "agent-token-mint",
    subjects: [`user:${own.userId}`],
    windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86400 }],
    message: "That is a lot of new tokens. Wait a few minutes.",
  })
  if (limited) return limited

  const db = createAdminClient()
  const { count, error: countError } = await db
    .from("theme_agent_tokens")
    .select("id", { count: "exact", head: true })
    .eq("install_id", own.installId)
    .is("revoked_at", null)
  if (countError) {
    if (notSetUp(countError.message)) {
      return NextResponse.json({ error: "Agent connections need a database update first. Run supabase/sql/RUN_AGENT_CONNECTIONS.sql." }, { status: 503 })
    }
    return NextResponse.json({ error: "Could not make a connection" }, { status: 500 })
  }
  if ((count ?? 0) >= MAX_CONNECTIONS) {
    return NextResponse.json({ error: `A site holds ${MAX_CONNECTIONS} connections. Disconnect one first.` }, { status: 409 })
  }

  const minted = mintToken()
  const row = { install_id: own.installId, creator_id: own.creatorId, name, token_hash: minted.hash, prefix: minted.prefix }
  const expires_at = expiryFor(days)
  const scopes = access === "read" ? ["read"] : ["read", "write"]
  let { data, error } = await db
    .from("theme_agent_tokens")
    .insert({ ...row, expires_at, scopes })
    .select(`${BASE_COLUMNS}, expires_at, scopes`)
    .single()
  /* Before part 132: a key that never expires and can write, as every key was. A read only key is refused rather than made writable. */
  if (error && /expires_at|scopes/.test(error.message ?? "")) {
    if (access === "read") return NextResponse.json({ error: "Read only keys need a database update first (part 132)." }, { status: 503 })
    ;({ data, error } = await db.from("theme_agent_tokens").insert(row).select(BASE_COLUMNS).single())
  }
  if (error) return NextResponse.json({ error: "Could not make a connection" }, { status: 500 })
  const made = data as unknown as Record<string, unknown>
  return NextResponse.json({
    connection: { ...made, expires_at: made.expires_at ?? null, expired: false, access: Array.isArray(made.scopes) && !(made.scopes as string[]).includes("write") ? "read" : "write" },
    token: minted.token,
  })
}

export async function DELETE(req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId, { strict: true })
  if (own === "unavailable") return authUnavailableResponse()
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const id = new URL(req.url).searchParams.get("id")
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { error } = await createAdminClient()
    .from("theme_agent_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("install_id", own.installId)
  if (error) return NextResponse.json({ error: "Could not disconnect" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
