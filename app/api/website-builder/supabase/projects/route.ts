/**
 * GET  ?installId=  Whether Supabase sign in is set up here, and, after a
 *      sign in, the projects to pick from.
 * POST { installId, ref }  The picked project's address and public key, for
 *      the builder to save as the site's own database. The token is
 *      forgotten once it has answered.
 *
 * The token never reaches the browser: it is sealed in an http only cookie
 * scoped to these routes (./callback). See lib/website-builder/supabase-connect.
 */
import { NextResponse } from "next/server"
import { open } from "@/lib/ai-keys/crypto"
import { ownInstall } from "@/lib/github-sync/own-install"
import { COOKIE_PATH, TOKEN_COOKIE, listProjects, projectConnection, supabaseOAuthConfig } from "@/lib/website-builder/supabase-connect"
import { storeUnavailableResponse } from "@/lib/team/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/** The token from the cookie, only for the site it was given for. */
function tokenFor(req: Request, installId: string): string | null {
  const raw = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]+)`))?.[1]
  const opened = raw ? open(decodeURIComponent(raw)) : null
  if (!opened) return null
  try {
    const body = JSON.parse(opened) as { token?: unknown; installId?: unknown }
    return typeof body.token === "string" && body.installId === installId ? body.token : null
  } catch {
    return null
  }
}

function forget(res: NextResponse) {
  res.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: COOKIE_PATH, maxAge: 0 })
  return res
}

export async function GET(req: Request) {
  const installId = new URL(req.url).searchParams.get("installId") ?? ""
  const own = await ownInstall(installId)
  if (own === "unavailable") return storeUnavailableResponse()
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
  const configured = supabaseOAuthConfig() !== null
  const token = configured ? tokenFor(req, own.installId) : null
  if (!token) return NextResponse.json({ configured, projects: null }, { headers: NO_STORE })
  const projects = await listProjects(token)
  if (!projects) return forget(NextResponse.json({ configured, projects: null, error: "Supabase did not list your projects. Connect again." }, { headers: NO_STORE }))
  return NextResponse.json({ configured, projects }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { installId?: unknown; ref?: unknown }
  const own = await ownInstall(typeof body.installId === "string" ? body.installId : "")
  if (own === "unavailable") return storeUnavailableResponse()
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
  const token = tokenFor(req, own.installId)
  if (!token) return NextResponse.json({ error: "The Supabase sign in has run out. Connect again." }, { status: 401, headers: NO_STORE })
  const connection = await projectConnection(token, typeof body.ref === "string" ? body.ref : "")
  if (!connection) return NextResponse.json({ error: "That project has no public key Storelib can use." }, { status: 422, headers: NO_STORE })
  return forget(NextResponse.json(connection, { headers: NO_STORE }))
}
