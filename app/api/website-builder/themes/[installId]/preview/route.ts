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
import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse, type NextRequest } from "next/server"
import { newPreviewToken, previewBase } from "@/lib/website-builder/preview-link"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"
import { getCanonicalSiteUrl, getMainDomain } from "@/lib/url-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
async function owned(installId: string) {
  const site = await websiteInstallCaller(installId)
  if (site.error !== null) return { error: site.error, status: site.status as 401 | 403 | 404 | 503, supabase: null }
  const { data: install, error } = await site.supabase.from("store_theme_installs").select("id, preview_token").eq("id", installId).eq("creator_id", site.creatorId).maybeSingle()
  if (error && /preview_token/.test(error.message)) return { error: MIGRATION, status: 503 as const, supabase: null }
  if (!install) return { error: "Theme not found", status: 404 as const, supabase: null }
  return { error: null, status: 200 as const, supabase: site.supabase, install: install as { id: string; preview_token: string | null }, userId: site.userId }
}

/**
 * The panel asks once when it opens and once per press, so LIMITS.siteAction
 * covers it many times over. Shared by all three methods: a loop of make and
 * remove is still a loop.
 */
function limit(userId: string) {
  return rateLimit({
    bucket: "site-preview-link",
    subjects: [`user:${userId}`],
    windows: LIMITS.siteAction,
    message: "Too many preview link requests. Wait a minute and try again.",
  })
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
 * somebody else's job and changes more often than this does. The address is
 * kept only when it is one of ours (previewBase in lib/website-builder/
 * preview-link.ts); a link carrying a real token never points elsewhere.
 */
function withToken(req: NextRequest, sent: unknown, token: string): string | null {
  if (typeof sent !== "string" || !sent) return null
  const base = previewBase(sent, { requestOrigin: req.nextUrl.origin, mainDomain: getMainDomain(), canonical: getCanonicalSiteUrl() })
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


export async function GET(req: NextRequest, { params }: Params) {
  const { installId } = await params
  const o = await owned(installId)
  if (o.error || !o.supabase) return NextResponse.json({ error: o.error }, { status: o.status })
  const limited = await limit(o.userId)
  if (limited) return limited
  const token = o.install.preview_token
  const base = req.nextUrl.searchParams.get("base")
  return NextResponse.json({ token, url: token ? withToken(req, base, token) : null })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { installId } = await params
  const o = await owned(installId)
  if (o.error || !o.supabase) return NextResponse.json({ error: o.error }, { status: o.status })
  const limited = await limit(o.userId)
  if (limited) return limited

  /* `{ base }` and nothing more, so a small cap: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.small)
  if (read.ok === false) return read.response
  const sent = read.invalid ? undefined : (read.json as { base?: unknown } | null)?.base

  const existing = o.install.preview_token
  if (existing) {
    return NextResponse.json({ token: existing, url: withToken(req, sent, existing), created: false })
  }

  const token = newPreviewToken()
  const { error } = await o.supabase.from("store_theme_installs").update({ preview_token: token }).eq("id", installId)
  if (error) {
    if (!/preview_token/.test(error.message)) console.error("[preview-link] failed", { code: error.code })
    return NextResponse.json({ error: /preview_token/.test(error.message) ? MIGRATION : "Could not make a preview link. Try again." }, { status: 503 })
  }
  return NextResponse.json({ token, url: withToken(req, sent, token), created: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { installId } = await params
  const o = await owned(installId)
  if (o.error || !o.supabase) return NextResponse.json({ error: o.error }, { status: o.status })
  const limited = await limit(o.userId)
  if (limited) return limited
  const { error } = await o.supabase.from("store_theme_installs").update({ preview_token: null }).eq("id", installId)
  if (error) {
    console.error("[preview-link] could not turn off", { code: error.code })
    return NextResponse.json({ error: "Could not turn the preview link off. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
