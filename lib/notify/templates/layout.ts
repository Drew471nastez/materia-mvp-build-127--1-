/**
 * ===========================================================================
 *  THE ONE LAYOUT STORELIB'S OWN NOTIFICATION EMAILS ARE DRAWN IN
 * ===========================================================================
 * Not a creator's store email (that is lib/email-campaigns/template.ts): this
 * is Storelib writing to the people who use it. Every notification type is a
 * Message (plain text pieces, see catalog.ts) poured into this one layout.
 * The families differ only by small accents, never by structure:
 *
 *   base             plain card
 *   action_required  a thin amber line on the card and a quiet "Action needed"
 *                    label; one clear button
 *   success          a thin green line
 *   security         a "Security notice" label, the time, and a boxed "If this
 *                    was not you" with a link to account settings. Never an
 *                    unsubscribe link.
 *   transaction      a facts table (amount, product, date)
 *   receipt          a facts table and "keep this email for your records"
 *   digest           a "Summary" label and a facts table
 *   lifecycle        a gentle reminder; says it can be turned off
 *   marketing        always carries the unsubscribe link when one is given
 *
 * The drawing itself is the one every Storelib email shares
 * (lib/emails/layout.ts): white page, the Storelib mark on top, one near
 * black button, dark mode, a preheader and a plain text twin. This file
 * only says what goes where for a notification: the family's label, the
 * facts, the order, the stars, the notice, and the footer's links. A family
 * label is a small coloured word over the heading, never a coloured bar.
 *
 * renderText writes the same message as readable plain text with every
 * link spelled out; it is not stripped HTML.
 *
 * Every value that reaches the HTML is escaped by the shared blocks. Links
 * arrive already checked (escape.ts actionUrl / sameSiteUrl).
 */
import type { TemplateFamily } from "../types"
import { emailDocument, emailKit, EMAIL_LOGO_URL as SHARED_LOGO_URL, ITEM_PX, type EmailKit } from "@/lib/emails/layout"

/**
 * The Storelib logo every platform email uses (lib/email.tsx too): a PNG,
 * because Outlook has no webp, with its 7px corners cut into the file,
 * because Outlook on Windows ignores border-radius. From storelib.com itself.
 */
export const EMAIL_LOGO_URL = SHARED_LOGO_URL

export interface Fact {
  label: string
  value: string
}

export interface Link {
  label: string
  url: string
}

/** A row of money under an order's items: "Subtotal", "Discount (SPRING)", "Total". */
export interface SummaryRow {
  label: string
  value: string
  strong?: boolean
}

/**
 * An order drawn as a store platform draws one: a header with the number and
 * the time, one row per item, the totals, what the seller receives, then
 * small sections of facts (the customer, the payment).
 */
export interface OrderSummary {
  title: string
  subtitle?: string | null
  /** imageUrl: the item's picture, https and already sized for an inbox (ITEM_PX); none draws a letter tile. */
  lines: { title: string; detail?: string | null; amount: string; imageUrl?: string | null }[]
  totals: SummaryRow[]
  payout?: SummaryRow[]
  sections?: { title: string; rows: Fact[] }[]
}

/** One thing the email is about: a picture, a name, and a line under it. */
export interface Media {
  title: string
  subtitle?: string | null
  /** An absolute https address, already sized for an inbox. Null draws the letter tile. */
  imageUrl?: string | null
}

/** Everything the layout draws. Plain text only; the layout escapes it. */
export interface LayoutInput {
  family: TemplateFamily
  subject: string
  preview: string
  heading: string
  greeting?: string | null
  paragraphs: string[]
  facts?: Fact[]
  /**
   * What the email is about, drawn as one small card under the heading: the
   * product a review is asked about, by its picture, its name and who made
   * it. No picture draws a tile with the title's first letter, never a
   * broken image.
   */
  media?: Media | null
  /** An order summary, drawn after the paragraphs (a sale). */
  order?: OrderSummary | null
  action?: Link | null
  /** Five linked stars above the button: each opens the review form with that many chosen. */
  rate?: { label: string; links: Link[] } | null
  /** A quiet text link under the button: "Reply to the customer". */
  secondary?: Link | null
  /** A boxed note under the button: the security "If this was not you". */
  notice?: { title: string; text: string; link?: Link | null } | null
  /** A small grey line after everything: "You can turn these reminders off in settings." */
  note?: string | null
  /** Why the reader gets this, one sentence, in the footer. */
  reason: string
  homeUrl: string
  unsubscribeUrl?: string | null
  /** What the unsubscribe link says, when it turns off one kind of email rather than all of them. */
  unsubscribeLabel?: string | null
  preferencesUrl?: string | null
}

interface FamilyStyle {
  /** The thin line across the top of the card. */
  accent: string | null
  /** A small label above the heading, sentence case. */
  label: string | null
  labelColor: string
  /** May a footer carry an unsubscribe link at all. */
  unsubscribable: boolean
}

export const FAMILY_STYLES: Record<TemplateFamily, FamilyStyle> = {
  base: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
  action_required: { accent: "#d97706", label: "Action needed", labelColor: "#b45309", unsubscribable: true },
  success: { accent: "#16a34a", label: null, labelColor: "#15803d", unsubscribable: true },
  security: { accent: "#475569", label: "Security notice", labelColor: "#475569", unsubscribable: false },
  transaction: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
  receipt: { accent: null, label: "Receipt", labelColor: "#6b7280", unsubscribable: false },
  digest: { accent: null, label: "Summary", labelColor: "#6b7280", unsubscribable: true },
  lifecycle: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
  marketing: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
}

/** Whether a footer shows the unsubscribe link for this family and context. */
export function showsUnsubscribe(family: TemplateFamily, unsubscribeUrl?: string | null): boolean {
  return Boolean(unsubscribeUrl) && FAMILY_STYLES[family].unsubscribable
}

/** The drawn size the product picture is fetched at (lib/notify/templates/index.ts sizes it). */
export const MEDIA_PX = 64
/** The drawn size of an order line's picture: the shared layout's item thumbnail. */
export { ITEM_PX }

/** An order: its number and time, one row per item, the totals, what the seller receives, then small fact sections. */
function orderBlocks(k: EmailKit, o: OrderSummary): string[] {
  const out: string[] = [k.section(o.title)]
  if (o.subtitle) out.push(k.small(o.subtitle, { below: 4 }))
  /* Pictures when any item has one; an item without one gets a letter tile beside the others, never a broken image. */
  const pictures = o.lines.some((l) => !!l.imageUrl)
  out.push(k.items(o.lines.map((l) => ({ title: l.title, detail: l.detail ?? null, amount: l.amount, imageUrl: l.imageUrl ?? null })), { pictures }))
  out.push(k.totals(o.totals, { below: o.payout?.length ? 0 : 24 }))
  if (o.payout?.length) out.push(k.totals(o.payout))
  for (const sec of o.sections ?? []) {
    if (!sec.rows.length) continue
    out.push(k.small(sec.title, { below: 6 }))
    out.push(k.facts(sec.rows, { labelWidth: "35%" }))
  }
  return out
}

/**
 * The footer's small links. An email about one order or payment (a new
 * order, a return asked for) is transactional: it has no Unsubscribe, only
 * the settings where order emails are turned off. Reminders, digests and
 * lifecycle mail carry the Unsubscribe link their sender gives.
 */
function footerLinks(input: LayoutInput): Link[] {
  if (!FAMILY_STYLES[input.family].unsubscribable) return []
  const links: Link[] = []
  if (input.preferencesUrl) links.push({ label: "Notification settings", url: input.preferencesUrl })
  /* A buyer's link turns off one kind of email, so it says which one rather than "Unsubscribe". */
  if (showsUnsubscribe(input.family, input.unsubscribeUrl)) links.push({ label: input.unsubscribeLabel || "Unsubscribe", url: input.unsubscribeUrl as string })
  return links
}

/** The whole email as HTML. */
export function renderHtml(input: LayoutInput): string {
  const style = FAMILY_STYLES[input.family]
  const k = emailKit({ kind: "storelib", homeUrl: input.homeUrl })
  const rows: string[] = [k.heading(input.heading, { label: style.label, labelColor: style.labelColor })]
  if (input.greeting) rows.push(k.text(input.greeting))
  if (input.media && input.media.title) rows.push(k.media({ title: input.media.title, subtitle: input.media.subtitle ?? null, imageUrl: input.media.imageUrl ?? null }))
  for (const p of input.paragraphs) rows.push(k.text(p))
  if (input.facts && input.facts.length) rows.push(k.facts(input.facts))
  if (input.order) rows.push(...orderBlocks(k, input.order))
  if (input.notice) rows.push(k.notice({ title: input.notice.title, text: input.notice.text, link: input.notice.link ?? null }))
  /* Big enough to press on a phone (44px cells), amber like the stars on the page, plain text characters so they draw with images off. */
  if (input.rate && input.rate.links.length === 5) rows.push(k.stars(input.rate.links, input.rate.label))
  if (input.action) rows.push(k.button(input.action.label, input.action.url))
  if (input.secondary) rows.push(k.link(input.secondary.label, input.secondary.url))
  if (input.action) rows.push(k.fallback(input.action.url))
  if (input.note) rows.push(k.small(input.note))
  return emailDocument({
    sender: { kind: "storelib", homeUrl: input.homeUrl },
    subject: input.subject,
    preview: input.preview,
    rows,
    footer: { reason: input.reason, links: footerLinks(input) },
  })
}

/** The same message as plain text: readable on its own, every link written out. */
export function renderText(input: LayoutInput): string {
  const style = FAMILY_STYLES[input.family]
  const blocks: string[] = []
  blocks.push(style.label ? `${style.label}: ${input.heading}` : input.heading)
  if (input.greeting) blocks.push(input.greeting)
  if (input.media && input.media.title) blocks.push([input.media.title, input.media.subtitle].filter(Boolean).join("\n"))
  blocks.push(...input.paragraphs)
  if (input.facts && input.facts.length) blocks.push(input.facts.map((f) => `${f.label}: ${f.value}`).join("\n"))
  if (input.order) {
    const o = input.order
    blocks.push([o.title, o.subtitle].filter(Boolean).join("\n"))
    blocks.push(o.lines.map((l) => `${l.title}${l.detail ? ` (${l.detail})` : ""}: ${l.amount}`).join("\n"))
    const money = [...o.totals, ...(o.payout ?? [])]
    if (money.length) blocks.push(money.map((r) => `${r.label}: ${r.value}`).join("\n"))
    for (const sec of o.sections ?? []) {
      if (sec.rows.length) blocks.push([sec.title, ...sec.rows.map((f) => `${f.label}: ${f.value}`)].join("\n"))
    }
  }
  if (input.notice) {
    const lines = [input.notice.title, input.notice.text]
    if (input.notice.link) lines.push(`${input.notice.link.label}: ${input.notice.link.url}`)
    blocks.push(lines.join("\n"))
  }
  if (input.rate && input.rate.links.length) {
    blocks.push([input.rate.label, ...input.rate.links.map((l) => `${l.label}: ${l.url}`)].join("\n"))
  }
  if (input.action) blocks.push(`${input.action.label}:\n${input.action.url}`)
  if (input.secondary) blocks.push(`${input.secondary.label}: ${input.secondary.url.replace(/^mailto:/, "").replace(/\?.*$/, "")}`)
  if (input.note) blocks.push(input.note)
  const foot = ["--", "Storelib", input.reason]
  for (const l of footerLinks(input)) foot.push(`${l.label}: ${l.url}`)
  blocks.push(foot.join("\n"))
  return blocks.join("\n\n") + "\n"
}
