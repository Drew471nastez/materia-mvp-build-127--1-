import "server-only"

/**
 * ===========================================================================
 *  WHO A STORE IS, FOR ITS BUYERS
 * ===========================================================================
 * Every receipt, order email and buyer case is signed by the store, and a
 * buyer has to be able to find their way back to it: its name, its logo, an
 * address that reaches a person, a phone if it gave one, its website. One
 * read, used everywhere, so none of them disagree.
 *
 *   name      Settings › Store details' store name, else the published
 *             website's brand name (with its logo below, so an email never
 *             pairs one name with another brand's logo), else the person's
 *             display name, else their username (lib/store/logo-server.ts)
 *   logo      Store details' logo (SQL part 118), else the published
 *             website's logo (an imported theme's too), else the person's
 *             photo, else none: lib/store/logo-server.ts, the same answer
 *             the checkout's header gives
 *   email     Store details' contact email (part 118), else the support
 *             email on the creator, else the owner's own address; never one
 *             of Storelib's relay addresses (+slb-)
 *   phone     Store details' phone, as saved
 *   website   the published website's address when there is one, else the
 *             store's page on storelib.com
 *
 * Every read is allowed to fail on its own: a database without part 118
 * still has a name and an email to sign with.
 */
import { getMainDomain } from "@/lib/url-helpers"
import { chooseStoreLogo, chooseStoreName, themeSettingsOf, websiteLogo } from "@/lib/store/logo-server"
import { addressLines, businessFromFields, taxIdFor } from "@/lib/checkout/business"
import { countryName } from "@/lib/checkout/countries"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface StoreIdentity {
  creatorId: string
  name: string
  logoUrl: string | null
  /** Where the logo came from, for Settings › Store details to say so. */
  logoFrom: "store" | "website" | "profile" | null
  email: string | null
  phone: string | null
  websiteUrl: string | null
  /**
   * The business that sells, for receipts and invoices (Settings › Store
   * details › Business details, SQL part 153): its legal name, its address
   * as envelope lines, and its tax number with what that is called there
   * ("VAT number RO12345678"). Null until the store fills it in.
   */
  legal: StoreLegal | null
}

export interface StoreLegal {
  name: string
  lines: string[]
  taxId: string | null
  /** "VAT number", "EIN", "ABN", "Tax ID". */
  taxIdLabel: string
}

/** The stored business details (store_settings.legal) as a receipt prints them; null when there are none. */
export function legalOf(raw: unknown): StoreLegal | null {
  const b = businessFromFields(raw)
  if (!b) return null
  return { name: b.company, lines: addressLines(b, countryName), taxId: b.taxId || null, taxIdLabel: taxIdFor(b.country).label }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const usable = (email: string) => !!email && email.includes("@") && !/\+slb-/i.test(email)

/**
 * `logoOnly`: Settings › Store details only wants the logo receipts fall back
 * to. The email lookup (a round trip to Supabase Auth) and the website's
 * address (more reads) each came AFTER the first reads, one after the other,
 * and the store settings route waited on all three in a row: the slowest
 * part of opening Store details. Skipped when only the logo is asked for.
 */
export async function storeIdentity(db: Db, creatorId: string, opts: { skipStoreLogo?: boolean; logoOnly?: boolean } = {}): Promise<StoreIdentity> {
  const [settingsRes, creatorRes, installRes, legalRes] = await Promise.all([
    db.from("store_settings").select("store_name, phone, logo_url, contact_email").eq("creator_id", creatorId).maybeSingle().then(
      (r: { data: unknown; error: unknown }) => (r.error ? db.from("store_settings").select("store_name, phone").eq("creator_id", creatorId).maybeSingle() : r),
      () => ({ data: null }),
    ),
    db.from("creators").select("display_name, username, slug, avatar_url, support_email, user_id").eq("id", creatorId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
    db.from("store_theme_installs").select("id, store_theme_settings ( settings )").eq("creator_id", creatorId).eq("status", "published").limit(1).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
    /* Its own read: a database without part 153 answers with an error here and nothing else. */
    db.from("store_settings").select("legal").eq("creator_id", creatorId).maybeSingle().then((r: { data?: { legal?: unknown } | null; error?: unknown }) => (r.error ? null : legalOf(r.data?.legal)), () => null),
  ])
  const s = ((settingsRes as { data?: Record<string, unknown> | null })?.data ?? {}) as Record<string, unknown>
  const c = ((creatorRes as { data?: Record<string, unknown> | null })?.data ?? {}) as Record<string, unknown>
  const install = (installRes as { data?: { id?: string; store_theme_settings?: unknown } | null })?.data
  const theme = themeSettingsOf(install)
  const [profile, website] = await Promise.all([
    typeof c.user_id === "string"
      ? db.from("profiles").select("display_name, username, avatar_url").eq("id", c.user_id).maybeSingle().then((r: { data?: Record<string, unknown> | null; error?: unknown }) => (r.error ? null : r.data ?? null), () => null)
      : Promise.resolve(null),
    websiteLogo(db, install).catch(() => null),
  ])

  /* The website's name goes with the website's logo: a store called OFFGRID on its website was signed "AndrewRullz" beside OFFGRID's logo. */
  const name = chooseStoreName({ store: s.store_name, theme, profile, creator: c }, "The store")
  const logo = chooseStoreLogo({ store: opts.skipStoreLogo ? "" : s.logo_url, website, photo: str(profile?.avatar_url) || str(c.avatar_url) })
  const logoUrl = logo.url
  const logoFrom: StoreIdentity["logoFrom"] = logo.from

  let email: string | null = null
  const legal = (legalRes as StoreLegal | null) ?? null
  if (opts.logoOnly) return { creatorId, name, logoUrl, logoFrom, email: null, phone: str(s.phone) || null, websiteUrl: null, legal }
  for (const e of [str(s.contact_email), str(c.support_email)]) {
    if (usable(e)) {
      email = e
      break
    }
  }
  if (!email && typeof c.user_id === "string") {
    try {
      const { data } = await db.auth.admin.getUserById(c.user_id)
      const own = str(data?.user?.email)
      if (usable(own)) email = own
    } catch {
      /* No address to add; the store page still has the name. */
    }
  }

  const handle = str(c.slug) || str(c.username)
  let websiteUrl: string | null = handle ? `https://${getMainDomain()}/${handle}` : null
  if (install && str(c.username)) {
    try {
      const { siteOrigin } = await import("@/lib/website-builder/site-seo-data")
      websiteUrl = await siteOrigin(creatorId, str(c.username))
    } catch {
      /* The storelib.com page stands in. */
    }
  }

  return { creatorId, name, logoUrl, logoFrom, email, phone: str(s.phone) || null, websiteUrl, legal }
}
