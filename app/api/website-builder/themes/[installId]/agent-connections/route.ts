/**
 * ===========================================================================
 *  A CREATOR'S AGENT CONNECTIONS FOR ONE SITE
 * ===========================================================================
 *   GET     the connections this site has, without their tokens
 *   POST    { name } makes one, and answers with its token ONCE
 *   DELETE  ?id= disconnects one. It stops working on the next request.
 *
 * Signed in, and only for a site that is this creator's. The token is never
 * stored, only its hash, so the answer to POST is the one chance to copy it.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mintToken } from "@/lib/agent-access/tokens"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

/** A site can hold a few; nobody needs a hundred live tokens for one site. */
const MAX_CONNECTIONS = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function ownInstall(installId: string) {
  /* Not a site id at all: no session lookup, no query, and no database
     error about a malformed uuid on its way back to the browser. */
  if (!UUID.test(installId)) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
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
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { data, error } = await createAdminClient()
    .from("theme_agent_tokens")
    .select("id, name, prefix, created_at, last_used_at")
    .eq("install_id", own.installId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_CONNECTIONS)
  if (error) {
    if (notSetUp(error.message)) return NextResponse.json({ connections: [], ready: false })
    return NextResponse.json({ error: "Could not read connections" }, { status: 500 })
  }
  return NextResponse.json({ connections: data ?? [], ready: true })
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let name = ""
  try {
    const body = (await req.json()) as { name?: unknown }
    name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : ""
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
  const { data, error } = await db
    .from("theme_agent_tokens")
    .insert({ install_id: own.installId, creator_id: own.creatorId, name, token_hash: minted.hash, prefix: minted.prefix })
    .select("id, name, prefix, created_at, last_used_at")
    .single()
  if (error) return NextResponse.json({ error: "Could not make a connection" }, { status: 500 })

  return NextResponse.json({ connection: data, token: minted.token })
}

export async function DELETE(req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
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
