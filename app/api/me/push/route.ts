import { NextResponse } from "next/server"

import { rateLimit } from "@/lib/api/rate-limit"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { deviceCount, readChoice, readPushEnabled, saveChoice, setPushEnabled } from "@/lib/notifications/push-bridge"
import { applyNotifyChange, kindStates } from "@/lib/notifications/push-kinds"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * ===========================================================================
 *  THE PUSH SWITCH IN ACCOUNT SETTINGS
 * ===========================================================================
 * Whether what happens in my communities and from people I follow or bought
 * from also reaches my phone (the Storelib app) and any browser I turned
 * notifications on for (lib/notifications/push-bridge.ts). On unless turned
 * off. Kept in notification_preferences, category "social", channel "push"
 * (part 86). Sales and payout pushes to a creator are not this switch.
 *
 *   GET    { enabled, devices, kinds, emails, moderates }
 *          devices: phones and browsers registered to this account (0: the
 *          switch has nowhere to send yet). kinds: each push kind on or off
 *          (lib/notifications/push-kinds.ts). emails: { report_digest }.
 *          moderates: whether they review reports anywhere, so Settings only
 *          offers the report email to someone who would get it.
 *   PATCH  { enabled: boolean } -> { ok, enabled }
 *          503 { error: "not_set_up" } before part 86 has run
 *   PATCH  { push: { likes: false }, email: { report_digest: true } }
 *          -> { ok, kinds, emails }, kept on the account (app_metadata)
 *
 * Only ever the signed in person's own setting.
 */
export async function GET() {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const db = admin()
  const [enabled, devices, choice, moderates] = await Promise.all([readPushEnabled(db, userId), deviceCount(db, userId), readChoice(db, userId), reviewsReports(db, userId)])
  return NextResponse.json({ enabled, devices, kinds: kindStates(choice), emails: { report_digest: !choice.emailOff.includes("report_digest") }, moderates }, { headers: NO_STORE })
}

/** Whether this person is staff who reviews reports in any community they are active in. */
async function reviewsReports(db: ReturnType<typeof admin>, userId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("community_members").select("id").eq("user_id", userId).eq("status", "active").in("role", ["owner", "admin", "moderator"]).limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

export async function PATCH(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "me-push", subjects: [`user:${userId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 200, seconds: 86400 }], message: "Too many changes at once. Try again in a minute." })
  if (limited) return limited
  const body = await readJson(request)
  if (body.push !== undefined || body.email !== undefined) {
    const db = admin()
    const next = applyNotifyChange(await readChoice(db, userId), body)
    if (!next) return NextResponse.json({ error: "Send the kinds to change, each true or false." }, { status: 400, headers: NO_STORE })
    if (!(await saveChoice(db, userId, next))) return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500, headers: NO_STORE })
    return NextResponse.json({ ok: true, kinds: kindStates(next), emails: { report_digest: !next.emailOff.includes("report_digest") } }, { headers: NO_STORE })
  }
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Send enabled: true or false." }, { status: 400, headers: NO_STORE })
  const saved = await setPushEnabled(admin(), userId, body.enabled)
  if (saved === "not_set_up") return NextResponse.json({ error: "not_set_up" }, { status: 503, headers: NO_STORE })
  if (saved !== "saved") return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ ok: true, enabled: body.enabled }, { headers: NO_STORE })
}
