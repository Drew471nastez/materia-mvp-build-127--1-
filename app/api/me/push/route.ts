import { NextResponse } from "next/server"

import { rateLimit } from "@/lib/api/rate-limit"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { scheduleWeeklyDigest } from "@/lib/communities/server/notify"
import { deviceCount, readChoice, readPushEnabled, saveChoice, setPushEnabled } from "@/lib/notifications/push-bridge"
import { applyNotifyChange, communityKindStates, emailStates, kindStates, type NotifyChoice } from "@/lib/notifications/push-kinds"
import { setPreference } from "@/lib/notify/preferences"
import { signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }
/** Communities listed in Settings: the ones visited last first. */
const COMMUNITIES_SHOWN = 30

/**
 * ===========================================================================
 *  SETTINGS, NOTIFICATIONS: THE PERSON'S OWN CHOICES
 * ===========================================================================
 * Whether what happens in my communities and from people I follow or bought
 * from also reaches my phone (the Storelib app) and any browser I turned
 * notifications on for (lib/notifications/push-bridge.ts), which kinds,
 * where, when, and which emails I asked for. Only ever the signed in
 * person's own settings.
 *
 *   GET    { enabled, devices, kinds, emails, moderates, quiet, tz, communities }
 *          devices: phones and browsers registered to this account (0: the
 *          switch has nowhere to send yet). kinds: each push kind on or off
 *          (lib/notifications/push-kinds.ts). emails: { report_digest,
 *          weekly_digest }. moderates: whether they review reports anywhere,
 *          so Settings only offers the report email to someone who would get
 *          it. quiet: { from, to } minutes or null. communities: the ones they
 *          are active in (at most COMMUNITIES_SHOWN, none while communities
 *          are off), each { id, name, slug, logoUrl, level, kinds }.
 *   PATCH  { enabled: boolean } -> { ok, enabled }
 *          503 { error: "not_set_up" } before part 86 has run
 *   PATCH  { push?, community?, email?, quiet?, tz? } (push-kinds.ts
 *          applyNotifyChange) -> { ok, kinds, emails, quiet, tz }, kept on the
 *          account (app_metadata). Turning the weekly digest on queues its
 *          first email and turns its email category ("tips") back on, in case
 *          an unsubscribe link had turned it off.
 */
export async function GET() {
  const userId = await sessionUserId()
  if (!userId) return signedOutOrRetry(NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE }))
  const db = admin()
  const [enabled, devices, choice, moderates, on] = await Promise.all([readPushEnabled(db, userId), deviceCount(db, userId), readChoice(db, userId), reviewsReports(db, userId), communitiesEnabled().catch(() => false)])
  const communities = on ? await myCommunities(db, userId, choice) : []
  if (choice.emailOn.includes("weekly_digest")) await scheduleWeeklyDigest(db, userId, choice.tz).catch(() => undefined)
  return NextResponse.json({ enabled, devices, kinds: kindStates(choice), emails: emailStates(choice), moderates, quiet: choice.quiet, tz: choice.tz, communities }, { headers: NO_STORE })
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

/** The communities they are active in, with their level there and their kinds there. Two reads. */
async function myCommunities(db: ReturnType<typeof admin>, userId: string, choice: NotifyChoice) {
  try {
    const { data: rows, error } = await db
      .from("community_members")
      .select("community_id, notify_level, last_active_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(COMMUNITIES_SHOWN)
    const list = (rows as { community_id: string; notify_level: string | null }[] | null) ?? []
    if (error || !list.length) return []
    const ids = list.map((r) => r.community_id)
    const { data: cs } = await db.from("communities").select("id, name, slug, logo_url, status, suspended_at, deleted_at").in("id", ids)
    const byId = new Map(((cs as { id: string; name: string; slug: string; logo_url: string | null; status: string; suspended_at: string | null; deleted_at: string | null }[] | null) ?? []).map((c) => [c.id, c]))
    return list
      .map((r) => ({ r, c: byId.get(r.community_id) }))
      .filter(({ c }) => c && !c.deleted_at && !c.suspended_at && c.status !== "suspended")
      .map(({ r, c }) => ({ id: c!.id, name: c!.name, slug: c!.slug, logoUrl: c!.logo_url, level: r.notify_level || "important", kinds: communityKindStates(choice, c!.id) }))
  } catch {
    return []
  }
}

export async function PATCH(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return signedOutOrRetry(NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE }))
  const limited = await rateLimit({ bucket: "me-push", subjects: [`user:${userId}`], windows: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 86400 }], message: "Too many changes at once. Try again in a minute." })
  if (limited) return limited
  const body = await readJson(request)
  if (body.push !== undefined || body.email !== undefined || body.community !== undefined || body.quiet !== undefined || body.tz !== undefined) {
    const db = admin()
    const before = await readChoice(db, userId)
    const next = applyNotifyChange(before, body)
    if (!next) return NextResponse.json({ error: "Send what to change: kinds true or false, quiet hours, or a time zone." }, { status: 400, headers: NO_STORE })
    if (!(await saveChoice(db, userId, next))) return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500, headers: NO_STORE })
    if (next.emailOn.includes("weekly_digest") && !before.emailOn.includes("weekly_digest")) {
      await setPreference(db, userId, "tips", "email", true, "settings").catch(() => undefined)
      await scheduleWeeklyDigest(db, userId, next.tz).catch(() => undefined)
    }
    return NextResponse.json({ ok: true, kinds: kindStates(next), emails: emailStates(next), quiet: next.quiet, tz: next.tz }, { headers: NO_STORE })
  }
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Send enabled: true or false." }, { status: 400, headers: NO_STORE })
  const saved = await setPushEnabled(admin(), userId, body.enabled)
  if (saved === "not_set_up") return NextResponse.json({ error: "not_set_up" }, { status: 503, headers: NO_STORE })
  if (saved !== "saved") return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ ok: true, enabled: body.enabled }, { headers: NO_STORE })
}
