/**
 * ===========================================================================
 *  ONE EMAIL'S PAGE: WHAT IT SAID, AND WHAT HAPPENED TO IT
 * ===========================================================================
 * GET, for the email's page on /app/emails (app/app/emails/email-detail.tsx):
 *
 *   the email     subject, preview text, status, audience, times
 *   the numbers   read from the send's own rows (campaign_recipients), not
 *                 estimated: accepted by the provider, delivered, opened,
 *                 clicked, bounced, complained, unsubscribed, and any that
 *                 may not have arrived
 *   the links     the most clicked, with clicks and how many people
 *   the email     as it went out (kept when the send started), or as it
 *                 would go now, for a draft or before the SQL has run:
 *                 HTML the renderer wrote, drawn by the page in a sandbox
 *
 * Only the creator's own email, checked with the creator id from the
 * session before anything is read with the service role. No address of any
 * reader is in the answer.
 */
import { NextResponse } from "next/server"
import { isResponse, noStore, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"
import { countRecipients, isModernSchema, lastFailure, loadSender, prepareContent, previewEmail } from "@/lib/email-campaigns/queue"
import { readStatus } from "@/lib/email-campaigns/state"
import { viewOnlineUrl } from "@/lib/email-campaigns/view-online"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BASE = "id, subject, preview_text, body, status, audience_type, segment_id, audience_count, scheduled_at, sent_at, created_at, updated_at, from_name"
const MODERN = `${BASE}, last_error, completed_at, track_opens, rendered_html`
/** The provider took it: whatever happened after, it went out. */
const WENT_OUT = ["sent", "delivered", "bounced", "complained"]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const r = await q
  return r.error ? 0 : r.count ?? 0
}

/** The most clicked links, from the click records, read in pages up to a ceiling that no real email reaches. */
async function topLinks(db: Db, campaignId: string) {
  const byUrl = new Map<string, { clicks: number; people: Set<string> }>()
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .from("email_events")
      .select("url, recipient_id")
      .eq("campaign_id", campaignId)
      .eq("event_type", "clicked")
      .order("created_at", { ascending: true })
      .range(from, from + 999)
    if (error || !data) break
    for (const e of data as { url: string | null; recipient_id: string | null }[]) {
      if (!e.url) continue
      const cur = byUrl.get(e.url) ?? { clicks: 0, people: new Set<string>() }
      cur.clicks++
      if (e.recipient_id) cur.people.add(e.recipient_id)
      byUrl.set(e.url, cur)
    }
    if (data.length < 1000) break
  }
  return [...byUrl.entries()]
    .map(([url, v]) => ({ url, clicks: v.clicks, people: v.people.size }))
    .sort((a, b) => b.people - a.people || b.clicks - a.clicks)
    .slice(0, 8)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const db = ctx.admin
  const modern = await isModernSchema(db)

  const { data: c } = await db.from("email_campaigns").select(modern ? MODERN : BASE).eq("id", id).eq("creator_id", ctx.creatorId).maybeSingle()
  if (!c) return NextResponse.json({ error: "This email was not found. It may have been deleted." }, { status: 404 })
  const status = readStatus(c.status)
  const started = !["draft", "scheduled"].includes(status)

  const recipients = () => db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id)
  const [counts, opened, clicked, complained, unsubscribedRows, links, sender] = await Promise.all([
    started ? countRecipients(db, id) : Promise.resolve(null),
    started ? count(recipients().in("status", WENT_OUT).not("opened_at", "is", null)) : Promise.resolve(0),
    started ? count(recipients().in("status", WENT_OUT).not("clicked_at", "is", null)) : Promise.resolve(0),
    started ? count(recipients().eq("status", "complained")) : Promise.resolve(0),
    started
      ? db
          .from("email_events")
          .select("recipient_id, email")
          .eq("campaign_id", id)
          .eq("event_type", "unsubscribed")
          .limit(10_000)
          .then((r: { data: { recipient_id: string | null; email: string | null }[] | null }) => r.data ?? [])
      : Promise.resolve([] as { recipient_id: string | null; email: string | null }[]),
    started ? topLinks(db, id) : Promise.resolve([]),
    loadSender(db, ctx.creatorId, c.from_name),
  ])

  /* One person unsubscribing twice is one unsubscribe. The address is only used to tell people apart here. */
  const unsubscribed = new Set((unsubscribedRows as { recipient_id: string | null; email: string | null }[]).map((r) => r.recipient_id ?? (r.email ?? "").toLowerCase()).filter(Boolean)).size

  let html: string | null = modern && typeof c.rendered_html === "string" && c.rendered_html ? c.rendered_html : null
  if (!html && sender) html = previewEmail(prepareContent(c), sender)
  const lastError = modern ? (c.last_error ?? null) : counts && counts.failed > 0 ? await lastFailure(db, id) : null

  return NextResponse.json(
    {
      campaign: {
        id: c.id,
        subject: c.subject ?? "",
        preview_text: c.preview_text ?? "",
        status,
        audience_type: c.audience_type ?? "all",
        segment_id: c.segment_id ?? null,
        audience_count: c.audience_count ?? 0,
        scheduled_at: c.scheduled_at ?? null,
        sent_at: c.sent_at ?? null,
        completed_at: modern ? (c.completed_at ?? null) : null,
        created_at: c.created_at ?? null,
        updated_at: c.updated_at ?? null,
        track_opens: modern ? c.track_opens !== false : true,
        last_error: lastError,
      },
      counts,
      stats: counts
        ? {
            sent: counts.sent + counts.delivered + counts.bounced,
            delivered: counts.delivered,
            bounced: Math.max(0, counts.bounced - complained),
            complained,
            opened,
            clicked,
            unsubscribed,
            failed: counts.failed,
            unknown: counts.unknown,
            skipped: counts.skipped,
            waiting: counts.pending + counts.sending,
          }
        : null,
      links,
      html,
      /* The email's public page (View in browser) once it is scheduled or sent; a draft has none. */
      view_url: status === "draft" ? null : viewOnlineUrl({ kind: "campaign", id: c.id }),
      sender: sender ? { name: sender.name, from: sender.from, replyTo: sender.replyTo, address: sender.brand.address } : null,
      upgraded: modern,
    },
    { headers: noStore },
  )
}
