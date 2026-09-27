/**
 * ===========================================================================
 *  RENDERING A NOTIFICATION
 * ===========================================================================
 *   renderEmail(type, data, ctx)  subject, preview, HTML and plain text
 *   renderInApp(type, data, ctx)  title, body, action for the bell
 *
 * The words come from catalog.ts, the look from layout.ts, the escaping and
 * URL rules from escape.ts. An action is always ctx.baseUrl plus a path the
 * catalog wrote (the in-app half keeps the path, as the bell's links do). The
 * footer's unsubscribe and preferences links are used only when they point at
 * Storelib, and never on a security or receipt email.
 */
import type { InAppContent, NotificationType, RenderedEmail, TemplateContext } from "../types"
import { CATALOG, DATA_KEYS, Data, factsOf, type Audience, type Message } from "./catalog"
import { actionUrl, canonicalOrigin, cleanText, mailtoUrl, sameSiteUrl } from "./escape"
import { renderHtml, renderText, type LayoutInput } from "./layout"

export { DATA_KEYS, PATHS, formatMoney, formatDate } from "./catalog"
export { FAMILY_STYLES, EMAIL_LOGO_URL } from "./layout"

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

function greeting(ctx: TemplateContext): string {
  const first = cleanText(ctx.recipientName, 60).split(" ")[0]
  return first ? `Hi ${first},` : "Hi there,"
}

/** Whether a type is written to a customer (never links to /app) or a creator. */
export function audienceOf(type: NotificationType): Audience {
  return message(type, {}, { baseUrl: "https://storelib.com" }).audience
}

export function renderEmail(type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext): RenderedEmail {
  const m = message(type, data, ctx)
  const base = ctx.baseUrl
  const link = (l?: { label: string; path: string } | null) => {
    if (!l) return null
    const url = actionUrl(base, l.path)
    return url ? { label: l.label, url } : null
  }
  const noticeLink = m.notice?.link ? link(m.notice.link) : null
  /* The one link that is not Storelib's: a mailto to the buyer, on a creator's own sale email, when the address is a plain one. */
  const replyUrl = m.reply && m.audience === "creator" ? mailtoUrl(m.reply.email, m.reply.subject) : null
  const input: LayoutInput = {
    family: m.family,
    subject: cleanText(m.subject, 90),
    preview: cleanText(m.preview, 140),
    heading: m.heading,
    greeting: m.greet === false ? null : greeting(ctx),
    paragraphs: m.paragraphs.filter((p) => p && p.trim()),
    facts: factsOf(m),
    order: m.order ?? null,
    action: link(m.action),
    rate: m.rate ? { label: m.rate.label, links: m.rate.paths.map((path, i) => link({ label: `${i + 1} ${i === 0 ? "star" : "stars"}`, path })).filter((l): l is { label: string; url: string } => l !== null) } : null,
    secondary: replyUrl && m.reply ? { label: m.reply.label, url: replyUrl } : null,
    notice: m.notice ? { title: m.notice.title, text: m.notice.text, link: noticeLink } : null,
    note: m.note ?? null,
    reason: reasonLine(m),
    homeUrl: `${canonicalOrigin(base)}/`,
    unsubscribeUrl: sameSiteUrl(base, ctx.unsubscribeUrl),
    // A customer has no settings page in /app to go to; the unsubscribe link is their way out.
    preferencesUrl: m.audience === "customer" ? null : sameSiteUrl(base, ctx.preferencesUrl),
  }
  return { subject: input.subject, preview: input.preview, html: renderHtml(input), text: renderText(input) }
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
