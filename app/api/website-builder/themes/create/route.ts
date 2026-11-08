import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { createStartWebsite, isStartMode } from "@/lib/website-builder/create-website"
import { coverForNewWebsite, renderOrigin } from "@/lib/website-builder/cover-take"

export const runtime = "nodejs"
/** The website is made at once, and photographed within QUICK_COVER_MS when a browser is that quick, as Add does. */
export const maxDuration = 60

/**
 * POST /api/website-builder/themes/create   body: { mode: "ai" | "blank", name?: string }
 *
 * The Website page's Start with AI and Start from blank: a new Storelib
 * Default website, as a draft, whose home page is only its header and
 * footer. The editor then opens on it; with AI, the Ask panel there sends
 * the creator's description (lib/website-builder/start-handoff.ts). See
 * lib/website-builder/create-website.ts for what is written and why Add
 * theme is not used.
 *
 * The same people as Add: the owner, or a team member with Website working
 * in the store (lib/team/website). The same library limit and refusal.
 */
export async function POST(req: Request) {
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, creator } = site

  /* A press each, never a stream: LIMITS.siteAction. */
  const limited = await rateLimit({
    bucket: "site-create",
    subjects: [`user:${site.userId}`],
    windows: LIMITS.siteAction,
    message: "Too many new websites in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const mode: unknown = body?.mode
  if (!isStartMode(mode)) return NextResponse.json({ error: "mode must be ai or blank" }, { status: 400 })
  if (body?.name !== undefined && body?.name !== null && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be text" }, { status: 400 })
  }

  const made = await createStartWebsite({ supabase, admin: createAdminClient() }, { creatorId: creator.id as string, mode, name: body?.name })
  if (!made.ok) {
    return NextResponse.json(made.code ? { error: made.error, code: made.code } : { error: made.error }, { status: made.status })
  }

  /* Its first picture, as Add takes it: a photograph when it is quick, else pending and the page looks for it. */
  const first = await coverForNewWebsite({ installId: made.install.id, userId: site.ownerUserId, creatorId: creator.id as string }, renderOrigin(req.url), "create", null)

  return NextResponse.json({ install: made.install, ...first })
}
