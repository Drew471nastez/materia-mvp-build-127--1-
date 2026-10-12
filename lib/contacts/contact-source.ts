/**
 * ===========================================================================
 *  WHERE A CONTACT CAME FROM
 * ===========================================================================
 * A creator's list fills from many doors: a sign-up box on a website they
 * built (on a Storelib subdomain or their own domain), the bar on their
 * Storelib profile, the one on a product page, their OnePage, a checkout
 * where the buyer ticked "keep me updated". The Subscribers table had one
 * word for all of that, and most doors wrote a word the page then read as
 * "Website" anyway.
 *
 * `subscribers.source_detail` holds what the server could see when the
 * person joined, and nothing it could not:
 *
 *   surface       which door: website, profile, onepage, product, checkout,
 *                 import, manual, api
 *   site          the website's address, when the door was a website
 *   form          which box on the page: newsletter, footer, contact, ...
 *   from          where the visit came from before that: a network or
 *                 search engine by name, "direct", or a referring site's
 *                 address (the order source's words, lib/orders/order-source)
 *   utm_source,   what the link carried, as words
 *   utm_campaign
 *   product       a checkout's product, by id (lib/contacts/checkout-contact)
 *
 * Hosts and known words only. No name, no address, no path, no query. Every
 * field is checked on its own and anything unknown is dropped, whether it
 * came from a page (which a stranger controls) or from a row.
 *
 * WRITTEN AFTER, AND ALLOWED TO FAIL. The column arrives with
 * supabase/sql/RUN_EMAIL_AUTOMATIONS.sql. Putting it in the insert would make
 * every sign-up fail until then, so it is a separate update, only ever onto a
 * row that has no source yet (the first door wins), and a missing column is
 * expected and quiet. A contact whose source was never recorded reads the
 * older one-word `source` column when that says something, and "Not
 * recorded" when it does not.
 */

import { cleanHost, cleanOrigin, fromLabel, surfaceOfPath, type OrderOrigin } from "@/lib/orders/order-source"
import { isOnePageHost } from "@/lib/onepage/address"
import { tt, msg } from "@/lib/i18n/text"

export const CONTACT_SURFACES = ["website", "profile", "onepage", "product", "checkout", "import", "manual", "api"] as const
export type ContactSurface = (typeof CONTACT_SURFACES)[number]

export const FORMS = ["newsletter", "footer", "contact", "section", "popup", "lead_magnet", "bar", "password"] as const
export type ContactForm = (typeof FORMS)[number]

export interface ContactSource {
  surface?: ContactSurface
  site?: string
  form?: ContactForm
  from?: string
  utm_source?: string
  utm_campaign?: string
  /** Checkout only: the product bought or left at checkout, by id. */
  product?: string
  /**
   * Website only: which page of it, as its page key ("contact", "home", a
   * page the creator made). A key is a known shape (lib/website-builder/
   * site-pages), not a path, so it carries no query and nothing a visitor
   * typed.
   */
  page?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The page key shape, the same rule lib/website-builder/site-pages.ts holds a key to. */
const PAGE_KEY = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

export const SURFACE_NAME: Record<ContactSurface, string> = {
  get website() { return tt("Website") },
  get profile() { return tt("Storelib profile") },
  onepage: "OnePage",
  get product() { return tt("Product page") },
  get checkout() { return tt("Checkout") },
  get import() { return tt("Import") },
  get manual() { return tt("Added by you") },
  api: "API",
}

export const FORM_NAME: Record<ContactForm, string> = {
  get newsletter() { return tt("Newsletter section") },
  get footer() { return tt("Footer sign-up") },
  get contact() { return tt("Contact form") },
  section: "Sign-up form",
  get popup() { return tt("Subscribe button") },
  get lead_magnet() { return tt("Free download") },
  get bar() { return tt("Subscribe bar") },
  get password() { return tt("Coming soon page") },
}

/** Every field checked on its own; null when nothing is left. */
export function cleanContactSource(input: unknown): ContactSource | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const out: ContactSource = {}
  if (typeof raw.surface === "string" && (CONTACT_SURFACES as readonly string[]).includes(raw.surface)) out.surface = raw.surface as ContactSurface
  if (typeof raw.form === "string" && (FORMS as readonly string[]).includes(raw.form)) out.form = raw.form as ContactForm
  /* The origin's own checks, for the fields the two share. Its surface list
     is a different one, so that is not passed through. */
  const origin = cleanOrigin({ site: raw.site, from: raw.from, utm_source: raw.utm_source, utm_campaign: raw.utm_campaign })
  if (origin?.site) out.site = origin.site
  if (origin?.from) out.from = origin.from
  if (origin?.utm_source) out.utm_source = origin.utm_source
  if (origin?.utm_campaign) out.utm_campaign = origin.utm_campaign
  if (out.site && !out.surface) out.surface = "website"
  if (out.surface !== "website" && out.surface !== "checkout") delete out.site
  if (out.surface === "checkout" && typeof raw.product === "string" && UUID.test(raw.product)) out.product = raw.product.toLowerCase()
  if (out.surface === "website" && typeof raw.page === "string" && PAGE_KEY.test(raw.page)) out.page = raw.page
  return Object.keys(out).length > 0 ? out : null
}

/**
 * The older one-word column, for a contact from before the detail. Only the
 * words the app has actually written; anything else says nothing.
 */
export function legacySurface(source: unknown): ContactSurface | null {
  switch (source) {
    case "onepage":
    case "onepage_email_capture":
      return "onepage"
    case "website_builder_newsletter":
    case "store_builder":
    /* A message sent through a website's contact form (lib/site-contact). */
    case "contact_form":
      return "website"
    case "creator_page":
      return "profile"
    case "checkout":
      return "checkout"
    default:
      return null
  }
}

export interface SourceView {
  /** The group a filter chooses by: a website's address, or a door's name. */
  key: string
  /** "andrewrullz.storelib.com", "OnePage", "Checkout", "Not recorded". */
  label: string
  /** "Footer sign-up · from Instagram · utm_campaign spring", or "". */
  detail: string
  recorded: boolean
}

export const NOT_RECORDED = msg("Not recorded")

/** How a contact's source reads in a table cell and in a filter. */
export function sourceView(detail: unknown, legacy?: unknown): SourceView {
  const d = cleanContactSource(detail)
  const surface = d?.surface ?? legacySurface(legacy)
  if (!surface) return { key: "none", label: NOT_RECORDED, detail: "", recorded: false }
  const site = d?.site
  const label = surface === "website" && site ? site : surface === "checkout" && site ? tt("Checkout on {site}", { site }) : SURFACE_NAME[surface]
  const key = surface === "website" && site ? `site:${site}` : surface
  const parts: string[] = []
  if (d?.form) parts.push(d.page && d.page !== "home" ? `${FORM_NAME[d.form]} on /${d.page}` : FORM_NAME[d.form])
  if (d?.from) parts.push(d.from === "direct" ? tt("Direct") : tt("from {name}", { name: fromLabel(d.from) }))
  /* The tag names as they are in the link. i18n-ignore-start */
  if (d?.utm_campaign) parts.push(`utm_campaign ${d.utm_campaign}`)
  else if (d?.utm_source) parts.push(`utm_source ${d.utm_source}`)
  /* i18n-ignore-end */
  return { key, label, detail: parts.join(" · "), recorded: true }
}

/** "Joined from andrewrullz.storelib.com", "Joined from OnePage", "Bought on andrewrullz.storelib.com". */
export function joinedSentence(detail: unknown, trigger?: string): string | null {
  const d = cleanContactSource(detail)
  if (!d?.surface) return null
  if (trigger === "abandoned_checkout") return d.site ? tt("Left checkout on {site}", { site: d.site }) : tt("Left checkout on Storelib")
  if (trigger === "purchase" || trigger === "first_purchase" || d.surface === "checkout") {
    return d.site ? tt("Bought on {site}", { site: d.site }) : d.surface === "checkout" ? tt("Bought on Storelib") : tt("Bought from {surface}", { surface: SURFACE_NAME[d.surface] })
  }
  if (d.surface === "website") return d.site ? tt("Joined from {site}", { site: d.site }) : tt("Joined from a website")
  return tt("Joined from {value}", { value: d.surface === "profile" ? tt("your Storelib profile") : SURFACE_NAME[d.surface] })
}

/* ─── Working it out on the server ──────────────────────────────────── */

const MAIN_DOMAIN = () => (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").toLowerCase()

function isPlatformHost(host: string): boolean {
  const main = MAIN_DOMAIN()
  return host === main || isOnePageHost(host) || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")
}

function refererUrl(request: Request | null | undefined): URL | null {
  const referer = request?.headers.get("referer")
  if (!referer) return null
  try {
    return new URL(referer)
  } catch {
    return null
  }
}

/**
 * What the route knows, joined with what the page said about itself.
 *
 * The door is the route's to decide (`surface`), or the calling page's
 * address when the route serves several doors. A website's address is the
 * page's own host from the Referer header the browser sets, when that is not
 * Storelib's: a sign-up box on a built site posts to its own origin. What
 * the page sent (`sent`, from lib/orders/checkout-origin-browser pageOrigin)
 * contributes only where the visit came from and the utm words, each checked.
 */
export function contactSourceFrom(input: {
  request?: Request | null
  surface?: ContactSurface
  form?: ContactForm
  sent?: unknown
  /** Which page of the website, as a page key. Kept only for a website. */
  page?: string
}): ContactSource | null {
  const url = refererUrl(input.request)
  const host = url ? cleanHost(url.host.split(":")[0]) : undefined
  const sent = (input.sent && typeof input.sent === "object" ? input.sent : {}) as Partial<OrderOrigin> & Record<string, unknown>
  let surface = input.surface
  let site: string | undefined
  if (host && isOnePageHost(host)) {
    /* storelib.me serves nothing but OnePages, so a form posted from it joined from one. */
    if (!surface || surface === "profile" || surface === "product") surface = "onepage"
  } else if (host && !isPlatformHost(host)) {
    /* A creator's domain answers /links with their OnePage. */
    if (url && /^\/links\/?$/.test(url.pathname) && surface !== "website") surface = "onepage"
    else {
      site = host
      if (!surface || surface === "profile" || surface === "product") surface = "website"
    }
  } else if (url && (!surface || surface === "profile")) {
    const onPage = surfaceOfPath(url.pathname)
    if (onPage === "product" || onPage === "onepage" || onPage === "profile") surface = onPage
  }
  if (surface === "website" && !site && typeof sent.site === "string") site = cleanHost(sent.site)
  return cleanContactSource({
    surface,
    site,
    form: input.form,
    from: sent.from,
    utm_source: sent.utm_source,
    utm_campaign: sent.utm_campaign,
    page: input.page,
  })
}

/** An order's origin as the source of a contact who joined at its checkout, with the product when known. */
export function contactSourceOfOrder(origin: OrderOrigin | null | undefined, productId?: string | null): ContactSource {
  const clean = cleanOrigin(origin ?? null)
  return (
    cleanContactSource({
      surface: "checkout",
      site: clean?.surface === "website" ? clean.site : undefined,
      from: clean?.from,
      utm_source: clean?.utm_source,
      utm_campaign: clean?.utm_campaign,
      product: productId ?? undefined,
    }) ?? { surface: "checkout" }
  )
}

/* ─── Writing it down ───────────────────────────────────────────────── */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Best effort, never thrown, first door wins: only a row with no detail yet
 * is written. A missing column is expected until the SQL runs.
 */
export async function recordContactSource(db: Db, creatorId: string, email: string, source: ContactSource | null): Promise<void> {
  const clean = cleanContactSource(source)
  if (!clean || !creatorId || !email) return
  try {
    const { error } = await db
      .from("subscribers")
      .update({ source_detail: clean })
      .eq("creator_id", creatorId)
      .eq("email", email.trim().toLowerCase())
      .is("source_detail", null)
    if (error && !/source_detail/.test(String(error.message))) console.warn("[contacts] could not record where a contact came from:", error.code)
  } catch (error) {
    console.warn("[contacts] could not record where a contact came from:", (error as Error)?.name)
  }
}
