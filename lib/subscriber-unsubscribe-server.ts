/**
 * The server side of leaving a creator's list: who sent the email, the
 * page as an HTTP answer, and the GET both unsubscribe addresses share
 * (/unsubscribe and /api/email/unsubscribe). That GET only ever READS: it
 * finds the token, draws the creator, and asks. The write is the POST in
 * app/api/email/unsubscribe/route.ts. See lib/subscriber-unsubscribe-page.ts.
 */
import "server-only"

import { NextResponse } from "next/server"

import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { maskEmail, subscriberPage, type ListSender, type SubscriberPageState } from "@/lib/subscriber-unsubscribe-page"
import { createAdminClient } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
}

/** Per address, both the page and its button: far above a person, far below a script walking tokens. */
export const PAGE_LIMIT = [
  { limit: 30, seconds: 600 },
  { limit: 200, seconds: 86_400 },
] as const

export function pageResponse(state: SubscriberPageState, status = 200): NextResponse {
  return new NextResponse(subscriberPage(state), { status, headers: { ...PAGE_HEADERS, "Content-Type": "text/html; charset=utf-8" } })
}

export async function pageLimited(request: Request): Promise<boolean> {
  return (await rateLimit({ bucket: "subscriber-unsubscribe-page", subjects: [addressSubject(request)], windows: PAGE_LIMIT })) !== null
}

/** The creator as they are now: the website's logo or their photo (https only), and the store name. */
export async function loadListSender(db: Db, creatorId: string): Promise<ListSender> {
  try {
    const brand = await loadBrand(db, creatorId)
    return { name: brand.name, imageUrl: brand.logoUrl ?? brand.avatarUrl ?? null }
  } catch {
    return { name: "This sender", imageUrl: null }
  }
}

/** GET: find the token, and ask. Never writes. */
export async function answerUnsubscribeLink(request: Request): Promise<NextResponse> {
  if (await pageLimited(request)) return pageResponse({ kind: "limited" }, 429)
  const token = new URL(request.url).searchParams.get("token")
  if (!token) return pageResponse({ kind: "invalid" }, 400)

  const db = createAdminClient()
  const { data: subscriber, error } = await db
    .from("subscribers")
    .select("id, email, status, creator_id")
    .eq("unsubscribe_token", token)
    .maybeSingle()
  if (error || !subscriber) return pageResponse({ kind: "invalid" }, 400)

  const sender = await loadListSender(db, subscriber.creator_id)
  const maskedEmail = maskEmail(String(subscriber.email ?? ""))
  return pageResponse({ kind: subscriber.status === "unsubscribed" ? "already" : "confirm", token, sender, maskedEmail })
}
