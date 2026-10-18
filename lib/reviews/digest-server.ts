import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS' OWN TWO EMAILS
 * ===========================================================================
 *   confirm   to whoever typed an address into a website's review form and
 *             has not bought the product: the link that posts their review
 *             (/review/confirm/<token>). Holding the inbox is the only
 *             proof a website review has, and it is not sent to the same
 *             address more than three times a day.
 *   digest    to the store, for its new website reviews: one email for
 *             several, at most one an hour, instead of one each. The bell
 *             still has each one (notify-seller.ts, `digest`).
 *
 * Both through the notification engine's provider and layout, so they look
 * like every other Storelib email. Neither ever throws.
 */
import { emailProvider } from "@/lib/notify/providers/mailgun"
import { renderHtml, renderText, type LayoutInput } from "@/lib/notify/templates/layout"
import { baseUrl as storelibBase } from "@/lib/notify/urls"
import { resolveSellerEmail } from "@/lib/email"
import { confirmPagePath, signDraft } from "./request-token"
import { mediaUrl } from "@/lib/storage/media-url"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const CONFIRMS_PER_ADDRESS_A_DAY = 3
/** A digest waits this long after the first review in it, so a few arrive together. */
export const DIGEST_WAIT_MS = 3_600_000

function render(input: Omit<LayoutInput, "homeUrl" | "family"> & { family?: LayoutInput["family"] }) {
  const layout: LayoutInput = { family: "base", homeUrl: storelibBase(), ...input }
  return { html: renderHtml(layout), text: renderText(layout) }
}

/** The confirm link, to the address a visitor typed. True when it went. */
export async function sendConfirmEmail(
  db: Db,
  draft: { id: string; email: string; creator_id: string; product_id?: string | null; product_title: string | null; store_name: string; rating?: number; title?: string | null; content?: string | null; page?: string | null },
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { count } = await db.from("review_drafts").select("id", { count: "exact", head: true }).eq("email", draft.email).gte("created_at", since)
    if ((count ?? 0) > CONFIRMS_PER_ADDRESS_A_DAY) return false
    const token = signDraft(draft.id)
    if (!token) return false
    /* Round AH: the page it was written on rides along, so posting it brings the buyer back there (lib/reviews/return-page). */
    const url = `${storelibBase()}${confirmPagePath(token)}${draft.page ? `?back=${encodeURIComponent(draft.page)}` : ""}`
    const product = (draft.product_title || "your purchase").trim()
    const subject = `Confirm your review of ${product}`.replace(/[\r\n]+/g, " ").slice(0, 200)
    /* What they wrote, so they know which review this is: the stars and the first lines. */
    const stars = draft.rating && draft.rating >= 1 && draft.rating <= 5 ? `${"★".repeat(draft.rating)}${"☆".repeat(5 - draft.rating)}` : ""
    const words = (draft.content || "").replace(/\s+/g, " ").trim()
    const excerpt = words.length > 220 ? `${words.slice(0, 217).trimEnd()}...` : words
    const quote = [stars, draft.title ? draft.title.trim() : "", excerpt ? `"${excerpt}"` : ""].filter(Boolean).join("\n")
    let imageUrl: string | null = null
    if (draft.product_id) {
      try {
        const { data: p } = await db.from("products").select("thumbnail_url").eq("id", draft.product_id).maybeSingle()
        const url = mediaUrl(p?.thumbnail_url ?? null)
        imageUrl = url && /^https:\/\//.test(url) ? url : null
      } catch {
        imageUrl = null
      }
    }
    const body = render({
      subject,
      preview: "One tap and your review goes up.",
      heading: "Post your review",
      media: { title: product, subtitle: draft.store_name, imageUrl },
      paragraphs: [`Thanks for reviewing ${product}. Tap the button and it goes up on ${draft.store_name}'s website.`, ...(quote ? [quote] : [])],
      action: { label: "Post my review", url },
      note: "If you didn't write this, ignore this email and nothing is posted. The link works for seven days.",
      reason: "You get this because this address was typed into a review form.",
    })
    const result = await emailProvider().send({
      to: draft.email,
      subject,
      html: body.html,
      text: body.text,
      headers: { "X-Storelib-Notification": "REVIEW_CONFIRM" },
      tags: ["storelib-reviews", "REVIEW_CONFIRM"],
      variables: { review_draft_id: draft.id },
      messageId: `<review-confirm.${draft.id}@storelib.com>`,
    })
    return result.status === "sent" || result.status === "unknown"
  } catch (e) {
    console.warn("[reviews] confirm email not sent:", e instanceof Error ? e.message.slice(0, 120) : "unknown")
    return false
  }
}

type Note = { id: string; creator_id: string; title: string | null; message: string | null; created_at: string; metadata: Record<string, unknown> | null }

/**
 * Each store's website reviews the bell has and no email has told it about
 * yet: one email per store, once the first of them is an hour old. Marked
 * sent (or with the error) so each is in one digest only.
 */
export async function sendReviewDigests(db: Db, now = Date.now()): Promise<number> {
  let sent = 0
  try {
    const since = new Date(now - 3 * 86_400_000).toISOString()
    const { data, error } = await db
      .from("seller_notifications")
      .select("id, creator_id, title, message, created_at, metadata")
      .eq("type", "new_review")
      .is("email_sent_at", null)
      .is("email_error", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(500)
    if (error) return 0
    const byStore = new Map<string, Note[]>()
    for (const n of (data ?? []) as Note[]) {
      if (n.metadata?.digest !== true) continue
      byStore.set(n.creator_id, [...(byStore.get(n.creator_id) ?? []), n])
    }
    for (const [creatorId, notes] of byStore) {
      if (Date.parse(notes[0].created_at) > now - DIGEST_WAIT_MS) continue
      const ids = notes.map((n) => n.id)
      const ok = await sendDigest(db, creatorId, notes)
      await db
        .from("seller_notifications")
        .update(ok ? { email_sent_at: new Date(now).toISOString() } : { email_error: "digest not sent" })
        .in("id", ids)
      if (ok) sent++
    }
  } catch (e) {
    console.warn("[reviews] digest stopped:", e instanceof Error ? e.message.slice(0, 120) : "unknown")
  }
  return sent
}

async function sendDigest(db: Db, creatorId: string, notes: Note[]): Promise<boolean> {
  try {
    const to = await resolveSellerEmail(db, creatorId)
    if (!to) return false
    const n = notes.length
    const waiting = notes.filter((x) => x.metadata?.pending === true).length
    const subject = n === 1 ? "A new review on your website" : `${n} new reviews on your website`
    const lines = notes.slice(0, 10).map((x) => `${x.title ?? "New review"}. ${x.message ?? ""}`.trim())
    if (n > 10) lines.push(`And ${n - 10} more.`)
    const body = render({
      family: "digest",
      subject,
      preview: waiting ? `${waiting} waiting for you to approve` : "See them in Reviews",
      heading: subject,
      paragraphs: [...lines, ...(waiting ? [`${waiting} of them wait for you to approve them.`] : [])],
      action: { label: "Open Reviews", url: `${storelibBase()}/app/reviews${waiting ? "?status=pending" : ""}` },
      reason: "You get this because Storelib Reviews is on for your website.",
    })
    const result = await emailProvider().send({
      to,
      subject,
      html: body.html,
      text: body.text,
      headers: { "X-Storelib-Notification": "REVIEW_DIGEST" },
      tags: ["storelib-reviews", "REVIEW_DIGEST"],
      variables: { creator_id: creatorId },
    })
    return result.status === "sent" || result.status === "unknown"
  } catch {
    return false
  }
}
