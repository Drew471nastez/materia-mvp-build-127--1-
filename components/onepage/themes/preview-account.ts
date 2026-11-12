/**
 * ===========================================================================
 *  THE THEME CARDS SHOW THIS CREATOR'S OWN PAGE (round AT)
 * ===========================================================================
 * The owner: "instead of adding those cartoonish avatars, you can actually
 * fetch in the themes the actual avatar and profile of the creator ... of
 * that account", "for the theme's name, you can actually fetch the actual
 * name of the creator", "the buttons and offers ... make them better and
 * more accurate".
 *
 * Round AS drew a made-up creator with a drawn portrait on every card. Now
 * every card draws the page the editor already holds: its name (the
 * OnePage's title, "Your name" without one, as the Share sheet says it), its
 * photo (or the live page's monogram), its bio, its social icons, its own
 * links with their thumbnails, its own products with their prices and
 * pictures, and its newsletter's words. Nothing new is fetched: it is all
 * in the page the editor loaded (a product block keeps its product's title,
 * price and picture, lib/onepage/types ProductBlockData).
 *
 * What the page does not have yet is filled with plain sample blocks (two
 * links, two products, a newsletter) in the reader's language, so a new
 * account still sees every theme's buttons, products and signup. A sample
 * picture is a quiet tint of the theme's own colours, never a drawing.
 *
 * Built once per grid (the Design tab's Theme page, the onboarding's
 * template step) and handed to every card, so 50 cards read one object.
 */
import { tt } from "@/lib/i18n/text"
import { productPriceParts } from "@/lib/onepage/product-block"

export type PreviewLink = { label: string; picture: string | null; sample: boolean }
export type PreviewProduct = { title: string; price: string; picture: string | null; cta: string; sample: boolean }
export type PreviewNews = { headline: string; desc: string; button: string }

export type PreviewAccount = {
  name: string
  bio: string
  /** The photo's address, or null for the live page's monogram. */
  avatar: string | null
  socials: readonly string[]
  /** Always at least two: the page's own first, then samples. */
  links: readonly PreviewLink[]
  /** Always at least two: the page's own first, then samples. */
  products: readonly PreviewProduct[]
  news: PreviewNews
}

/** What of the page a card reads: the editor's OnePage, or the onboarding's answers so far. */
export type PreviewSource = {
  title?: string | null
  bio?: string | null
  avatar_url?: string | null
  social_links?: object | null
  draft_blocks?: readonly { type: string; enabled?: boolean; data?: unknown }[] | null
}

const SOCIAL_ORDER = ["instagram", "tiktok", "youtube", "twitter", "threads", "spotify", "twitch", "linkedin", "facebook", "pinterest", "soundcloud", "discord", "github", "patreon", "snapchat", "telegram", "whatsapp", "kick", "website", "email"]
const SAMPLE_SOCIALS = ["instagram", "tiktok", "youtube"] as const

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
const picture = (...urls: unknown[]): string | null => {
  for (const u of urls) if (typeof u === "string" && u.trim()) return u.trim()
  return null
}

/** A link block's thumbnail, as the page draws it: the creator's own, else the address's preview picture. */
function linkPicture(d: Record<string, any>): string | null {
  const preview = d.link_preview && d.link_preview.enabled !== false && !d.link_preview.image_hidden ? d.link_preview.image : null
  return picture(d.thumbnail_url, d.spotify_thumbnail, preview)
}

/** The newsletter's button words, as the live page picks them (components/onepage/public-onepage getButtonText). */
function newsButton(d: Record<string, any>): string {
  if (d.button_preset === "custom" && clean(d.custom_button_text)) return clean(d.custom_button_text)
  const preset: Record<string, string> = { subscribe: "Subscribe", join: "Join Now", get_access: "Get Access", download: "Download", sign_up: "Sign Up", unlock: "Unlock Now" }
  return preset[d.button_preset || "subscribe"] || clean(d.button_text) || "Subscribe"
}

export function previewAccountOf(page: PreviewSource | null | undefined, money: (cents: number) => string): PreviewAccount {
  const blocks = (page?.draft_blocks ?? []).filter((b) => b && b.enabled !== false)
  const links: PreviewLink[] = []
  const products: PreviewProduct[] = []
  let news: PreviewNews | null = null
  const fromRow: string[] = []
  for (const b of blocks) {
    const d = (b.data ?? {}) as Record<string, any>
    if (b.type === "link_button" && clean(d.label) && links.length < 3) links.push({ label: clean(d.label), picture: linkPicture(d), sample: false })
    else if (b.type === "product" && clean(d.product_title) && products.length < 2) {
      const parts = productPriceParts(d, money)
      products.push({ title: clean(d.product_title), price: parts.free ? "Free" : `${parts.prefix === "from" ? "From " : ""}${parts.now}`, picture: picture(d.custom_thumbnail, d.product_cover, d.product_thumbnail), cta: clean(d.cta_text) || "Get My Guide", sample: false })
    } else if (b.type === "email_capture" && !news) news = { headline: clean(d.headline) || tt("Join my newsletter"), desc: clean(d.description), button: newsButton(d) }
    else if (b.type === "social_row" && Array.isArray(d.platforms)) for (const p of d.platforms) if (p?.platform && p.url) fromRow.push(String(p.platform))
  }
  const own = (page?.social_links ?? {}) as Record<string, unknown>
  const socials = [...new Set([...SOCIAL_ORDER.filter((k) => clean(own[k])), ...fromRow])].slice(0, 4)

  const sampleLinks: PreviewLink[] = [
    { label: tt("Book a call"), picture: null, sample: true },
    { label: tt("Latest video"), picture: null, sample: true },
  ]
  while (links.length < 2) links.push(sampleLinks[links.length])
  const sampleProducts: PreviewProduct[] = [
    { title: tt("Starter guide"), price: money(1900), picture: null, cta: tt("Buy now"), sample: true },
    { title: tt("One to one session"), price: money(4900), picture: null, cta: tt("Buy now"), sample: true },
  ]
  while (products.length < 2) products.push(sampleProducts[products.length])

  return {
    name: clean(page?.title) || tt("Your name"),
    bio: clean(page?.bio),
    avatar: picture(page?.avatar_url),
    socials: socials.length ? socials : SAMPLE_SOCIALS,
    links,
    products,
    news: news ?? { headline: tt("Join my newsletter"), desc: tt("New work and news, now and then."), button: tt("Subscribe") },
  }
}

/** One key for an account, so a grid builds a new one only when something a card draws changed. */
export const previewAccountKey = (a: PreviewAccount) => JSON.stringify(a)
