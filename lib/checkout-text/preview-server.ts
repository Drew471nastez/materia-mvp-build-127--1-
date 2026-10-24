import "server-only"

/**
 * ===========================================================================
 *  WHAT THE CHECKOUT TEXT PREVIEW DRAWS, READ AS THE CHECKOUT READS IT
 * ===========================================================================
 * The editor's preview is the website's own checkout (./preview.ts). This
 * hands it what that checkout would be handed for a buyer of this store, in
 * the language being edited, from the same code:
 *
 *   the shop      its name and logo across the top (lib/checkout/brand-
 *                 server checkoutBrand), its website for Continue shopping
 *   its settings  Settings › Checkout (loadCheckoutConfig), so a field the
 *                 store turned off, the news box, cash on delivery and
 *                 company invoices are as a buyer finds them
 *   its money     the store's currency (Settings › Country & Currency)
 *   its words     the language's words without the store's own (those are
 *                 laid over as they are typed), as lib/markets/checkout-
 *                 language.ts reads them for a buyer
 *   its products  one download and one product that ships, the newest on
 *                 sale of each, priced by the checkout's own quote
 *                 (siteQuote) for the store's own country, with its
 *                 shipping, tax and offers; their titles in the language
 *   after paying  the thank you page and the order page for that same order
 *
 * A store with nothing of a kind on sale gets a stand in line, named as one
 * in the editor, so the page is still the real page. Nothing here writes:
 * the quote is a price, never a hold.
 */
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { siteQuote, type SiteQuote } from "@/lib/checkout/site-quote-server"
import { firstServingSite } from "@/lib/checkout/site-checkout-server"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { countryName } from "@/lib/checkout/countries"
import { loadCheckoutConfig, loadStoreLegal } from "@/lib/store/settings-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { siteLanguages } from "@/lib/markets/live"
import { cachedTranslations } from "@/lib/markets/server"
import { checkoutWordsIn } from "@/lib/markets/checkout-words"
import { isBuiltInWordKey, isEnglish, translationMap, type TranslationMap } from "@/lib/markets/translate"
import { localizeQuote } from "@/lib/markets/checkout-quote"
import { getMainDomain } from "@/lib/url-helpers"
import type { LinkItem } from "@/lib/physical/cart-link"
import type { CheckoutPreviewData, PreviewCase, PreviewOrderPage } from "./preview"
import { orderPageFor, standInQuote, thanksFor } from "./preview-cases"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The checkout's words in `lang` without the store's own, and the map its titles are translated with: lib/markets/checkout-language.ts, minus the overrides. */
async function wordsWithoutOverrides(creatorId: string, lang: string): Promise<{ words: Record<string, string>; map: TranslationMap | null }> {
  const langs = await siteLanguages(creatorId).catch(() => null)
  const own = !langs || langs.defaultLanguage.toLowerCase() === lang.toLowerCase()
  if (own && isEnglish(lang)) return { words: checkoutWordsIn(lang, null, null), map: null }
  const rows = await cachedTranslations(creatorId, lang).catch(() => [])
  if (own) return { words: checkoutWordsIn(lang, translationMap(rows.filter((r) => r.status === "approved" && isBuiltInWordKey(r.key))), null), map: null }
  const map = translationMap(rows.filter((r) => r.status === "approved"))
  return { words: checkoutWordsIn(lang, map, null), map }
}

interface ProductRow {
  id: string
  title: string | null
  type: string
  price_cents: number | null
  thumbnail_url: string | null
}

/** The newest product of a kind on sale, with its cheapest option (the one a Buy button buys). */
async function newestOnSale(db: Db, creatorId: string, physical: boolean): Promise<{ product: ProductRow; variantId: string | null } | null> {
  try {
    let q = db.from("products").select("id, title, type, price_cents, thumbnail_url").eq("creator_id", creatorId).eq("status", "published").is("community_id", null)
    q = physical ? q.eq("type", "physical") : q.not("type", "in", "(physical,membership)")
    const { data } = await q.order("created_at", { ascending: false }).limit(1)
    const product = (Array.isArray(data) ? data[0] : null) as ProductRow | null
    if (!product) return null
    const { data: v } = await db.from("product_variants").select("id").eq("product_id", product.id).order("price_cents", { ascending: true }).limit(1).maybeSingle()
    return { product, variantId: (v as { id?: string } | null)?.id ?? null }
  } catch {
    return null
  }
}

async function caseFor(db: Db, creatorId: string, physical: boolean, country: string | null, map: TranslationMap | null, currency: string, shop: PreviewOrderPage["shop"]): Promise<PreviewCase> {
  const found = await newestOnSale(db, creatorId, physical)
  let priced: { items: LinkItem[]; quote: SiteQuote } | null = null
  if (found) {
    const items: LinkItem[] = [{ productId: found.product.id, variantId: found.variantId, quantity: 1 }]
    const answer = await siteQuote(db, creatorId, { items, ...(country ? { country } : {}) }).catch(() => null)
    /* Only a quote with the product in it: one the checkout itself would draw. */
    if (answer && answer.ok && answer.quote.lines.length > 0) priced = { items, quote: localizeQuote(answer.quote, map) }
  }
  const standIn = !priced
  const { items, quote } = priced ?? standInQuote(creatorId, physical)
  return { items, quote, thanks: thanksFor(quote, currency, country, physical), orderPage: physical ? orderPageFor(quote, currency, country, shop) : null, standIn }
}

export async function checkoutPreviewData(db: Db, creatorId: string, lang: string, opts: { physical: boolean }): Promise<CheckoutPreviewData> {
  const [brand, config, money, language, hosts, legal, settings] = await Promise.all([
    checkoutBrand(db, creatorId),
    loadCheckoutConfig(db, creatorId),
    readStoreCurrency(db, creatorId).catch(() => ({ currency: "USD", country: null })),
    wordsWithoutOverrides(creatorId, lang),
    siteHostsFor(creatorId, db).catch(() => [] as string[]),
    loadStoreLegal(db, creatorId),
    Promise.resolve(db.from("store_settings").select("phone").eq("creator_id", creatorId).maybeSingle()).then((r: { data?: { phone?: string | null } | null }) => r?.data ?? null, () => null),
  ])
  const currency = String((money as { currency: string }).currency || "USD").toUpperCase()
  const country = ((money as { country?: string | null }).country ?? null) || null
  const site = await firstServingSite(db, creatorId, hosts).catch(() => null)
  const shopUrl = `${site ?? `https://${getMainDomain()}`}/`
  const shop: PreviewOrderPage["shop"] = {
    name: brand.name,
    avatar: brand.imageUrl,
    avatarKind: brand.kind,
    email: null,
    phone: settings?.phone ?? null,
    websiteUrl: shopUrl,
    legal: legal ? { name: legal.company, lines: [legal.line1, [legal.postalCode, legal.city].filter(Boolean).join(" "), legal.country ? countryName(legal.country) : ""].filter(Boolean), taxId: legal.taxId || null, taxIdLabel: "Tax number" } : null,
  }
  /* The shipped checkout only for a store that sells goods that ship (physical commerce on, a physical product or none yet). */
  const [digital, shipped] = await Promise.all([
    caseFor(db, creatorId, false, country, language.map, currency, shop),
    opts.physical ? caseFor(db, creatorId, true, country, language.map, currency, shop) : Promise.resolve(null),
  ])
  return { lang, currency, brand, shopUrl, backTo: `${shopUrl.replace(/\/$/, "")}/cart`, config, country, words: language.words, digital, shipped }
}
