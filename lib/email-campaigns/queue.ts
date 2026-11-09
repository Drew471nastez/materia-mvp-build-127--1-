/**
 * ===========================================================================
 *  HOW A CAMPAIGN GETS FROM "SEND" TO EVERY INBOX, EXACTLY ONCE
 * ===========================================================================
 * Postgres is the queue. Nothing here keeps state in memory that another
 * instance would need, because on Vercel the next request is often another
 * instance.
 *
 * 1. START (startSend). The route checks the content, the account and the
 *    audience, then moves the campaign draft|scheduled -> queued with one
 *    conditional UPDATE ... WHERE status IN (draft, scheduled). A second
 *    click, a second tab or the cron racing a click gets no row back and is
 *    told the send is already under way. Only the winner writes recipient
 *    rows, one per address, under a unique (campaign_id, email) index, so
 *    even a retried insert cannot add an address twice.
 *
 * 2. WORK (processCampaign). Whoever sends holds the campaign's lease: its
 *    updated_at, advanced with a compare-and-set on every batch. A worker
 *    that finds updated_at moved since it last wrote has lost the lease and
 *    stops. A lease nobody has renewed for LEASE_MS is free for the cron.
 *
 *    Each batch of recipients is claimed row by row, pending -> sending,
 *    WHERE status = 'pending', before the provider is called. A row that is
 *    sent is marked sent with the provider's message id and is never
 *    selected again. A 429, a 5xx or a connection that never opened puts the
 *    row back to pending with a later next_attempt_at; a refusal marks it
 *    failed with the reason.
 *
 *    NEVER TWICE. A request that left and got no answer (a timeout), and a
 *    row a worker left in `sending` when it died, may already be in the
 *    reader's inbox. Neither is sent again: the row becomes `unknown` and
 *    the creator is told how many may not have arrived. A retry is only ever
 *    of a row the provider certainly did not take.
 *
 *    The subscriber is read again just before each batch: somebody who
 *    unsubscribed after Send was pressed is skipped, not mailed.
 *
 * 3. FINISH (finalize). When nothing is pending or sending, the campaign
 *    moves sending -> sent | partially_failed | failed, again conditionally,
 *    with the count of what went out and the last reason something did not.
 *
 * The send route starts step 2 in after(), inside its own time budget, and
 * the hourly cron (app/api/cron/process-scheduled-emails) starts due
 * scheduled campaigns and picks up anything a worker left behind.
 *
 * BEFORE THE MIGRATION (supabase/sql/RUN_EMAIL_SENDING.sql) the database
 * only knows the five old campaign statuses and none of the new columns.
 * This still sends: queued is written as sending, the campaign lease alone
 * keeps one worker per campaign, and a temporary failure is retried inside
 * the run instead of later. Nothing crashes; it is just less patient.
 */
import { segmentMemberIds } from "./segments-server"
import "server-only"

import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/mail"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { mailgunDomain, sendMailgunOnce, type MailgunOnceResult } from "@/lib/mailgun"
import { maskEmail } from "@/lib/privacy/mask-email"
import { verifiedSender } from "@/lib/emails/sending-domain-server"
import { ownFrom } from "@/lib/emails/sending-domain"
import { scoreSignup } from "@/lib/security/spam-signals"
import { APP_URL, unsubscribeUrlFor } from "@/lib/email-automation"
import { normalizeAddress, safeDisplayName } from "./address"
import { byteLength, checkContent, cleanPreview, cleanSubject, type Problem } from "./validate"
import { imageCount, visibleText } from "./sanitize"
import { buildEmail, emailText, personalizeHtml, personalizeSubject, unknownMergeFields } from "./template"
import { afterAttempt, MAX_ATTEMPTS, nextAttemptAt, plainReason, UNCERTAIN_REASON } from "./retry"
import { PLAIN_THEME, renderBlocks, type Block } from "./blocks"
import { readStoredBody } from "./stored"
import { themeOf, type Brand } from "./brand"
import { loadBrand } from "./brand-server"
import { trackLinks } from "./link-sign"
import { viewOnlineUrl } from "./view-online"
import { esc } from "./rich"
import { fitsPlan, monthlyLimit, monthStart } from "./limits"
import {
  EMPTY_COUNTS,
  finalStatus,
  outstanding,
  readStatus,
  storedStatus,
  wentOut,
  type CampaignStatus,
  type RecipientCounts,
} from "./state"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

/** A worker that has not renewed its lease for this long is presumed gone. */
export const LEASE_MS = 120_000
/** A recipient claimed this long ago and never answered is tried again. */
export const STALE_CLAIM_MS = 180_000
const BATCH = 12
const PARALLEL = 4
const LEGACY_TRIES = 3
const INSERT_CHUNK = 500

/* ─── Which database this is ─────────────────────────────────────────── */

let schemaCache: { modern: boolean; at: number } | null = null

/**
 * True once RUN_EMAIL_SENDING.sql has been run. Read from the database and
 * remembered for a minute, so the first request after the migration uses it
 * without a deploy. Nothing is locked on this; it only picks which columns
 * to write.
 */
export async function isModernSchema(db: Db): Promise<boolean> {
  if (schemaCache && Date.now() - schemaCache.at < 60_000) return schemaCache.modern
  const [a, b] = await Promise.all([
    db.from("email_campaigns").select("id, last_error, send_idempotency_key, completed_at, track_opens, rendered_html").limit(1),
    db.from("campaign_recipients").select("id, attempts, next_attempt_at, claimed_at").limit(1),
  ])
  const modern = !a.error && !b.error
  schemaCache = { modern, at: Date.now() }
  return modern
}

/** For tests: forget what was read. */
export function resetSchemaCache(modern?: boolean) {
  schemaCache = modern === undefined ? null : { modern, at: Date.now() }
}

function isCheckViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23514"
}

/* ─── Who is sending ─────────────────────────────────────────────────── */

export interface Sender {
  creatorId: string
  userId: string
  name: string
  from: string
  replyTo: string
  avatarUrl: string | null
  username: string | null
  accountEmail: string | null
  planId: string | null
  planStatus: string | null
  blocked: boolean
  /** The store's name, logo, colour and address, as they are now. */
  brand: Brand
  /** The store's own verified domain (lib/emails/sending-domain-server.ts) when `from` is on it; else Storelib's. */
  sendingDomain: string | null
}

function fromAddress(): string {
  const m = EMAIL_FROM.match(/<(.+)>/)
  return (m ? m[1] : EMAIL_FROM).trim()
}

/**
 * Campaign mail is From our verified domain, with the creator's name in
 * front and their own address as Reply-To, unless the store has verified a
 * domain of its own with Mailgun (Emails › Platforms): then From is that
 * address and the message goes through that domain, signed with its DKIM.
 * An unverified domain of the creator's is never sent as: it would fail
 * DMARC and teach every inbox to distrust both of us.
 */
export async function loadSender(db: Db, creatorId: string, fromName?: string | null): Promise<Sender | null> {
  const { data: creator } = await db
    .from("creators")
    .select("id, user_id, support_email, slug, headline, subscription_plan_id, subscription_status")
    .eq("id", creatorId)
    .maybeSingle()
  if (!creator) return null
  const { data: profile } = await db
    .from("profiles")
    .select("email, display_name, username, avatar_url")
    .eq("id", creator.user_id)
    .maybeSingle()
  const name = safeDisplayName(fromName || profile?.display_name || profile?.username || creator.headline || creator.slug, "Storelib")
  /*
    Replies reach the person, which for a second business is the owner's own
    inbox and never the tag Storelib made up (lib/businesses/email-alias.ts
    ownerAddress): deliverable on any provider, and the same string the
    composer shows for "replies go to". An account made for a phone sign in
    has no inbox at all, so that falls through to Storelib's own address
    rather than to a name that bounces.
  */
  const replyTo = normalizeAddress(creator.support_email) || normalizeAddress(ownerAddress(profile?.email)) || EMAIL_REPLY_TO
  const verdict = scoreSignup({ handle: profile?.username, email: profile?.email, displayName: profile?.display_name })
  const brand = await loadBrand(db, creatorId)
  const own = await verifiedSender(db, creatorId)
  return {
    creatorId,
    userId: creator.user_id,
    name,
    from: own ? ownFrom(name, own.address) : `${name} <${fromAddress()}>`,
    sendingDomain: own?.domain ?? null,
    replyTo,
    /* The photo on this business's profile as it is now, read when the send starts (brand-server loadBrand). */
    avatarUrl: brand.avatarUrl,
    username: profile?.username ?? null,
    accountEmail: normalizeAddress(profile?.email),
    planId: creator.subscription_plan_id ?? null,
    planStatus: creator.subscription_status ?? null,
    blocked: verdict.blocked,
    brand: { name: brand.name, logoUrl: brand.logoUrl, storeUrl: brand.storeUrl, accent: brand.accent, address: brand.address },
  }
}

/* ─── Content ────────────────────────────────────────────────────────── */

export interface PreparedContent {
  subject: string
  previewText: string
  /** The email's blocks, read back out of the saved draft. */
  blocks: Block[]
  /** Those blocks as email HTML in the plain look, for the checks. The send renders them again in the brand's. */
  body: string
  errors: Problem[]
  warnings: Problem[]
}

/**
 * The saved draft as the send sees it. The body is never sent as saved: its
 * blocks are read back out (lib/email-campaigns/stored.ts) and rendered by
 * this code, so whatever a browser put in the column, what goes out is HTML
 * the renderer wrote.
 */
export function prepareContent(input: { subject?: unknown; preview_text?: unknown; body?: unknown }): PreparedContent {
  const subject = cleanSubject(input.subject)
  const previewText = cleanPreview(input.preview_text)
  const blocks = readStoredBody(typeof input.body === "string" ? input.body : "").blocks
  const body = renderBlocks(blocks, PLAIN_THEME)
  const verdict = checkContent({
    subject,
    previewText,
    text: visibleText(body),
    images: imageCount(body),
    bytes: byteLength(body),
    unknownFields: unknownMergeFields(subject, previewText, body),
  })
  return { subject, previewText, blocks, body, ...verdict }
}

/**
 * The email as a reader with no name on file gets it, with no tracking: for
 * the email's own page and the copy kept when a send starts.
 */
export function previewEmail(
  content: Pick<PreparedContent, "subject" | "previewText" | "blocks">,
  sender: Pick<Sender, "brand" | "avatarUrl"> & { name?: string },
  /** The email's page for one reader (./view-online.ts): their name in it and their own unsubscribe link. Still no tracking. */
  as?: { name: string | null; email: string | null; unsubscribeToken: string | null },
): string {
  const page = as?.unsubscribeToken ? unsubscribeUrlFor(as.unsubscribeToken) : `${APP_URL}/unsubscribe`
  const reader = { name: as?.name ?? null, email: as?.email ?? null, creatorName: sender.name ?? sender.brand.name, storeName: sender.brand.name, storeUrl: sender.brand.storeUrl, unsubscribeUrl: page }
  const body = personalizeHtml(renderBlocks(content.blocks, themeOf(sender.brand)), reader).replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, esc(page))
  return buildEmail({
    subject: personalizeSubject(content.subject, reader),
    previewText: personalizeSubject(content.previewText, reader),
    bodyHtml: body,
    brand: sender.brand,
    avatarUrl: sender.avatarUrl,
    kind: "marketing",
    unsubscribeUrl: page,
  })
}

/* ─── Who it goes to ─────────────────────────────────────────────────── */

export const AUDIENCES = ["all", "last_24h", "last_7days", "last_30days", "last_90days", "onepage", "store_builder", "segment"] as const
export type AudienceType = (typeof AUDIENCES)[number]

export function readAudience(type: unknown): AudienceType {
  return (AUDIENCES as readonly string[]).includes(type as string) ? (type as AudienceType) : "all"
}

export interface Recipient {
  subscriberId: string
  email: string
  name: string | null
}

export interface ResolvedAudience {
  recipients: Recipient[]
  /** On the list for this audience but not sendable: unsubscribed, bounced, a bad address, a duplicate. */
  excluded: number
}

const DAY = 86_400_000
const SUPPRESSED = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAudience(query: any, type: AudienceType, now: number) {
  if (type === "onepage" || type === "store_builder") return query.eq("source", type)
  if (type === "last_24h") return query.gte("subscribed_at", new Date(now - DAY).toISOString())
  if (type === "last_7days") return query.gte("subscribed_at", new Date(now - 7 * DAY).toISOString())
  if (type === "last_30days") return query.gte("subscribed_at", new Date(now - 30 * DAY).toISOString())
  if (type === "last_90days") return query.gte("subscribed_at", new Date(now - 90 * DAY).toISOString())
  return query
}

async function segmentIds(db: Db, creatorId: string, segmentId: string | null | undefined): Promise<string[] | null> {
  if (!segmentId) return []
  const { data } = await db.from("email_segments").select("id, filters").eq("id", segmentId).eq("creator_id", creatorId).maybeSingle()
  if (!data) return []
  /* A segment made of rules (New segment, ./segments.ts): its people today, read when the email goes. */
  if (data.filters?.rules) return segmentMemberIds(db, creatorId, data.filters.rules)
  const ids = data.filters?.subscriber_ids
  return Array.isArray(ids) ? ids.filter((x: unknown): x is string => typeof x === "string") : []
}

/**
 * Every address this audience reaches today, after the list's own record of
 * who left, bounced or complained, with bad and duplicate addresses dropped.
 * Read in pages: PostgREST answers at most a thousand rows at a time, and a
 * list longer than that used to be cut at a thousand without a word.
 */
export async function resolveAudience(db: Db, creatorId: string, type: AudienceType, segmentId?: string | null): Promise<ResolvedAudience> {
  const now = Date.now()
  const rows: { id: string; email: string; name: string | null; status: string | null; is_active: boolean | null }[] = []

  if (type === "segment") {
    const ids = (await segmentIds(db, creatorId, segmentId)) ?? []
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from("subscribers")
        .select("id, email, name, status, is_active")
        .eq("creator_id", creatorId)
        .in("id", ids.slice(i, i + 200))
      if (error) throw new Error("audience")
      rows.push(...(data ?? []))
    }
  } else {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await applyAudience(
        db.from("subscribers").select("id, email, name, status, is_active").eq("creator_id", creatorId),
        type,
        now,
      )
        .order("id", { ascending: true })
        .range(from, from + 999)
      if (error) throw new Error("audience")
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
  }

  const seen = new Set<string>()
  const recipients: Recipient[] = []
  let excluded = 0
  for (const r of rows) {
    const email = normalizeAddress(r.email)
    const status = (r.status || "subscribed").toLowerCase()
    /* A buyer who never asked for news (lib/contacts/checkout-contact) is a
       contact, not a subscriber: never sent a campaign, and not counted as
       somebody the send left out. */
    if (status === "customer") continue
    /* The same for somebody who only wrote through a contact form (lib/site-contact). */
    if (status === "wrote") continue
    if (!email || SUPPRESSED.has(status) || status !== "subscribed" || r.is_active === false || seen.has(email)) {
      excluded++
      continue
    }
    seen.add(email)
    recipients.push({ subscriberId: r.id, email, name: typeof r.name === "string" ? r.name : null })
  }
  return { recipients, excluded }
}

/** Addresses queued or sent this calendar month, against the plan's limit. */
export async function usedThisMonth(db: Db, creatorId: string): Promise<number> {
  const { count, error } = await db
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .gte("created_at", monthStart())
    .not("status", "in", "(failed,skipped)")
  return error ? 0 : count ?? 0
}

/* ─── 1. Start ───────────────────────────────────────────────────────── */

export type StartResult =
  | { kind: "started"; status: CampaignStatus; recipients: number; excluded: number; leaseFrom: string }
  | { kind: "already"; status: CampaignStatus }
  | { kind: "conflict" }
  | { kind: "not_found" }
  | { kind: "invalid"; errors: Problem[]; status?: number }
  | { kind: "dry_run"; recipients: number; excluded: number; warnings: Problem[]; sender: { name: string; from: string; replyTo: string; address: string | null } }

export interface StartOptions {
  creatorId: string
  campaignId: string
  /** Where the campaign may start from. Send: draft or scheduled. Cron: scheduled. */
  from: CampaignStatus[]
  idempotencyKey?: string | null
  /** The version the page last saved. A different one means another tab changed it. */
  expectedUpdatedAt?: string | null
  /** Check everything and count, send nothing. The confirm step. */
  dryRun?: boolean
}

const CAMPAIGN_COLUMNS = "id, creator_id, subject, preview_text, body, status, audience_type, segment_id, from_name, updated_at, scheduled_at, sent_at, audience_count"

export async function startSend(db: Db, o: StartOptions): Promise<StartResult> {
  const modern = await isModernSchema(db)
  const { data: campaign } = await db
    .from("email_campaigns")
    .select(modern ? `${CAMPAIGN_COLUMNS}, send_idempotency_key, track_opens` : CAMPAIGN_COLUMNS)
    .eq("id", o.campaignId)
    .eq("creator_id", o.creatorId)
    .maybeSingle()
  if (!campaign) return { kind: "not_found" }

  const status = readStatus(campaign.status)
  if (!o.from.includes(status)) {
    return { kind: "already", status }
  }
  if (o.idempotencyKey && modern && campaign.send_idempotency_key === o.idempotencyKey) return { kind: "already", status }
  if (o.expectedUpdatedAt && !sameInstant(o.expectedUpdatedAt, campaign.updated_at)) return { kind: "conflict" }

  const content = prepareContent(campaign)
  if (content.errors.length) return { kind: "invalid", errors: content.errors }

  const sender = await loadSender(db, o.creatorId, campaign.from_name)
  if (!sender) return { kind: "not_found" }
  if (sender.blocked) {
    return { kind: "invalid", status: 403, errors: [{ field: "audience", message: "This account cannot send email. Write to support@storelib.com if that is a mistake." }] }
  }

  /* No audience chosen (round 52: people picked in Contacts of whom none may get it): refused, never read as everyone. */
  if (readAudience(campaign.audience_type) === "segment" && !campaign.segment_id) {
    return { kind: "invalid", errors: [{ field: "audience", message: "Choose who this email goes to." }] }
  }

  let audience: ResolvedAudience
  try {
    audience = await resolveAudience(db, o.creatorId, readAudience(campaign.audience_type), campaign.segment_id)
  } catch {
    return { kind: "invalid", status: 503, errors: [{ field: "audience", message: "Could not read your subscriber list. Try again in a moment." }] }
  }
  if (audience.recipients.length === 0) {
    return {
      kind: "invalid",
      errors: [{ field: "audience", message: audience.excluded ? "Everyone in this audience has unsubscribed or bounced." : "Nobody is in this audience yet." }],
    }
  }

  const fit = fitsPlan(audience.recipients.length, await usedThisMonth(db, o.creatorId), monthlyLimit(sender.planId, sender.planStatus))
  if ("message" in fit) return { kind: "invalid", status: 402, errors: [{ field: "audience", message: fit.message }] }

  if (o.dryRun) {
    return {
      kind: "dry_run",
      recipients: audience.recipients.length,
      excluded: audience.excluded,
      warnings: content.warnings,
      sender: { name: sender.name, from: sender.from, replyTo: sender.replyTo, address: sender.brand.address },
    }
  }

  /* The one conditional move. Whoever gets a row back sends; nobody else does. */
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: storedStatus("queued", !modern),
    sent_at: now,
    updated_at: now,
    audience_count: audience.recipients.length,
  }
  if (modern) {
    patch.last_error = null
    patch.completed_at = null
    if (o.idempotencyKey) patch.send_idempotency_key = o.idempotencyKey
    /* The email as it goes out, for its page: a later logo or colour does not change what was sent. */
    patch.rendered_html = previewEmail(content, sender)
  }
  let move = db.from("email_campaigns").update(patch).eq("id", o.campaignId).eq("creator_id", o.creatorId).in("status", o.from)
  if (o.expectedUpdatedAt) move = move.eq("updated_at", campaign.updated_at)
  let { data: moved, error } = await move.select("updated_at")
  if (isCheckViolation(error)) {
    resetSchemaCache(false)
    ;({ data: moved, error } = await db
      .from("email_campaigns")
      .update({ status: "sending", sent_at: now, updated_at: now, audience_count: audience.recipients.length })
      .eq("id", o.campaignId)
      .eq("creator_id", o.creatorId)
      .in("status", o.from)
      .select("updated_at"))
  }
  if (error) {
    /* A second request carrying the same key, if the unique index got there first. */
    if (error.code === "23505") return { kind: "already", status: "queued" }
    throw new Error(`start: ${error.code ?? "update failed"}`)
  }
  if (!moved || moved.length === 0) {
    const { data: again } = await db.from("email_campaigns").select("status").eq("id", o.campaignId).maybeSingle()
    return { kind: "already", status: readStatus(again?.status) }
  }

  const inserted = await insertRecipients(db, o.campaignId, o.creatorId, audience.recipients)
  if (!inserted) {
    await db.from("campaign_recipients").delete().eq("campaign_id", o.campaignId).eq("status", "pending")
    await markCampaign(db, o.campaignId, "failed", modern, { last_error: "Could not prepare the list of recipients. Nothing was sent." })
    return { kind: "invalid", status: 503, errors: [{ field: "audience", message: "Could not prepare the list of recipients. Nothing was sent. Try again." }] }
  }

  return {
    kind: "started",
    status: modern ? "queued" : "sending",
    recipients: audience.recipients.length,
    excluded: audience.excluded,
    leaseFrom: moved[0].updated_at,
  }
}

function sameInstant(a: unknown, b: unknown): boolean {
  const x = Date.parse(String(a ?? ""))
  const y = Date.parse(String(b ?? ""))
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1
}

/**
 * One row per address, written with ON CONFLICT DO NOTHING on the unique
 * (campaign_id, email) index. Without that index (an old database) the rows
 * already there are read first and only the rest are written.
 */
async function insertRecipients(db: Db, campaignId: string, creatorId: string, recipients: Recipient[]): Promise<boolean> {
  const rows = recipients.map((r) => ({
    campaign_id: campaignId,
    creator_id: creatorId,
    subscriber_id: r.subscriberId,
    email: r.email,
    name: r.name,
    status: "pending",
  }))
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    const { error } = await db.from("campaign_recipients").upsert(chunk, { onConflict: "campaign_id,email", ignoreDuplicates: true })
    if (!error) continue
    if (error.code !== "42P10") {
      console.error("[campaign] recipient insert failed:", error.code)
      return false
    }
    const { data: existing } = await db.from("campaign_recipients").select("email").eq("campaign_id", campaignId).in("email", chunk.map((r) => r.email))
    const have = new Set((existing ?? []).map((r: { email: string }) => r.email))
    const rest = chunk.filter((r) => !have.has(r.email))
    if (rest.length) {
      const { error: plain } = await db.from("campaign_recipients").insert(rest)
      if (plain) {
        console.error("[campaign] recipient insert failed:", plain.code)
        return false
      }
    }
  }
  return true
}

async function markCampaign(db: Db, campaignId: string, status: CampaignStatus, modern: boolean, extra: Record<string, unknown> = {}, sentSoFar = 0) {
  const patch: Record<string, unknown> = { status: storedStatus(status, !modern, sentSoFar), updated_at: new Date().toISOString() }
  if (modern) Object.assign(patch, extra)
  else if ("audience_count" in extra) patch.audience_count = extra.audience_count
  await db.from("email_campaigns").update(patch).eq("id", campaignId)
}

/* ─── 2. Work ────────────────────────────────────────────────────────── */

export interface ProcessOptions {
  /** Epoch ms by which this worker must have stopped. */
  deadline: number
  /** The updated_at this caller already holds, from startSend. */
  leaseFrom?: string | null
  /** Replace the provider, in tests. */
  send?: typeof sendMailgunOnce
  sleep?: (ms: number) => Promise<void>
}

export interface ProcessResult {
  outcome: "finished" | "yielded" | "busy" | "lost" | "halted" | "not_active"
  sent: number
  failed: number
  skipped: number
  /** Handed over with no answer: may have arrived, not sent again. */
  unknown: number
  status?: CampaignStatus
}

interface Claimed {
  id: string
  email: string
  name: string | null
  subscriber_id: string | null
  tracking_token: string
  attempts?: number
}

export interface Frame {
  subject: string
  previewText: string
  /** The blocks rendered once for the whole send, in the brand's look, with {{fields}} still in. */
  body: string
  sender: Sender
  /** Whether the open pixel goes in. Off when the creator turned counting opens off. */
  trackOpens: boolean
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function processCampaign(db: Db, campaignId: string, o: ProcessOptions): Promise<ProcessResult> {
  const modern = await isModernSchema(db)
  const send = o.send ?? sendMailgunOnce
  const sleep = o.sleep ?? realSleep
  const tally = { sent: 0, failed: 0, skipped: 0, unknown: 0 }

  const { data: campaign } = await db.from("email_campaigns").select(modern ? `${CAMPAIGN_COLUMNS}, track_opens` : CAMPAIGN_COLUMNS).eq("id", campaignId).maybeSingle()
  if (!campaign) return { outcome: "not_active", ...tally }
  const status = readStatus(campaign.status)
  if (status !== "queued" && status !== "sending") return { outcome: "not_active", ...tally, status }

  /* Take the lease: ours already from startSend, or a stale one. */
  let lease: string = campaign.updated_at
  if (!(o.leaseFrom && sameInstant(o.leaseFrom, campaign.updated_at))) {
    const age = Date.now() - Date.parse(campaign.updated_at)
    if (Number.isFinite(age) && age < LEASE_MS) return { outcome: "busy", ...tally }
  }
  const took = await renew(db, campaignId, lease, true)
  if (!took) return { outcome: "lost", ...tally }
  lease = took

  const content = prepareContent(campaign)
  const sender = await loadSender(db, campaign.creator_id, campaign.from_name)
  if (!sender || content.errors.length) {
    await failOutstanding(db, campaignId, modern, "The email could not be prepared for sending.")
    return { ...(await finalize(db, campaignId, modern)), ...tally, outcome: "finished" }
  }
  const frame: Frame = {
    subject: content.subject,
    previewText: content.previewText,
    body: renderBlocks(content.blocks, themeOf(sender.brand)),
    sender,
    trackOpens: campaign.track_opens !== false,
  }

  let parallel = PARALLEL
  const legacyTries = new Map<string, number>()
  while (true) {
    if (Date.now() > o.deadline - 20_000) return { outcome: "yielded", ...tally }

    const renewed = await renew(db, campaignId, lease, false)
    if (!renewed) {
      const { data: now } = await db.from("email_campaigns").select("status").eq("id", campaignId).maybeSingle()
      const s = readStatus(now?.status)
      if (s === "cancelled" || (!modern && s !== "sending")) {
        await skipOutstanding(db, campaignId, modern, "Stopped before it was sent.")
        return { outcome: "finished", ...tally, status: s }
      }
      return { outcome: "lost", ...tally }
    }
    lease = renewed

    /* A row a worker claimed and never answered for may be in the inbox: never again. */
    if (modern) await settleStaleClaims(db, campaignId)

    const batch = await claimBatch(db, campaignId, modern)
    if (batch.length === 0) {
      const counts = await countRecipients(db, campaignId)
      if (outstanding(counts) === 0) {
        const done = await finalize(db, campaignId, modern)
        return { outcome: "finished", ...tally, status: done.status }
      }
      /* Only rows waiting for a retry are left. Wait for the nearest one if it fits. */
      const wait = modern ? await nextDue(db, campaignId) : null
      if (wait !== null && Date.now() + wait < o.deadline - 25_000) {
        await sleep(Math.max(1000, wait))
        continue
      }
      return { outcome: "yielded", ...tally }
    }

    const live = await stillSubscribed(db, campaign.creator_id, batch)
    for (let i = 0; i < batch.length; i += parallel) {
      const slice = batch.slice(i, i + parallel)
      const answers = await Promise.all(
        slice.map(async (row) => {
          if (!live.has(row.subscriber_id ?? "")) {
            await recordSkip(db, row, modern, "Left the list before it was sent.")
            tally.skipped++
            return null
          }
          const answer = await send(messageFor(frame, campaignId, row, live.get(row.subscriber_id ?? "") ?? null), { timeoutMs: 15_000 })
          return { row, answer }
        }),
      )
      let slowDown = false
      let legacyRetry = false
      let halt: MailgunOnceResult | null = null
      for (const a of answers) {
        if (!a) continue
        const attempts = modern ? (a.row.attempts ?? 1) : (legacyTries.get(a.row.id) ?? 0) + 1
        /* Without the attempts column a run gives an address three tries, a few seconds apart. */
        const outcome = afterAttempt(a.answer, modern ? attempts : attempts >= LEGACY_TRIES ? MAX_ATTEMPTS : attempts)
        if (outcome === "sent") {
          await recordSent(db, a.row, modern, a.answer.messageId)
          tally.sent++
        } else if (outcome === "failed") {
          await recordFailed(db, a.row, modern, plainReason(a.answer))
          tally.failed++
          console.warn(`[campaign] ${campaignId} could not send to ${maskEmail(a.row.email)}: ${a.answer.status ?? "no answer"}`)
        } else if (outcome === "unknown") {
          await recordUnknown(db, a.row, modern)
          tally.unknown++
          console.warn(`[campaign] ${campaignId} got no answer for ${maskEmail(a.row.email)}; not sent again`)
        } else if (outcome === "retry") {
          if (a.answer.status === 429) slowDown = true
          if (modern) await recordRetry(db, a.row, attempts, plainReason(a.answer))
          else {
            legacyTries.set(a.row.id, attempts)
            legacyRetry = true
          }
        } else {
          halt = a.answer
          await release(db, a.row, modern)
        }
      }
      if (halt) {
        for (const row of batch.slice(i + parallel)) await release(db, row, modern)
        const reason = `Paused: ${plainReason(halt)} It will try again on its own.`
        if (modern) await db.from("email_campaigns").update({ last_error: reason }).eq("id", campaignId)
        console.error(`[campaign] ${campaignId} halted: ${halt.status ?? (halt.notConfigured ? "not configured" : "no answer")}`)
        return { outcome: "halted", ...tally }
      }
      if (slowDown) parallel = 1
      if (slowDown || legacyRetry) await sleep(slowDown ? 5_000 : 3_000)
    }
  }
}

/** Compare-and-set on updated_at. The new value, or null when somebody else moved it. */
async function renew(db: Db, campaignId: string, lease: string, first: boolean): Promise<string | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (first) patch.status = "sending"
  let { data, error } = await db
    .from("email_campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("updated_at", lease)
    .in("status", ["queued", "sending"])
    .select("updated_at")
  if (error && first) {
    ;({ data, error } = await db.from("email_campaigns").update({ updated_at: patch.updated_at }).eq("id", campaignId).eq("updated_at", lease).in("status", ["queued", "sending"]).select("updated_at"))
  }
  if (error || !data || data.length === 0) return null
  return data[0].updated_at
}

async function claimBatch(db: Db, campaignId: string, modern: boolean): Promise<Claimed[]> {
  const now = new Date().toISOString()
  let q = db
    .from("campaign_recipients")
    .select(modern ? "id, email, name, subscriber_id, tracking_token, attempts" : "id, email, name, subscriber_id, tracking_token")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
  if (modern) q = q.or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
  const { data: candidates } = await q.order("created_at", { ascending: true }).limit(BATCH)
  if (!candidates || candidates.length === 0) return []
  if (!modern) return candidates

  /* Claimed one by one, so each carries its own attempt count, and only a row still pending is taken. */
  const claimed: Claimed[] = []
  for (const c of candidates as Claimed[]) {
    const attempts = (c.attempts ?? 0) + 1
    const { data } = await db
      .from("campaign_recipients")
      .update({ status: "sending", claimed_at: now, attempts })
      .eq("id", c.id)
      .eq("status", "pending")
      .select("id")
    if (data && data.length) claimed.push({ ...c, attempts })
  }
  return claimed
}

async function nextDue(db: Db, campaignId: string): Promise<number | null> {
  const { data } = await db
    .from("campaign_recipients")
    .select("next_attempt_at")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .not("next_attempt_at", "is", null)
    .order("next_attempt_at", { ascending: true })
    .limit(1)
  const at = data?.[0]?.next_attempt_at
  return at ? Math.max(0, Date.parse(at) - Date.now()) : null
}

/**
 * The subscribers of this batch who are still on the list right now, with
 * their unsubscribe tokens. Somebody deleted from the list, or who left it
 * after Send was pressed, is not in the map and is skipped.
 */
async function stillSubscribed(db: Db, creatorId: string, rows: Claimed[]): Promise<Map<string, string | null>> {
  const ids = rows.map((r) => r.subscriber_id).filter((x): x is string => !!x)
  if (!ids.length) return new Map()
  const { data, error } = await db.from("subscribers").select("id, status, is_active, unsubscribe_token").eq("creator_id", creatorId).in("id", ids)
  /* If the list cannot be read, nobody is sent to: waiting beats mailing someone who left. */
  if (error) throw new Error("subscribers")
  const live = new Map<string, string | null>()
  for (const s of (data ?? []) as { id: string; status: string | null; is_active: boolean | null; unsubscribe_token: string | null }[]) {
    if ((s.status || "subscribed") === "subscribed" && s.is_active !== false) live.set(s.id, s.unsubscribe_token ?? null)
  }
  return live
}

/**
 * The finished message for one reader: their name in it, their own
 * unsubscribe link in the footer and in the one-click header (RFC 8058, which
 * Gmail and Yahoo require of bulk senders), each link sent through the click
 * counter, the open pixel, and a Message-Id fixed to this recipient row.
 */
export function messageFor(frame: Frame, campaignId: string, row: Claimed, unsubscribeToken: string | null) {
  const page = unsubscribeToken ? unsubscribeUrlFor(unsubscribeToken) : `${APP_URL}/unsubscribe`
  /* The reader, and the creator as the send read them when it started (loadSender): never a copy from when the email was written. */
  const reader = { name: row.name, email: row.email, creatorName: frame.sender.name, storeName: frame.sender.brand.name, storeUrl: frame.sender.brand.storeUrl, unsubscribeUrl: page }
  const oneClick = unsubscribeToken ? `${APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}` : ""
  const personal = personalizeHtml(frame.body, reader).replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, esc(page))
  const subject = personalizeSubject(frame.subject, reader)
  const brand = frame.sender.brand
  const view = viewOnlineUrl({ kind: "recipient", id: row.id })
  const html = buildEmail({
    subject,
    previewText: personalizeSubject(frame.previewText, reader),
    bodyHtml: trackLinks(personal, row.tracking_token),
    brand,
    avatarUrl: frame.sender.avatarUrl,
    kind: "marketing",
    unsubscribeUrl: page,
    openPixelUrl: frame.trackOpens ? `${APP_URL}/api/email/track?t=${encodeURIComponent(row.tracking_token)}` : null,
    /* This reader's own page of the email: their name and their unsubscribe link, no pixel (./view-online.ts). */
    viewOnlineUrl: view,
  })
  const headers: Record<string, string> = {}
  if (oneClick) {
    headers["List-Unsubscribe"] = `<${oneClick}>`
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
  }
  return {
    to: row.email,
    from: frame.sender.from,
    replyTo: frame.sender.replyTo,
    subject,
    html,
    text: emailText({ bodyHtml: personal, brand, kind: "marketing", unsubscribeUrl: page, viewOnlineUrl: view }),
    headers,
    messageId: `<c${campaignId}.r${row.id}@${frame.sender.sendingDomain ?? mailgunDomain()}>`,
    ...(frame.sender.sendingDomain ? { sendingDomain: frame.sender.sendingDomain } : {}),
    tags: ["campaign"],
    metadata: { campaign_id: campaignId, recipient_id: row.id },
  }
}

export { trackLinks }

/* ─── What happened to one address ───────────────────────────────────── */

async function recordSent(db: Db, row: Claimed, modern: boolean, messageId?: string) {
  const patch: Record<string, unknown> = { status: "sent", sent_at: new Date().toISOString(), provider_message_id: messageId ?? null, error_message: null }
  if (modern) patch.claimed_at = null
  await db.from("campaign_recipients").update(patch).eq("id", row.id).in("status", ["sending", "pending"])
}

async function recordFailed(db: Db, row: Claimed, modern: boolean, reason: string) {
  const patch: Record<string, unknown> = { status: "failed", error_message: reason }
  if (modern) patch.claimed_at = null
  await db.from("campaign_recipients").update(patch).eq("id", row.id).in("status", ["sending", "pending"])
}

async function recordRetry(db: Db, row: Claimed, attempts: number, reason: string) {
  await db
    .from("campaign_recipients")
    .update({ status: "pending", claimed_at: null, next_attempt_at: nextAttemptAt(attempts), error_message: reason })
    .eq("id", row.id)
    .eq("status", "sending")
}

async function recordSkip(db: Db, row: Claimed, modern: boolean, reason: string) {
  const { error } = await db
    .from("campaign_recipients")
    .update(modern ? { status: "skipped", claimed_at: null, error_message: reason } : { status: "failed", error_message: reason })
    .eq("id", row.id)
    .in("status", ["sending", "pending"])
  if (isCheckViolation(error)) await db.from("campaign_recipients").update({ status: "failed", error_message: reason }).eq("id", row.id)
}

/**
 * Handed over, never answered for. Not sent again: `unknown` after the
 * migration, before it a failure whose reason says it may have arrived
 * (retryFailed leaves those alone).
 */
async function recordUnknown(db: Db, row: Claimed, modern: boolean) {
  if (!modern) {
    await db.from("campaign_recipients").update({ status: "failed", error_message: UNCERTAIN_REASON }).eq("id", row.id).in("status", ["sending", "pending"])
    return
  }
  const { error } = await db
    .from("campaign_recipients")
    .update({ status: "unknown", claimed_at: null, error_message: UNCERTAIN_REASON })
    .eq("id", row.id)
    .eq("status", "sending")
  if (isCheckViolation(error)) await db.from("campaign_recipients").update({ status: "failed", claimed_at: null, error_message: UNCERTAIN_REASON }).eq("id", row.id).eq("status", "sending")
}

/** Rows a worker claimed and then went quiet on, past STALE_CLAIM_MS: may have been sent, so never again. */
async function settleStaleClaims(db: Db, campaignId: string) {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const { error } = await db
    .from("campaign_recipients")
    .update({ status: "unknown", claimed_at: null, error_message: UNCERTAIN_REASON })
    .eq("campaign_id", campaignId)
    .eq("status", "sending")
    .lt("claimed_at", cutoff)
  if (isCheckViolation(error)) {
    await db
      .from("campaign_recipients")
      .update({ status: "failed", claimed_at: null, error_message: UNCERTAIN_REASON })
      .eq("campaign_id", campaignId)
      .eq("status", "sending")
      .lt("claimed_at", cutoff)
  }
}

/** Back to pending with the attempt given back: the provider refused us, not them. */
async function release(db: Db, row: Claimed, modern: boolean) {
  if (!modern) return
  await db
    .from("campaign_recipients")
    .update({ status: "pending", claimed_at: null, attempts: Math.max(0, (row.attempts ?? 1) - 1), next_attempt_at: nextAttemptAt(1) })
    .eq("id", row.id)
    .eq("status", "sending")
}

async function skipOutstanding(db: Db, campaignId: string, modern: boolean, reason: string) {
  const { error } = await db
    .from("campaign_recipients")
    .update(modern ? { status: "skipped", error_message: reason } : { status: "failed", error_message: reason })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
  if (isCheckViolation(error)) {
    await db.from("campaign_recipients").update({ status: "failed", error_message: reason }).eq("campaign_id", campaignId).eq("status", "pending")
  }
}

async function failOutstanding(db: Db, campaignId: string, _modern: boolean, reason: string) {
  await db.from("campaign_recipients").update({ status: "failed", error_message: reason }).eq("campaign_id", campaignId).in("status", ["pending", "sending"])
}

/* ─── 3. Finish ──────────────────────────────────────────────────────── */

export async function countRecipients(db: Db, campaignId: string): Promise<RecipientCounts> {
  const statuses = ["pending", "sending", "sent", "delivered", "bounced", "failed", "skipped", "unknown"] as const
  const results = await Promise.all(
    statuses.map((s) => db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", s)),
  )
  const counts: RecipientCounts = { ...EMPTY_COUNTS }
  statuses.forEach((s, i) => {
    counts[s] = results[i].error ? 0 : results[i].count ?? 0
  })
  const complained = await db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "complained")
  counts.bounced += complained.error ? 0 : complained.count ?? 0
  counts.total = counts.pending + counts.sending + counts.sent + counts.delivered + counts.bounced + counts.failed + counts.skipped + counts.unknown
  return counts
}

/** The most recent reason an address did not get it, in plain words. */
export async function lastFailure(db: Db, campaignId: string): Promise<string | null> {
  const { data } = await db
    .from("campaign_recipients")
    .select("error_message")
    .eq("campaign_id", campaignId)
    .in("status", ["failed", "pending"])
    .not("error_message", "is", null)
    .limit(1)
  return data?.[0]?.error_message ?? null
}

export async function finalize(db: Db, campaignId: string, modern: boolean): Promise<{ status: CampaignStatus }> {
  const counts = await countRecipients(db, campaignId)
  if (outstanding(counts) > 0) return { status: "sending" }
  const status = finalStatus(counts)
  const out = wentOut(counts)
  const extra: Record<string, unknown> = { audience_count: out, completed_at: new Date().toISOString() }
  extra.last_error = counts.failed > 0 ? await lastFailure(db, campaignId) : counts.unknown > 0 ? UNCERTAIN_REASON : null
  const patch: Record<string, unknown> = { status: storedStatus(status, !modern, out), audience_count: out, updated_at: new Date().toISOString() }
  if (modern) Object.assign(patch, extra)
  await db.from("email_campaigns").update(patch).eq("id", campaignId).in("status", ["queued", "sending"])
  return { status }
}

/* ─── Actions a creator takes on a send ──────────────────────────────── */

/**
 * Stop: a scheduled email goes back to being a draft; one being sent stops
 * at the next batch, and every address not yet reached is skipped. What has
 * gone out has gone out.
 */
export async function cancelSend(db: Db, creatorId: string, campaignId: string): Promise<{ ok: boolean; status: CampaignStatus }> {
  const modern = await isModernSchema(db)
  const { data: c } = await db.from("email_campaigns").select("status").eq("id", campaignId).eq("creator_id", creatorId).maybeSingle()
  if (!c) return { ok: false, status: "draft" }
  const status = readStatus(c.status)
  const now = new Date().toISOString()
  if (status === "scheduled") {
    const { data } = await db.from("email_campaigns").update({ status: "draft", scheduled_at: null, updated_at: now }).eq("id", campaignId).eq("status", "scheduled").select("id")
    return { ok: !!data?.length, status: "draft" }
  }
  if (status !== "queued" && status !== "sending") return { ok: false, status }
  await skipOutstanding(db, campaignId, modern, "Stopped before it was sent.")
  const counts = await countRecipients(db, campaignId)
  const out = wentOut(counts)
  const patch: Record<string, unknown> = { status: storedStatus("cancelled", !modern, out), audience_count: out, updated_at: now }
  if (modern) patch.completed_at = now
  const { data } = await db.from("email_campaigns").update(patch).eq("id", campaignId).in("status", ["queued", "sending"]).select("status")
  return { ok: !!data?.length, status: "cancelled" }
}

/** Send again to the addresses that failed. Never to one that got it. */
export async function retryFailed(db: Db, creatorId: string, campaignId: string): Promise<{ ok: boolean; retried: number; leaseFrom?: string }> {
  const modern = await isModernSchema(db)
  const { data: c } = await db.from("email_campaigns").select("status, updated_at").eq("id", campaignId).eq("creator_id", creatorId).maybeSingle()
  if (!c) return { ok: false, retried: 0 }
  const status = readStatus(c.status)
  if (status !== "partially_failed" && status !== "failed" && !(status === "sent" && !modern)) return { ok: false, retried: 0 }
  const now = new Date().toISOString()
  const { data: moved } = await db
    .from("email_campaigns")
    .update({ status: "sending", updated_at: now })
    .eq("id", campaignId)
    .eq("updated_at", c.updated_at)
    .select("updated_at")
  if (!moved?.length) return { ok: false, retried: 0 }
  const patch: Record<string, unknown> = { status: "pending", error_message: null }
  if (modern) Object.assign(patch, { attempts: 0, next_attempt_at: null, claimed_at: null })
  /* Only what the provider certainly refused. A row that may have arrived is never sent again. */
  const { data: failedRows } = await db.from("campaign_recipients").select("id, error_message").eq("campaign_id", campaignId).eq("status", "failed")
  const ids = ((failedRows ?? []) as { id: string; error_message: string | null }[]).filter((r) => r.error_message !== UNCERTAIN_REASON).map((r) => r.id)
  let retried = 0
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows } = await db.from("campaign_recipients").update(patch).in("id", ids.slice(i, i + 200)).eq("status", "failed").select("id")
    retried += rows?.length ?? 0
  }
  if (retried === 0) await finalize(db, campaignId, modern)
  return { ok: true, retried, leaseFrom: moved[0].updated_at }
}

/* ─── The cron's share ───────────────────────────────────────────────── */

export interface QueueRun {
  started: number
  failedToStart: number
  processed: number
  sent: number
}

/**
 * Due scheduled campaigns are started, and any campaign whose worker has
 * gone quiet is picked up, until the deadline. Never throws: the flows the
 * same cron sends must not be held up by a campaign.
 */
export async function runCampaignQueue(db: Db, deadline: number, inject: Pick<ProcessOptions, "send" | "sleep"> = {}): Promise<QueueRun> {
  const run: QueueRun = { started: 0, failedToStart: 0, processed: 0, sent: 0 }
  try {
    const modern = await isModernSchema(db)
    const { data: due } = await db
      .from("email_campaigns")
      .select("id, creator_id")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20)
    const mine: { id: string; leaseFrom: string | null }[] = []
    for (const c of due ?? []) {
      if (Date.now() > deadline - 30_000) break
      const r = await startSend(db, { creatorId: c.creator_id, campaignId: c.id, from: ["scheduled"] })
      if (r.kind === "started") {
        run.started++
        mine.push({ id: c.id, leaseFrom: r.leaseFrom })
      } else if (r.kind === "invalid") {
        run.failedToStart++
        await markCampaign(db, c.id, "failed", modern, { last_error: r.errors.map((e) => e.message).join(" "), completed_at: new Date().toISOString() })
        console.warn(`[campaign] scheduled ${c.id} did not start: ${r.errors.map((e) => e.field).join(",")}`)
      }
    }

    const { data: active } = await db
      .from("email_campaigns")
      .select("id")
      .in("status", ["queued", "sending"])
      .lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString())
      .order("updated_at", { ascending: true })
      .limit(10)
    /* The ones this run started hold a lease already; the quiet ones are taken over. */
    const list = [...mine, ...(active ?? []).map((a: { id: string }) => ({ id: a.id, leaseFrom: null as string | null }))]
    for (const c of list) {
      if (Date.now() > deadline - 30_000) break
      const r = await processCampaign(db, c.id, { deadline, leaseFrom: c.leaseFrom, ...inject })
      if (r.outcome !== "busy") run.processed++
      run.sent += r.sent
    }
  } catch (err) {
    console.error("[campaign] queue run stopped:", err instanceof Error ? err.message : "unknown error")
  }
  return run
}
