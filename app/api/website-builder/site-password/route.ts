/**
 * ===========================================================================
 *  "PASSWORD PROTECT" IN WEBSITE SETTINGS
 * ===========================================================================
 * GET    whether the signed in creator's website asks for a password, and
 *        whether one is set. Never the password and never its hash.
 * POST   `{ enabled?, password? }`: on or off, a new password, or both. A
 *        new password ends every visitor's pass made for the old one.
 *
 * Takes effect at once, like Shopify's own switch, not with the next
 * publish: it is not part of the website's design, it is who may see it.
 * The website is the signed in user's own creator's, found from the session
 * and never from the request (lib/site-password/store.ts writes with the
 * service key, so this check is the access control).
 */
import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanPassword, hashPassword, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/site-password/hash"
import { publicAccess, readSiteAccess, saveSiteAccess } from "@/lib/site-password/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/* The owner, or a team member with Website working in the store (lib/team/website). */
async function me(): Promise<{ userId: string; creatorId: string } | NextResponse> {
  const site = await websiteCaller()
  if (site.error !== null) return json({ error: site.status === 401 ? "Sign in again." : site.error }, site.status)
  return { userId: site.userId, creatorId: site.creatorId }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

export async function GET() {
  const who = await me()
  if (who instanceof NextResponse) return who
  return json(publicAccess(await readSiteAccess(createAdminClient(), who.creatorId)))
}

export async function POST(req: Request) {
  const who = await me()
  if (who instanceof NextResponse) return who
  const limited = await rateLimit({
    bucket: "site-password-settings",
    subjects: [`user:${who.userId}`],
    windows: [{ limit: 20, seconds: 600 }],
    message: "Too many changes at once. Wait a minute and try again.",
  })
  if (limited) return limited

  let body: { enabled?: unknown; password?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  const change: { enabled?: boolean; hash?: string } = {}
  if (typeof body.enabled === "boolean") change.enabled = body.enabled
  if (body.password !== undefined && body.password !== null && body.password !== "") {
    const pw = cleanPassword(body.password)
    if (!pw) return json({ error: `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.` }, 400)
    change.hash = await hashPassword(pw)
  }
  if (change.enabled === undefined && change.hash === undefined) return json({ error: "Nothing to change." }, 400)

  const saved = await saveSiteAccess(createAdminClient(), who.creatorId, change)
  if (saved.ok === false) {
    if (saved.why === "needs_password") return json({ error: "Set a password first." }, 400)
    if (saved.why === "unavailable") return json({ error: "Password protection is not set up on Storelib yet." }, 503)
    return json({ error: "That did not save. Try again." }, 500)
  }
  return json(publicAccess(saved.access))
}
