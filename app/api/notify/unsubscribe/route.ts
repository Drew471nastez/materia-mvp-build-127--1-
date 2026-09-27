import { type NextRequest, NextResponse } from "next/server"

import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { setPreference } from "@/lib/notify/preferences"
import { infoFor } from "@/lib/notify/preference-view"
import { page, readRequest, type PageState, type UnsubscribeAction } from "@/lib/notify/unsubscribe-page"
import { preferencesUrl, verifyReviewUnsubscribe, verifyUnsubscribe } from "@/lib/notify/unsubscribe"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ONE CATEGORY OF EMAIL OFF FROM A LINK, OR BACK ON
 * ===========================================================================
 * The link in an optional or marketing email from the notification engine
 * (lib/notify/unsubscribe.ts signs it). The creators' own subscriber lists
 * have their own route, app/api/email/unsubscribe, and this one does not
 * touch them.
 *
 *   GET   ?token=   changes nothing: it answers a small page naming the
 *                   emails with one button that turns them off. Mail
 *                   security scanners open every link in an email, and a
 *                   GET that unsubscribed would turn people's email off
 *                   without them. The mail client's own unsubscribe button
 *                   is the one-click POST below and needs no page.
 *   POST            the RFC 8058 one-click (form body
 *                   "List-Unsubscribe=One-Click", token in the query),
 *                   JSON {token, action: "unsubscribe" | "resubscribe"},
 *                   or the page's own button as a form
 *
 * The write is preferences.ts setPreference with the source
 * "unsubscribe_link", so notification_preferences says where the choice
 * came from. Limited per address; the answer never names an email address.
 *
 * A REVIEW REQUEST's link names its order instead of a person (a buyer has
 * no account to hold a preference): the order's address is added to
 * email_suppressions with the scope "review_requests", and taken off again
 * by the page's "Turn them back on". Nothing else sent to that address
 * changes (lib/notify/unsubscribe.ts, lib/reviews/request-rules).
 */

const REVIEW_EMAILS = "review request emails"

async function applyReview(orderId: string, action: UnsubscribeAction): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: order } = await admin.from("orders").select("buyer_email").eq("id", orderId).maybeSingle()
    const email = typeof order?.buyer_email === "string" ? order.buyer_email.trim().toLowerCase() : ""
    if (!email.includes("@")) return false
    const now = new Date().toISOString()
    const write = (scope: string) =>
      action === "resubscribe"
        ? admin.from("email_suppressions").update({ lifted_at: now, updated_at: now }).eq("email", email).eq("scope", scope)
        : admin.from("email_suppressions").upsert({ email, scope, reason: "unsubscribe", source: "review_link", lifted_at: null, updated_at: now }, { onConflict: "email,scope" })
    const { error } = await write("review_requests")
    /* Before run-now part 52 the scope is refused (23514): an unsubscribe still has to hold, so it is the wider "optional" one. */
    if (error && action === "unsubscribe" && error.code === "23514") return !(await write("optional")).error
    return !error
  } catch (err) {
    console.error(`[notify-unsubscribe] review request choice not saved (${err instanceof Error ? err.message.slice(0, 120) : "unknown"})`)
    return false
  }
}

const LIMIT = [
  { limit: 20, seconds: 600 },
  { limit: 100, seconds: 86_400 },
] as const

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
}

function html(state: PageState, status = 200) {
  return new NextResponse(page(state), { status, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } })
}

async function apply(userId: string, category: Parameters<typeof setPreference>[2], action: UnsubscribeAction): Promise<boolean> {
  try {
    await setPreference(createAdminClient(), userId, category, "email", action === "resubscribe", "unsubscribe_link")
    return true
  } catch (err) {
    console.error(`[notify-unsubscribe] could not save (${err instanceof Error ? err.message.slice(0, 120) : "unknown"})`)
    return false
  }
}

export async function GET(request: NextRequest) {
  const prefs = preferencesUrl()
  const limited = await rateLimit({ bucket: "notify-unsubscribe", subjects: [addressSubject(request)], windows: LIMIT })
  if (limited) return html({ kind: "limited", preferencesUrl: prefs }, 429)

  const token = request.nextUrl.searchParams.get("token")
  if (token && verifyReviewUnsubscribe(token)) return html({ kind: "confirm", emails: REVIEW_EMAILS, token, preferencesUrl: prefs })
  const ok = verifyUnsubscribe(token)
  const info = ok ? infoFor(ok.category) : null
  if (!ok || !info || !token) return html({ kind: "invalid", preferencesUrl: prefs }, 400)

  return html({ kind: "confirm", emails: info.emails, token, preferencesUrl: prefs })
}

export async function POST(request: NextRequest) {
  const prefs = preferencesUrl()
  const limited = await rateLimit({ bucket: "notify-unsubscribe", subjects: [addressSubject(request)], windows: LIMIT })
  const req = await readRequest(request)
  if (limited) return req.mode === "form" ? html({ kind: "limited", preferencesUrl: prefs }, 429) : limited

  const review = verifyReviewUnsubscribe(req.token)
  if (review && req.token) {
    const saved = await applyReview(review.orderId, req.action)
    if (req.mode === "form") {
      if (!saved) return html({ kind: "error", preferencesUrl: prefs }, 500)
      return html({ kind: req.action === "resubscribe" ? "on" : "off", emails: REVIEW_EMAILS, token: req.token, preferencesUrl: prefs })
    }
    if (!saved) return NextResponse.json({ error: "That did not save. Try again." }, { status: 500, headers: HEADERS })
    return NextResponse.json(req.mode === "one_click" ? { ok: true } : { ok: true, reviewRequests: req.action === "resubscribe" }, { headers: HEADERS })
  }

  const ok = verifyUnsubscribe(req.token)
  const info = ok ? infoFor(ok.category) : null
  if (!ok || !info || !req.token) {
    return req.mode === "form"
      ? html({ kind: "invalid", preferencesUrl: prefs }, 400)
      : NextResponse.json({ error: "This link does not work." }, { status: 400, headers: HEADERS })
  }

  const saved = await apply(ok.userId, ok.category, req.action)
  if (req.mode === "form") {
    if (!saved) return html({ kind: "error", preferencesUrl: prefs }, 500)
    return html({ kind: req.action === "resubscribe" ? "on" : "off", emails: info.emails, token: req.token, preferencesUrl: prefs })
  }
  if (!saved) return NextResponse.json({ error: "That did not save. Try again." }, { status: 500, headers: HEADERS })
  /* One click wants a 200 and nothing it has to read; the JSON caller wants what changed. */
  return NextResponse.json(
    req.mode === "one_click" ? { ok: true } : { ok: true, category: ok.category, emailEnabled: req.action === "resubscribe" },
    { headers: HEADERS },
  )
}
