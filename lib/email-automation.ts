/**
 * ===========================================================================
 *  WHAT EVERY AUTOMATED EMAIL A CREATOR SENDS MUST CARRY
 * ===========================================================================
 * A creator's automations (the welcome email on the Emails page, and the one
 * after a purchase) are marketing email from that creator to a person on
 * their list. Two things were missing from every one of them:
 *
 *   a way out     no unsubscribe link and no List-Unsubscribe header, which
 *                 the law requires of marketing email and which Gmail and
 *                 Yahoo require of any bulk sender before they will deliver
 *   a check       a delayed email was queued at sign-up and sent days later
 *                 whether or not the person had unsubscribed in between
 *
 * Both the immediate send (triggerEmailFlows in lib/email.tsx) and the
 * delayed one (app/api/cron/process-scheduled-emails) go through here, so
 * they cannot drift apart again.
 */

import { DEFAULT_BRAND, brandName, hexColor, httpsUrl, themeOf, type Brand } from "@/lib/email-campaigns/brand"
import { richToEmail } from "@/lib/email-campaigns/rich"
import { buildEmail, emailText } from "@/lib/email-campaigns/template"
import { resolveVariables, unsubscribePageFor, type ResolveOptions, type VariableValues } from "@/lib/email-variables"

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com").replace(/\/$/, "")

/** Statuses that mean "do not email this person", however they got there. */
const SUPPRESSED = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

export interface Standing {
  /** True when this address must not get an automated email from this creator. */
  suppressed: boolean
  /** Their unsubscribe token, when they are on the list. */
  unsubscribeToken: string | null
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Where this address stands with this creator's list.
 *
 * An address with no row at all is not suppressed: a buyer who never joined
 * the list still gets the creator's purchase follow-up, as they always have.
 * They get no unsubscribe link either, because there is nothing to leave.
 */
export async function standingOf(db: Db, creatorId: string, email: string): Promise<Standing> {
  const { data, error } = await db
    .from("subscribers")
    .select("status, is_active, unsubscribe_token")
    .eq("creator_id", creatorId)
    .eq("email", email.toLowerCase().trim())
    .maybeSingle()
  if (error || !data) return { suppressed: false, unsubscribeToken: null }
  const status = typeof data.status === "string" ? data.status : ""
  return {
    suppressed: SUPPRESSED.has(status) || data.is_active === false,
    unsubscribeToken: typeof data.unsubscribe_token === "string" ? data.unsubscribe_token : null,
  }
}

export function unsubscribeUrlFor(token: string): string {
  return unsubscribePageFor(token)
}

/** What the older sending paths know about one email: the person, the product, and the creator when they read it. */
export interface PersonalValues {
  name?: string
  product?: string
  /** The creator's name to sign with ("[Your name]", {{creator_name}}). */
  creatorName?: string
  storeName?: string
  storeUrl?: string | null
}

/**
 * The editor's own placeholders, typed as words in an older default text,
 * turned into the tags they meant so the one resolver fills them.
 */
function typedOut(content: string): string {
  return content.replace(/Customer Name/g, "{{name}}").replace(/Product Name/g, "{{product_name}}")
}

function valuesOf(values: PersonalValues): VariableValues {
  return {
    name: values.name,
    product_name: values.product,
    creator_name: values.creatorName,
    store_name: values.storeName,
    store_url: values.storeUrl,
  }
}

/**
 * Every tag, the older {{customer_name}} / {{product_name}}, the typed-out
 * "Customer Name", and bracket placeholders like "[Your name]", filled by the
 * one resolver (lib/email-variables). What the caller does not know (the
 * creator's name on the oldest path) is filled by automationEmail's sweep,
 * which does.
 */
export function personalize(content: string, values: PersonalValues): string {
  return resolveVariables(typedOut(content), valuesOf(values), "html", optionsFor(values))
}

/**
 * The same personalization for a subject line, which is text, not HTML. A
 * subject is sent as it comes back from here (lib/email.tsx), with no sweep
 * after it, so nothing is left for later: a creator placeholder the caller
 * could not fill is taken out rather than sent.
 */
export function personalizeText(content: string, values: PersonalValues): string {
  return resolveVariables(typedOut(content), valuesOf(values), "text", { fallbacks: { product_name: "your product" } })
}

/** Without the creator read, their placeholders wait for automationEmail's sweep, which has them. */
function optionsFor(values: PersonalValues): ResolveOptions {
  const creatorKnown = Boolean(values.creatorName?.trim() || values.storeName?.trim())
  return {
    fallbacks: { product_name: "your product" },
    leave: creatorKnown ? ["unsubscribe_url"] : ["creator_name", "store_name", "store_url", "unsubscribe_url"],
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

export function stripHtml(html: string): string {
  return html
    /* A paragraph ends with a blank line after it; a line break is one. */
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)\s*>/gi, "\n\n")
    .replace(/<(br|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
}

/**
 * The address a mail client posts to for one-click unsubscribe (RFC 8058).
 * An API route, not the page: the page is for a person, the route answers
 * the POST "List-Unsubscribe=One-Click" that Gmail and Yahoo send.
 */
export function oneClickUrlFor(token: string): string {
  return `${APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}

/**
 * The automation engine's reading of the creator's look (its Identity, read
 * in lib/automations/supabase-store.ts), in the layout's terms. The postal
 * address is not part of it; the mailer adds it when it sends.
 */
export function brandOfIdentity(identity: {
  fromName: string
  storeUrl: string
  brand?: { name: string; logoUrl: string | null; accentColor: string }
}): Brand {
  return {
    name: brandName(identity.brand?.name, identity.fromName),
    logoUrl: httpsUrl(identity.brand?.logoUrl ?? null),
    storeUrl: httpsUrl(identity.storeUrl),
    accent: hexColor(identity.brand?.accentColor) ?? DEFAULT_BRAND.accent,
    address: null,
  }
}

/**
 * The finished email, in the one layout every email a creator sends is drawn
 * in (lib/email-campaigns/template.ts): the creator's body written again as
 * email HTML (lib/email-campaigns/rich.ts), their brand when the caller has
 * read it, and a footer that says who it is from, why the reader got it,
 * and how to stop.
 *
 * Without a brand it draws with the name alone, which is what the older
 * sending paths (lib/email.tsx before the engine's SQL, the cron's legacy
 * queue) have to hand; the engine (lib/automations/run.ts) passes the whole
 * brand.
 *
 * WHY THEY GET IT. Somebody who joined the list is told so; a buyer who
 * never asked for news (a "customer" contact) is told they bought from the
 * creator, never that they joined a list they did not join.
 */
export function automationEmail(input: {
  body: string
  fromName: string
  unsubscribeToken: string | null
  subject?: string
  previewText?: string | null
  brand?: Brand
  avatarUrl?: string | null
  openPixelUrl?: string | null
  /** Why they are on the creator's contacts: joined the list, or bought. */
  because?: "subscribed" | "customer" | null
}): { html: string; text: string; headers?: Record<string, string> } {
  const brand: Brand = input.brand ?? { ...DEFAULT_BRAND, name: brandName(input.fromName) }
  const url = input.unsubscribeToken ? unsubscribeUrlFor(input.unsubscribeToken) : null
  /* THE LAST SWEEP. The engine hands a body already filled; the older paths
     (lib/email.tsx, the cron's queue) fill only the person and the product.
     Whatever is left, "[Your name]" in a flow saved from an older preset, a
     {{creator_name}}, a tag nobody knows, is filled here with the creator as
     the caller read them, or removed: a sent email never shows a placeholder. */
  const known: VariableValues = { creator_name: input.fromName, store_name: brand.name, store_url: brand.storeUrl, unsubscribe_url: url }
  const bodyHtml = richToEmail(resolveVariables(input.body, known, "html"), themeOf(brand))
  const subject = input.subject ? resolveVariables(input.subject, known, "text") : undefined
  const previewText = input.previewText ? resolveVariables(input.previewText, known, "text") : input.previewText
  const reason = input.because === "customer" ? `You are getting this because you bought from ${brand.name}.` : url ? null : `Sent by ${brand.name}.`
  const html = buildEmail({
    subject: subject ?? brand.name,
    previewText: previewText ?? null,
    bodyHtml,
    brand,
    avatarUrl: input.avatarUrl ?? null,
    kind: url ? "marketing" : "transactional",
    reason,
    unsubscribeUrl: url,
    openPixelUrl: input.openPixelUrl ?? null,
  })
  const text = emailText({ bodyHtml, brand, kind: url ? "marketing" : "transactional", reason, unsubscribeUrl: url })
  const headers =
    url && input.unsubscribeToken
      ? { "List-Unsubscribe": `<${oneClickUrlFor(input.unsubscribeToken)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined
  return { html, text, headers }
}
