/**
 * The page behind "View in browser" (./view-online.ts): the email drawn for
 * the reader the link was made for, or, for the campaign's own link, as it
 * went out (rendered_html, kept when the send started) and before that as it
 * will go. No open pixel, no click counter: the links go where they say, and
 * the unsubscribe link is the reader's own, so it works from here as it does
 * from the inbox. A draft has no page.
 */
import "server-only"

import { loadSender, prepareContent, previewEmail, type Db } from "./queue"
import { readStatus } from "./state"
import { readViewToken } from "./view-online"

export type ViewOnline = { ok: true; html: string; subject: string } | { ok: false }

type CampaignRow = { id: string; creator_id: string; subject: string | null; preview_text: string | null; body: string | null; status: string | null; from_name: string | null; rendered_html?: string | null }

const COLUMNS = "id, creator_id, subject, preview_text, body, status, from_name"

async function readCampaign(db: Db, id: string): Promise<CampaignRow | null> {
  /* rendered_html arrived with the sending schema; an older database reads without it. */
  const first = await db.from("email_campaigns").select(`${COLUMNS}, rendered_html`).eq("id", id).maybeSingle()
  if (!first.error) return (first.data as CampaignRow | null) ?? null
  const plain = await db.from("email_campaigns").select(COLUMNS).eq("id", id).maybeSingle()
  return (plain.data as CampaignRow | null) ?? null
}

export async function renderViewOnline(db: Db, token: unknown): Promise<ViewOnline> {
  const target = readViewToken(token)
  if (!target) return { ok: false }

  let reader: { name: string | null; email: string | null; unsubscribeToken: string | null } | null = null
  let campaignId = target.id
  if (target.kind === "recipient") {
    const { data: row } = await db.from("campaign_recipients").select("id, campaign_id, name, email, subscriber_id").eq("id", target.id).maybeSingle()
    if (!row) return { ok: false }
    campaignId = row.campaign_id
    let unsubscribeToken: string | null = null
    if (row.subscriber_id) {
      const { data: sub } = await db.from("subscribers").select("unsubscribe_token").eq("id", row.subscriber_id).maybeSingle()
      unsubscribeToken = typeof sub?.unsubscribe_token === "string" ? sub.unsubscribe_token : null
    }
    reader = { name: row.name ?? null, email: row.email ?? null, unsubscribeToken }
  }

  const campaign = await readCampaign(db, campaignId)
  if (!campaign || readStatus(campaign.status) === "draft") return { ok: false }
  const content = prepareContent(campaign)
  const subject = content.subject

  /* The campaign's own link: the copy kept when it went out, so a later logo or colour does not change it. */
  if (!reader && typeof campaign.rendered_html === "string" && campaign.rendered_html) return { ok: true, html: campaign.rendered_html, subject }

  const sender = await loadSender(db, campaign.creator_id, campaign.from_name)
  if (!sender) return { ok: false }
  return { ok: true, html: previewEmail(content, sender, reader ?? undefined), subject }
}
