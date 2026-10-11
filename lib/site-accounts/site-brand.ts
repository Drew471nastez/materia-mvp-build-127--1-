import "server-only"

/**
 * ===========================================================================
 *  THE STORE A WEBSITE'S EMAILS COME FROM
 * ===========================================================================
 * A sign in code from a creator's website is the store's email, so it looks
 * like the store's other emails to its buyers: the same name and logo its
 * receipts and order emails sign with (lib/store/identity-server.ts, what
 * Settings › Customer emails previews), and a reply reaches the store, not
 * Storelib.
 *
 *   name     the website's own name from the builder's Branding, else the
 *            store name from Store details, else the person's name
 *            (./brand.ts siteBrandName, then storeIdentity)
 *   logo     Store details' logo, else the website's, else none
 *   replyTo  an address the store chose to be written to (Store details'
 *            contact email, else the support email), else none and the
 *            platform's default. Never the owner's own login address, which
 *            storeIdentity falls back to: anyone can have a code sent, and
 *            would read it in the header.
 *
 * Every read may fail on its own: a code still goes, from the store's name.
 */
import { storeIdentity } from "@/lib/store/identity-server"
import { siteBrandName } from "./brand"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SiteBrand {
  name: string
  logoUrl: string | null
  replyTo: string | null
}

/** The builder's Branding name only, or "" (siteBrandName falls back to the person's name, which comes after Store details here). */
async function brandingName(db: Db, creatorId: string): Promise<string> {
  try {
    const { data: install } = await db
      .from("store_theme_installs")
      .select("id, store_theme_settings ( settings )")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle()
    const raw = (install as { store_theme_settings?: unknown } | null)?.store_theme_settings
    const row = Array.isArray(raw) ? raw[0] : raw
    const brand = (row as { settings?: { brand_name?: unknown } } | null)?.settings?.brand_name
    return typeof brand === "string" ? brand.trim().slice(0, 80) : ""
  } catch {
    return ""
  }
}

const usable = (v: unknown): string | null => {
  const e = typeof v === "string" ? v.trim() : ""
  return e && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e) && e.length <= 254 && !/\+slb-/i.test(e) ? e : null
}

/** The address the store chose for buyers to write to, or null. */
async function chosenReplyTo(db: Db, creatorId: string): Promise<string | null> {
  try {
    const { data } = await db.from("store_settings").select("contact_email").eq("creator_id", creatorId).maybeSingle()
    const own = usable((data as { contact_email?: unknown } | null)?.contact_email)
    if (own) return own
  } catch {
    /* A database without the column: the support email below. */
  }
  try {
    const { data } = await db.from("creators").select("support_email").eq("id", creatorId).maybeSingle()
    return usable((data as { support_email?: unknown } | null)?.support_email)
  } catch {
    return null
  }
}

export async function siteBrand(db: Db, creatorId: string): Promise<SiteBrand> {
  const [branding, identity, replyTo] = await Promise.all([brandingName(db, creatorId), storeIdentity(db, creatorId).catch(() => null), chosenReplyTo(db, creatorId)])
  const fromStore = identity && identity.name && identity.name !== "The store" ? identity.name : ""
  const name = branding || fromStore || (await siteBrandName(db, creatorId).catch(() => "this store"))
  return { name: name.slice(0, 80), logoUrl: identity?.logoUrl ?? null, replyTo }
}
