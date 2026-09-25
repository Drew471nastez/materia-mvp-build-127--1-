/**
 * ===========================================================================
 *  A LINK THAT SHOWS THE UNPUBLISHED VERSION
 * ===========================================================================
 * GET    says whether one exists, without making one. Opening the publish
 *        panel should not quietly mint a secret.
 * POST   makes one, or hands back the one that exists.
 * DELETE removes it, which is what un-sharing means: every link already sent
 *        stops working the moment this returns.
 *
 * There is no rotate. Turning the link off and asking for another one is the
 * same thing in two presses, and it is the same two presses somebody would
 * make anyway after a link went somewhere it should not have.
 *
 * The token grants reading ONE theme's drafts. Not the account, not its
 * products, not another install. It is stored as written and compared
 * against, rather than decoded, so there is nothing in it to forge.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { newPreviewToken } from "@/lib/website-builder/preview-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

async function owned(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Sign in to use this.", status: 401 as const, supabase: null }
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { error: "Only creators can do this.", status: 403 as const, supabase: null }
  /** RLS decides: a theme somebody else owns reads as absent. */
  const { data: install, error } = await supabase
    .from("store_theme_installs")
    .select("id, preview_token")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (error && /preview_token/.test(error.message)) return { error: MIGRATION, status: 503 as const, supabase: null }
  if (!install) return { error: "Theme not found", status: 404 as const, supabase: null }
  return { error: null, status: 200 as const, supabase, install: install as { id: string; preview_token: string | null } }
}

/**
 * The column is added by RUN_THEME_PREVIEW_LINK.sql. Until that has run, say
 * so plainly rather than passing on a database message: the answer is one SQL
 * file, and the site itself is unaffected either way.
 */
const MIGRATION = "Preview links need RUN_THEME_PREVIEW_LINK.sql to be run once."

/**
 * Where the link points. The storefront resolves a creator by username, so
 * the caller supplies the site's own address and this only adds the token:
 * building the host here would mean knowing about custom domains, which is
 * somebody else's job and changes more often than this does.
 */
function withToken(base: unknown, token: string): string | null {
  if (typeof base !== "string" || !base) return null
  /**
   * A PATH, NOT A QUERY. The token used to be `?preview=<token>` on the
   * site's own URL, which forced the public route to read a query string —
   * and a route that reads one is rendered for each visitor, so the
   * published site could never be held at the edge. Its own address costs
   * nothing and takes that constraint away.
   *
   * `?preview=` is still honoured by the public route, so every link already
   * shared keeps working.
   */
  const [origin, query] = base.split("?")
  const path = `${origin.replace(/\/$/, "")}/preview/${token}`
  return query ? `${path}?${query}` : path
}

async function baseOf(req: NextRequest): Promise<unknown> {
  return (await req.json().catch(() => ({})))?.base
}

export async function GET(req: NextRequest, { params }: Params) {
  const { installId } = await params
  const o = await owned(installId)
  if (o.error || !o.supabase) return NextResponse.json({ error: o.error }, { status: o.status })
  const token = o.install.preview_token
  const base = req.nextUrl.searchParams.get("base")
  return NextResponse.json({ token, url: token ? withToken(base, token) : null })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { installId } = await params
  const o = await owned(installId)
  if (o.error || !o.supabase) return NextResponse.json({ error: o.error }, { status: o.status })

  const existing = o.install.preview_token
  if (existing) {
    return NextResponse.json({ token: existing, url: withToken(await baseOf(req), existing), created: false })
  }

  const token = newPreviewToken()
  const { error } = await o.supabase.from("store_theme_installs").update({ preview_token: token }).eq("id", installId)
  if (error) {
    if (!/preview_token/.test(error.message)) console.error("[preview-link] failed", { code: error.code })
    return NextResponse.json({ error: /preview_token/.test(error.message) ? MIGRATION : "Could not make a preview link. Try again." }, { status: 503 })
  }
  return NextResponse.json({ token, url: withToken(await baseOf(req), token), created: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { installId } = await params
  const o = await owned(installId)
  if (o.error || !o.supabase) return NextResponse.json({ error: o.error }, { status: o.status })
  const { error } = await o.supabase.from("store_theme_installs").update({ preview_token: null }).eq("id", installId)
  if (error) {
    console.error("[preview-link] could not turn off", { code: error.code })
    return NextResponse.json({ error: "Could not turn the preview link off. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
