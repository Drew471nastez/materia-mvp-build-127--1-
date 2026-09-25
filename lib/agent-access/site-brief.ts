/**
 * ===========================================================================
 *  WHAT THIS WEBSITE IS, FOR AN AGENT ABOUT TO WRITE FOR IT
 * ===========================================================================
 * The framework reference says how to write a section. It cannot say what
 * THIS website sells, what it is called, how it looks or what is on its
 * pages, and a section written without knowing is a section from another
 * website: the wrong colours, a made-up product, a headline for a business
 * nobody runs. The builder's own AI is handed all of this with every
 * request; an agent connected from outside asks for it here
 * (`storelib_site` over MCP, `GET /api/agent/v1/site` over HTTP).
 *
 * WHAT IS IN IT is what a visitor to the site could already see, and the
 * draft of it the creator is working on: the site's name and address, its
 * brand, title and description, its fonts and colour schemes, each page's
 * sections by type, and its published products with their prices. Nothing
 * else. Not orders, not buyers, not subscribers, not the creator's account,
 * and never another site's: every read below is keyed on this connection's
 * install and creator, which the token decided.
 */

import { themeColorSchemes, defaultSchemeKey } from "@/lib/storelib-theme"
import { shopProducts, type ProductCard } from "@/lib/website-builder/shop-products"
import { siteLanguage } from "@/lib/website-builder/site-language"
import { getWebsiteShareUrl } from "@/lib/url-helpers"
import type { OpResult } from "./operations"
import type { AgentIdentity } from "./tokens"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export const SELLING_DOCS_URL = "https://storelib.com/developers/selling"

export interface SiteBrief {
  name: string
  address: string
  live: boolean
  language: string | null
  brand: { name: string | null; tagline: string | null; has_logo: boolean }
  seo: { title: string | null; description: string | null }
  look: {
    fonts: { heading: string | null; body: string | null }
    button_style: string | null
    default_color_scheme: string
    /** Each scheme a section may use: its key, name and main colours. */
    color_schemes: { key: string; name: string; background: string; text: string; accent: string }[]
  }
  /** Each page, and the sections on it by type, top to bottom. */
  pages: { key: string; sections: { type: string; name: string | null; hidden: boolean }[] }[]
  /**
   * The published products a section can show, as a visitor sees them: the
   * product data API (lib/website-builder/shop-products, documented at
   * storelib.com/developers/selling), the same fields a template reads from
   * `products` and `page.product`.
   */
  products: {
    id: string
    title: string
    price: string
    compare_price: string
    currency: string
    free: boolean
    pay_what_you_want: boolean
    image: string
    images: string[]
    url: string
    slug: string
    kind: string
    available: boolean
    sold_out: boolean
    checkout_url: string
    variants: { id: string; name: string; price: string; compare_price: string; available: boolean; checkout_url: string }[]
  }[]
  selling: string
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null)

type SectionRow = { type?: unknown; name?: unknown; hidden?: unknown }

/** Pure, so it can be tested without a database: rows in, brief out. */
export function briefFrom(input: {
  name: string
  address: string
  live: boolean
  settings: Record<string, unknown>
  pages: { page_key: string; sections: unknown }[]
  products: ProductCard[]
}): SiteBrief {
  const s = input.settings
  const schemes = themeColorSchemes(s)
  return {
    name: input.name,
    address: input.address,
    live: input.live,
    language: siteLanguage(s) ?? null,
    brand: { name: text(s.brand_name), tagline: text(s.tagline), has_logo: typeof s.logo_url === "string" && s.logo_url !== "" },
    seo: { title: text(s.seo_title), description: text(s.seo_description) },
    look: {
      fonts: { heading: text(s.font_heading), body: text(s.font_body) },
      button_style: text(s.button_style),
      default_color_scheme: defaultSchemeKey(s, schemes),
      color_schemes: Object.entries(schemes)
        .slice(0, 12)
        .map(([key, c]) => ({ key, name: c.name, background: c.background, text: c.text, accent: c.accent })),
    },
    pages: input.pages
      .slice(0, 40)
      .map((p) => ({
        key: p.page_key,
        sections: (Array.isArray(p.sections) ? (p.sections as SectionRow[]) : [])
          .slice(0, 60)
          .filter((sec) => typeof sec?.type === "string")
          .map((sec) => ({ type: String(sec.type), name: text(sec.name), hidden: sec.hidden === true })),
      }))
      .sort((a, b) => (a.key === "home" ? -1 : b.key === "home" ? 1 : a.key.localeCompare(b.key))),
    products: input.products.map((p) => {
      const s = p.settings
      return {
        id: p.id,
        title: String(s.title ?? ""),
        price: String(s.price ?? ""),
        compare_price: String(s.compare_price ?? ""),
        currency: String(s.currency ?? "USD"),
        free: s.free === true,
        pay_what_you_want: s.pay_what_you_want === true,
        image: String(s.image ?? ""),
        images: Array.isArray(s.images) ? s.images.slice(0, 12) : [],
        url: String(s.url ?? ""),
        slug: String(s.slug ?? ""),
        kind: String(s.kind ?? ""),
        available: s.available !== false,
        sold_out: s.tag === "Sold out",
        checkout_url: String(s.checkout_url ?? ""),
        variants: (Array.isArray(s.variants) ? s.variants : []).map((v) => ({
          id: v.id,
          name: v.name,
          price: v.price,
          compare_price: v.compare_price,
          available: v.available,
          checkout_url: v.checkout_url,
        })),
      }
    }),
    selling:
      "Products reach a section as `products`, shaped like blocks, with the fields above under block.settings; a product page's section reads its product as page.product. " +
      "Link a card to {{ block.settings.url | url }}, and a buy button to {{ block.settings.checkout_url | url }}, which is /checkout?productId={{ block.id }}&src=website (a variant's own checkout_url for one option). " +
      "Checkout sends the buyer back to this site after paying. Never build a payment form or load a payment script. " +
      `See ${SELLING_DOCS_URL}.`,
  }
}

export async function siteBrief(db: Db, who: AgentIdentity): Promise<OpResult<SiteBrief>> {
  const { data: install } = await db
    .from("store_theme_installs")
    .select("id, name, status")
    .eq("id", who.installId)
    .eq("creator_id", who.creatorId)
    .maybeSingle()
  if (!install) return { ok: false, status: 404, error: "This connection's site no longer exists." }

  const [{ data: settingsRow }, { data: pageRows }, { data: creator }, products] = await Promise.all([
    db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", who.installId).maybeSingle(),
    db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", who.installId),
    db.from("creators").select("slug").eq("id", who.creatorId).maybeSingle(),
    shopProducts(db, who.creatorId),
  ])

  /* The draft where there is one: it is what the creator is looking at in
     the builder, and what the agent's section will be placed beside. */
  const settings = (settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) as Record<string, unknown>
  const pages = ((pageRows ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).map((p) => ({
    page_key: p.page_key,
    sections: p.draft_sections ?? p.sections,
  }))

  return {
    ok: true,
    value: briefFrom({
      name: install.name ?? "Website",
      address: creator?.slug ? getWebsiteShareUrl(creator.slug) : "",
      live: install.status === "published",
      settings,
      pages,
      products,
    }),
  }
}
