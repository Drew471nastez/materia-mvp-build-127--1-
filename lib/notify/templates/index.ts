/**
 * ===========================================================================
 *  RENDERING A NOTIFICATION
 * ===========================================================================
 *   renderEmail(type, data, ctx)  subject, preview, HTML and plain text
 *   renderInApp(type, data, ctx)  title, body, action for the bell
 *
 * The words come from catalog.ts, the look from layout.ts, the escaping and
 * URL rules from escape.ts. A template may also name who the email is from
 * (a review request is the seller's ask, not Storelib's): renderEmail gives
 * back that display name and reply-to, and the email channel hands them to
 * the provider, which keeps Storelib's own verified sending address. A
 * template may also hand back one file, the event's calendar file on a
 * ticket receipt, which the channel sends as an attachment. An action is
 * always ctx.baseUrl plus a path the catalog wrote (the in-app half keeps
 * the path, as the bell's links do). The footer's unsubscribe and
 * preferences links are used only when they point at Storelib, and never on
 * a security or receipt email.
 */
import { emailImageSrc } from "@/lib/email-campaigns/sender"
import { mediaUrl } from "@/lib/storage/media-url"
import type { InAppContent, NotificationType, RenderedEmail, TemplateContext } from "../types"
import { CATALOG, DATA_KEYS, Data, factsOf, type Audience, type Message } from "./catalog"
import { actionUrl, canonicalOrigin, cleanText, mailtoUrl, safeImageUrl, sameSiteUrl } from "./escape"
import { ITEM_PX, MEDIA_PX, renderHtml, renderText, type LayoutInput, type OrderSummary } from "./layout"

export { DATA_KEYS, PATHS, BRAND_KEYS, formatMoney, formatDate } from "./catalog"
export { FAMILY_STYLES, EMAIL_LOGO_URL } from "./layout"

/** A picture for an inbox: https only, at Storelib's own address (never the storage host), resized through the image endpoint; null for anything else. */
export function inboxPicture(url: unknown, drawnPx: number): string | null {
  return safeImageUrl(emailImageSrc(mediaUrl(safeImageUrl(url)), drawnPx))
}

/** An order's items with each picture made fit for an inbox (ITEM_PX). */
function sizedOrder(o: OrderSummary | null | undefined): OrderSummary | null {
  if (!o) return null
  return { ...o, lines: o.lines.map((l) => ({ ...l, imageUrl: inboxPicture(l.imageUrl, ITEM_PX) })) }
}

function message(type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext): Message {
  const entry = CATALOG[type]
  if (!entry) throw new Error(`No template for notification type ${String(type)}`)
  return entry(new Data(data && typeof data === "object" ? data : {}), ctx)
}

function reasonLine(m: Message): string {
  if (m.family === "security") return "This is a security notice about your account."
  if (m.audience === "customer") return "You get this because you bought something on Storelib."
  return "You get this because you have a Storelib account."
}

/** A display name for a From header: one line, no quotes or angle brackets to break it. */
function senderName(value: unknown): string {
  return cleanText(value, 60).replace(/["<>\\]/g, "").trim()
}

/** A plain address for Reply-To, checked by the same rule a mailto link is. */
function replyAddress(value: unknown): string | null {
  const url = mailtoUrl(value)
  return url ? url.slice("mailto:".length) : null
}

/**
 * WHO A BUYER'S OR A MEMBER'S EMAIL IS FROM, when its data names someone
 * (catalog.ts BRAND_KEYS): a community, or the creator selling a membership.
 * Only on an email to a customer; a creator's own notices stay Storelib's.
 */
export interface EmailBrand {
  name: string
  kind: "community" | "creator"
  /** https, at Storelib's address, sized for the header. Null draws the name's first letter. */
  pictureUrl: string | null
  picture: "mark" | "avatar"
  replyTo: string | null
  /** The community's own domain (https://club.example.com) and the Storelib path it stands for (/community/<slug>). */
  origin: string | null
  prefix: string | null
}

const HOST = /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

/** The drawn size of the community's or creator's picture in the header (lib/emails/layout.ts draws it at 36px). */
const BRAND_PX = 36

export function brandOf(data: Record<string, unknown>, audience: Audience): EmailBrand | null {
  if (audience !== "customer" || !data || typeof data !== "object") return null
  const d = new Data(data)
  const name = senderName(d.text("brandName", 60))
  if (!name) return null
  const host = d.text("brandHost", 253).toLowerCase()
  const slug = d.id("brandSlug")
  const origin = HOST.test(host) && slug ? `https://${host}` : null
  return {
    name,
    kind: d.text("brandKind", 12) === "creator" ? "creator" : "community",
    pictureUrl: inboxPicture(data.brandLogoUrl, BRAND_PX),
    picture: d.text("brandPicture", 8) === "avatar" ? "avatar" : "mark",
    replyTo: replyAddress(d.text("brandReplyTo", 200)),
    origin,
    prefix: slug ? `/community/${slug}` : null,
  }
}

/** A community's page on its own domain, when it has one: /community/<slug>/events/1 becomes https://club.example.com/events/1. */
function onOwnDomain(brand: EmailBrand | null, path: string): string | null {
  if (!brand?.origin || !brand.prefix) return null
  const p = brand.prefix
  if (path !== p && !path.startsWith(`${p}/`) && !path.startsWith(`${p}?`) && !path.startsWith(`${p}#`)) return null
  let rest = path.slice(p.length)
  if (!rest.startsWith("/")) rest = `/${rest}`
  try {
    const u = new URL(rest, brand.origin)
    return u.origin === brand.origin ? u.toString() : null
  } catch {
    return null
  }
}

/** "Hi Maria,": the recipient's name the engine knows, else the buyer's or member's name the email's own data carries, else "Hi there,". */
function greeting(ctx: TemplateContext, data?: Record<string, unknown>): string {
  const first = (cleanText(ctx.recipientName, 60) || cleanText(data?.buyerName, 60) || cleanText(data?.memberName, 60)).split(" ")[0]
  return first ? `Hi ${first},` : "Hi there,"
}

/** Whether a type is written to a customer (never links to /app) or a creator. */
export function audienceOf(type: NotificationType): Audience {
  return message(type, {}, { baseUrl: "https://storelib.com" }).audience
}

export function renderEmail(type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext): RenderedEmail {
  const m = message(type, data, ctx)
  const base = ctx.baseUrl
  const brand = brandOf(data, m.audience)
  const link = (l?: { label: string; path: string } | null) => {
    if (!l) return null
    const url = onOwnDomain(brand, l.path) ?? actionUrl(base, l.path)
    return url ? { label: l.label, url } : null
  }
  /* Where the name on top links to: the community's own page (its domain when it has one). */
  const brandHome = brand?.prefix ? (onOwnDomain(brand, brand.prefix) ?? actionUrl(base, brand.prefix)) : null
  const noticeLink = m.notice?.link ? link(m.notice.link) : null
  /* The one link that is not Storelib's: a mailto to the buyer, on a creator's own sale email, when the address is a plain one. */
  const replyUrl = m.reply && m.audience === "creator" ? mailtoUrl(m.reply.email, m.reply.subject) : null
  const input: LayoutInput = {
    family: m.family,
    subject: cleanText(m.subject, 90),
    preview: cleanText(m.preview, 140),
    heading: m.heading,
    greeting: m.greet === false ? null : greeting(ctx, data),
    paragraphs: m.paragraphs.filter((p) => p && p.trim()),
    facts: factsOf(m),
    /* The product's own picture, sized for an inbox and https only; anything else draws the letter tile. */
    media: m.media && m.media.title ? { title: m.media.title, subtitle: m.media.subtitle ?? null, imageUrl: inboxPicture(m.media.imageUrl, MEDIA_PX) } : null,
    /* Each item's own picture, sized the same way. */
    order: sizedOrder(m.order),
    action: link(m.action),
    rate: m.rate ? { label: m.rate.label, links: m.rate.paths.map((path, i) => link({ label: `${i + 1} ${i === 0 ? "star" : "stars"}`, path })).filter((l): l is { label: string; url: string } => l !== null) } : null,
    secondary: replyUrl && m.reply ? { label: m.reply.label, url: replyUrl } : null,
    notice: m.notice ? { title: m.notice.title, text: m.notice.text, link: noticeLink } : null,
    note: m.note ?? null,
    reason: m.reason || (brand ? (brand.kind === "community" ? `You get this because you are a member of ${brand.name}.` : `You get this because you bought a membership from ${brand.name}.`) : reasonLine(m)),
    homeUrl: `${canonicalOrigin(base)}/`,
    brand: brand ? { name: brand.name, pictureUrl: brand.pictureUrl, picture: brand.picture, url: brandHome } : null,
    unsubscribeUrl: sameSiteUrl(base, ctx.unsubscribeUrl),
    unsubscribeLabel: m.unsubscribeLabel ?? null,
    // A customer has no settings page in /app to go to; the unsubscribe link is their way out.
    preferencesUrl: m.audience === "customer" ? null : sameSiteUrl(base, ctx.preferencesUrl),
  }
  /* Who the inbox shows as the sender: a template that asks for one (a review request, "<Seller> via Storelib"), or the community or creator the email is from, by its own name. Everything else stays Storelib. */
  const name = senderName(m.sender?.name)
  const sender = name ? { fromName: name, replyTo: replyAddress(m.sender?.replyTo), exact: false } : brand ? { fromName: brand.name, replyTo: brand.replyTo, exact: true } : null
  /* The one file an email may carry: the event's own calendar file on a ticket email, drawn from the same data as the words. */
  const calendar = m.calendar && m.calendar.text ? [{ filename: m.calendar.filename, content: new TextEncoder().encode(m.calendar.text), contentType: "text/calendar; charset=utf-8" }] : undefined
  return {
    subject: input.subject,
    preview: input.preview,
    html: renderHtml(input),
    text: renderText(input),
    fromName: sender?.fromName ?? null,
    replyTo: sender?.replyTo ?? null,
    ...(sender?.exact ? { fromNameExact: true } : {}),
    ...(calendar ? { attachments: calendar } : {}),
  }
}

export function renderInApp(type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext): InAppContent {
  const m = message(type, data, ctx)
  const path = m.inApp.actionPath && actionUrl(ctx.baseUrl, m.inApp.actionPath) ? m.inApp.actionPath : null
  return {
    title: cleanText(m.inApp.title, 120),
    body: cleanText(m.inApp.body, 300),
    actionUrl: path,
    actionLabel: path ? cleanText(m.inApp.actionLabel, 40) || "Open" : null,
  }
}
