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
 *   name      Settings › Store details' store name, else the person's
 *             display name, else their username
 *   logo      Store details' logo (SQL part 118), else the published
 *             website's logo, else the person's photo, else none
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
import { mediaUrl } from "@/lib/storage/media-url"
import { getMainDomain } from "@/lib/url-helpers"

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
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const usable = (email: string) => !!email && email.includes("@") && !/\+slb-/i.test(email)

/** A picture's address as a page or an email can load it: a full URL, or a stored path through the media proxy. */
function absolute(v: string): string | null {
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const path = v.startsWith("/") ? v : mediaUrl(v)
  if (!path) return null
  return path.startsWith("http") ? path : `https://${getMainDomain()}${path.startsWith("/") ? "" : "/"}${path}`
}

export async function storeIdentity(db: Db, creatorId: string): Promise<StoreIdentity> {
  const [settingsRes, creatorRes, installRes] = await Promise.all([
    db.from("store_settings").select("store_name, phone, logo_url, contact_email").eq("creator_id", creatorId).maybeSingle().then(
      (r: { data: unknown; error: unknown }) => (r.error ? db.from("store_settings").select("store_name, phone").eq("creator_id", creatorId).maybeSingle() : r),
      () => ({ data: null }),
    ),
    db.from("creators").select("display_name, username, slug, avatar_url, support_email, user_id").eq("id", creatorId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
    db.from("store_theme_installs").select("store_theme_settings ( settings )").eq("creator_id", creatorId).eq("status", "published").limit(1).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
  ])
  const s = ((settingsRes as { data?: Record<string, unknown> | null })?.data ?? {}) as Record<string, unknown>
  const c = ((creatorRes as { data?: Record<string, unknown> | null })?.data ?? {}) as Record<string, unknown>
  const install = (installRes as { data?: { store_theme_settings?: unknown } | null })?.data
  const themeRow = Array.isArray(install?.store_theme_settings) ? install?.store_theme_settings[0] : install?.store_theme_settings
  const theme = ((themeRow as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>

  const name = str(s.store_name) || str(c.display_name) || str(c.username) || "The store"

  let logoUrl: string | null = null
  let logoFrom: StoreIdentity["logoFrom"] = null
  const candidates: [string, StoreIdentity["logoFrom"]][] = [
    [str(s.logo_url), "store"],
    [str(theme.logo_url), "website"],
    [str(c.avatar_url), "profile"],
  ]
  for (const [v, from] of candidates) {
    const url = absolute(v)
    if (url) {
      logoUrl = url
      logoFrom = from
      break
    }
  }

  let email: string | null = null
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

  return { creatorId, name, logoUrl, logoFrom, email, phone: str(s.phone) || null, websiteUrl }
}
