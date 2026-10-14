/**
 * ===========================================================================
 *  ONE PRODUCT, DRAWN IN ITS CREATOR'S THEME
 * ===========================================================================
 * Two addresses lead here and they are the same page:
 *
 *   storelib.com/products/<slug>          the platform's own address
 *   <name>.storelib.com/products/<slug>   the same product, on the site
 *
 * The second is the one a visitor actually meets, because that is what every
 * product card, every Product Featured section and the header's link picker
 * emit. It did not exist: the proxy forwards the whole path to /w and only
 * the home page had a route there, so every product link on every published
 * site was a 404. The work lives here once, and the two routes differ by one
 * thing, which is whether the address claims an owner.
 */
import { languageChoice, siteLocalizer } from "@/lib/markets/live"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { withMediaUrls } from "@/lib/storage/media-url"
import { cache } from "react"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, ownerOf } from "@/lib/website-builder/published-site"
import { productFacts } from "@/lib/website-builder/storefront-data"
import { withDeliveryBlock, withMainProduct, withProductBlocks } from "@/lib/website-builder/product-page"
import { productSectionData } from "@/lib/products/product-section-data"
import { mayPreview, pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { TrackView } from "@/components/analytics/track-view"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { plainSummary } from "@/lib/html-entities"
import { getProductShareUrl } from "@/lib/url-helpers"
import { productIndexable } from "@/lib/seo/indexing"
import { jsonLdScript, productJsonLd } from "@/lib/website-builder/site-seo"
import { productVariants, soldOut, toProductPage } from "@/lib/website-builder/shop-products"
import { drawsTheProduct } from "@/lib/website-builder/storelib-runtime"
import { publishedProductTheme } from "@/lib/website-builder/product-page-theme"
import { imagesOnly } from "@/lib/media/video"
import { siteTabTitle } from "@/lib/website-builder/tab-title"

/**
 * How this product is priced, read on its own so the product read above
 * stays the one it has always been. Best effort: a database without these
 * columns prices the product as it always did.
 */
async function productPricing(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
): Promise<{ type?: string | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }> {
  try {
    const { data, error } = await admin
      .from("products")
      .select("type, pay_what_you_want, pwyw_min_price_cents")
      .eq("id", productId)
      .maybeSingle()
    return error || !data ? {} : (data as { type?: string | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null })
  } catch {
    return {}
  }
}

/** The same three fields, from the product row itself. */
function pricingOf(row: Record<string, unknown>): { type?: string | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null } {
  return {
    type: (row.type as string | null | undefined) ?? null,
    pay_what_you_want: (row.pay_what_you_want as boolean | null | undefined) ?? null,
    pwyw_min_price_cents: (row.pwyw_min_price_cents as number | null | undefined) ?? null,
  }
}

type ProductRow = {
  id: string
  title: string | null
  description: string | null
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  whats_included: string[] | null
  slug: string | null
  status: string | null
  creator_id: string | null
  /* Read when the database has them, which is why the row is read whole below. */
  inventory_count?: number | null
  seo_title?: string | null
  seo_description?: string | null
}

/*
  One read per request, shared by the metadata, the page and its structured
  data. THE WHOLE ROW, as storelib.com's product page reads it: the stock
  count that says whether it has sold out is a column one database may have
  and another not, and naming a column that is not there fails the read. The
  page hands its sections an explicit subset (`productData` below), so nothing
  more reaches the browser.
*/
const fetchProductBySlug = cache(async function fetchProductBySlug(slug: string, creatorId?: string): Promise<ProductRow | null> {
  /*
    THE SERVER'S CLIENT, NOT THE VISITOR'S. Only a published product is read,
    which every visitor may see, and the shop around it is read the same way.
    The visitor's client reads their cookies, and a page that reads cookies
    is drawn again for every visit: the website's product page could not be
    held at the edge, and every visit and every hover that prefetched it was
    a fresh set of database reads.
  */
  const supabase = createAdminClient()

  /*
    ONE ROW, EVEN WHEN TWO SHOPS USE THE SAME SLUG. A slug is unique per
    creator, not across Storelib: two creators can both sell an `ebook`.
    This read was `.maybeSingle()` on the slug alone, which answers an error
    and no row when two match, so the product page on BOTH websites was a
    404. On a website the address names its owner, so the read is held to
    that creator; storelib.com/products/<slug> has no owner to go by and
    takes the oldest, which is the one that slug first belonged to.
  */
  let query = supabase.from("products").select("*").eq("slug", slug).eq("status", "published")
  if (creatorId) query = query.eq("creator_id", creatorId)
  const { data: rows } = await query.order("created_at", { ascending: true }).limit(1)
  const data = Array.isArray(rows) ? rows[0] : null

  /* Storelib's own address for every picture and file, never the storage host's (lib/storage/media-url.ts). */
  if (data) return withMediaUrls(data) as ProductRow

  // Fall back to renamed slugs, held to the same owner.
  const { data: history } = await supabase
    .from("product_slug_history")
    .select(`
      product_id,
      products!inner ( * )
    `)
    .eq("old_slug", slug)
    .order("created_at", { ascending: false })
    .limit(10)

  const found = ((history ?? []) as { products?: unknown }[])
    .map((h) => (Array.isArray(h.products) ? h.products[0] : h.products) as { status?: string; creator_id?: string } | undefined)
    .find((p) => p && p.status === "published" && (!creatorId || p.creator_id === creatorId))
  if (found) return withMediaUrls(found) as ProductRow
  return null
})

/**
 * A product page's metadata, and which address it is canonical at.
 *
 *   on a creator's website (`url`, `brand`, `indexable`): the site's own
 *     /products/<slug> on its own domain, the shop named in the title, and
 *     kept out of search when the creator hid the whole site
 *     (lib/website-builder/site-seo.ts)
 *   at storelib.com/products/<slug> (`platform`): the address every link
 *     uses, storelib.com/<handle>/<slug>, so the two spellings do not
 *     compete, and out of search for a handle the spam rules hold back
 *
 * The description is plain text: it is stored as rich text, and a meta
 * description printed verbatim is a snippet full of markup and entities.
 */
export async function productMetadata(
  slug: string,
  where?: { url: string; brand: string; indexable: boolean; creatorId?: string; locale?: string; inLanguage?: <T extends Record<string, unknown>>(p: T) => T } | { platform: true },
): Promise<Metadata> {
  const found = await fetchProductBySlug(slug, where && "creatorId" in where ? where.creatorId : undefined)
  if (!found) return { title: "Product Not Found", robots: { index: false, follow: false } }
  /* The product's title and search text in the page's language, when it has them (lib/markets/live.ts). */
  const product = where && "inLanguage" in where && where.inLanguage ? (where.inLanguage(found as unknown as Record<string, unknown>) as unknown as typeof found) : found

  const ogImage = imagesOnly(product.gallery_urls ?? [])[0] || product.thumbnail_url || undefined
  const name = product.title ?? "Product"
  /* The product's own search result when its creator wrote one, as storelib.com's product page reads it. */
  const ownTitle = typeof product.seo_title === "string" ? product.seo_title.trim().replace(/ \| Storelib$/i, "") : ""
  const description = plainSummary(product.seo_description ?? "", 300) || plainSummary(product.description) || undefined
  const site = where && "url" in where ? where : null
  let canonical: string | undefined = site?.url
  let index = site ? site.indexable : true
  if (where && "platform" in where && product.creator_id && product.slug) {
    const admin = createAdminClient()
    const { data: creator } = await admin.from("creators").select("user_id").eq("id", product.creator_id).maybeSingle()
    const userId = (creator as { user_id?: string } | null)?.user_id
    const { data: profile } = userId
      ? await admin.from("profiles").select("username").eq("id", userId).maybeSingle()
      : { data: null }
    const handle = (profile as { username?: string } | null)?.username ?? ""
    if (handle) canonical = getProductShareUrl(handle, product.slug)
    index = productIndexable(product, handle || null)
  }
  /* On a website, the tab every page of it uses: its SEO title exactly, else "<product> | <store>" (lib/website-builder/tab-title.ts). */
  const tab = site ? siteTabTitle({ page: { kind: "product", name }, storeName: site.brand, ownTitle }) : null
  return {
    title: tab ? { absolute: tab } : ownTitle || name,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(index ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title: tab ?? (ownTitle || name),
      description,
      ...(canonical ? { url: canonical } : {}),
      ...(site ? { siteName: site.brand } : {}),
      /* The website's own language (Website Settings › General), as every other page of it says. */
      ...(site?.locale ? { locale: site.locale } : {}),
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: tab ?? (ownTitle || name),
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

/** A product's structured data on a creator's website, as a script body, or null. */
export async function productStructuredData(slug: string, site: { url: string; seller: string; creatorId?: string }): Promise<string | null> {
  const product = await fetchProductBySlug(slug, site.creatorId)
  if (!product) return null
  const images = imagesOnly([product.thumbnail_url, ...(product.gallery_urls ?? [])]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
  /* Storelib Reviews: the rating and reviews the page shows, only while the app shows them on this website. */
  const reviews = site.creatorId
    ? await import("@/lib/reviews/storefront-server").then((m) => m.storefrontReviews(site.creatorId!, { id: product.id, title: product.title ?? null })).catch(() => null)
    : null
  const own = reviews?.enabled ? reviews.product : null
  return jsonLdScript(
    productJsonLd({
      url: site.url,
      name: product.title ?? "Product",
      description: product.description,
      images: [...new Set(images)],
      priceCents: product.price_cents,
      /* Sold out when its stock is counted and none is left: the shop's own rule. */
      inStock: !soldOut(product),
      seller: site.seller,
      rating: own && own.summary.count > 0 ? { average: own.summary.average, count: own.summary.count, reviews: own.items.map((r) => ({ author: r.author, rating: r.rating, body: r.body, title: r.title, date: r.iso })) } : null,
    }),
  )
}

/**
 * `owner` is the creator whose address this is, when the address names one.
 * `<name>.storelib.com/products/<slug>` is a claim about whose product this
 * is, and a product belonging to somebody else is not at that address: it is
 * sent to its own, rather than drawn in the wrong shop.
 */
export async function renderProduct(
  slug: string,
  /** `locale`: the page in another of the website's languages (/fr/products/…, lib/markets/live.ts). */
  owner?: { creatorId: string; locale?: string | null; market?: string | null },
  /**
   * A preview link, so the product page can be checked before it is
   * published, the same as every other page of the site. The token is
   * compared against the install's own, in constant time, and a wrong one
   * quietly draws the published page: a preview is never a way to ask
   * whether a link exists.
   */
  previewToken?: string,
) {
  const found = await fetchProductBySlug(slug, owner?.creatorId)
  if (!found || !found.creator_id) notFound()
  if (owner && found.creator_id !== owner.creatorId) notFound()
  /* In another language: its approved title and description laid over, and the page's texts below. Never for a preview. */
  const localizer = (owner?.locale || owner?.market) && !previewToken ? await siteLocalizer(found.creator_id, owner.locale ?? null, owner.market ?? null) : null
  const product = (localizer ? localizer.product(found) : found) as typeof found & { creator_id: string }

  const admin = createAdminClient()

  /*
    The live page's theme (its published install, settings and the product
    and home pages' sections) is held with the site and cleared by every
    publish (lib/website-builder/product-page-theme.ts): it was three round
    trips in a row for every visitor. A preview reads its own install, drafts
    and token, directly, as before. The product, its options, stock and
    files below are still read fresh for every visitor.
  */
  const theme = previewToken ? null : await publishedProductTheme(product.creator_id)

  // Fetch the creator's published website-builder install
  const { data: install } = theme
    ? { data: theme.install }
    : previewToken
      ? await admin
          .from("store_theme_installs")
          .select(`
      id,
      preview_token,
      store_theme_settings ( settings, draft_settings )
    `)
          .eq("creator_id", product.creator_id)
          .eq("status", "published")
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle()
      : { data: null }

  // If the creator has no published website yet, fall back to notFound so
  // Storelib doesn't leak an un-styled bare product. The marketplace page at
  // /p/[slug] is still available for the discovery flow.
  if (!install) notFound()

  const preview = previewToken ? mayPreview((install as { preview_token?: string | null }).preview_token, previewToken) : false

  const settingsRow =
    (install as any).store_theme_settings?.[0] ?? (install as any).store_theme_settings ?? null
  const ownSettings = (themeSettingsOf(settingsRow as never, preview) ?? {}) as ThemeSettingsValues
  /* Its menus in the page's language too (lib/markets/live.ts). */
  const themeSettings = localizer ? (localizer.theme(ownSettings as Record<string, unknown>) as ThemeSettingsValues) : ownSettings

  // Fetch product-page AND home-page sections in parallel. Home is the
  // source of truth for header/footer on every page of the live site.
  //
  // Beside them, and in the same round trip: the shop (cached for a minute,
  // shared with the rest of the site) so a product list on this page draws
  // the catalogue, and this product's options and pricing mode, so a section
  // reading `page.product` gets the same fields as a card in `products`.
  /* The shop itself comes with the page's owner, below (ownerOf). */
  /* The pricing mode is in the row already when the database has its columns (the row is read whole); asked on its own only when it is not. */
  const pricing = "pay_what_you_want" in product ? pricingOf(product) : null
  /* And with it in hand, the product's options, stock and files start now, beside the reads below rather than after them. */
  const productDataEarly = pricing ? productSectionData(admin, { ...product, ...pricing, slug: product.slug ?? slug }, { files: true }) : null
  /* Awaited below; a failure while the reads beside it are still out is not left unhandled. */
  productDataEarly?.catch(() => undefined)
  const [{ data: pageData }, { data: homeData }, variants, extra] = await Promise.all([
    theme
      ? { data: theme.product }
      : admin
          .from("store_theme_pages")
          .select("sections, draft_sections")
          .eq("install_id", install.id)
          .eq("page_key", "product")
          .maybeSingle(),
    theme
      ? { data: theme.home }
      : admin
          .from("store_theme_pages")
          .select("sections, draft_sections")
          .eq("install_id", install.id)
          .eq("page_key", "home")
          .maybeSingle(),
    productVariants(admin as never, [product.id]),
    pricing ?? productPricing(admin, product.id),
  ])

  /**
   * PUBLISHED ONLY, unless a preview link asked otherwise. Both of them: the
   * product page's own sections, and the home page whose header and footer
   * this page borrows. Falling back to the drafts on a public request meant a
   * product page edited but not published was already live, and so was a
   * header being worked on. `preview` is false for every visitor who did not
   * arrive with a matching token.
   */
  /**
   * And again on the way out. The database already holds rich text saved
   * before anything sanitised it, and rows can arrive from an import. The
   * save path is the authority; this is what covers what is already there.
   */
  const rawSections: SectionInstance[] = sanitizeSections(pageSections<SectionInstance[]>(pageData, preview) ?? [])
  const homeSections: SectionInstance[] = sanitizeSections(pageSections<SectionInstance[]>(homeData, preview) ?? [])

  const homeHeader = homeSections.find(s => s.type === "header")
  const homeFooter = homeSections.find(s => s.type === "footer")

  // Inject the real product data into every product-type section so the
  // editor-preview code path ("_product_data" on settings) renders the
  // actual product on the live storefront.
  /* Everything the section draws: its pictures once each, its variants with
     their options, pictures and stock, its pay what you want terms and its
     description cleaned for the page. The same read the builder's canvas
     makes for the product it previews (lib/products/product-section-data.ts). */
  const productRead = await (productDataEarly ?? productSectionData(admin, { ...product, ...extra, slug: product.slug ?? slug }, { files: true }))
  /* Its options and variants' names in the page's language (lib/markets/translate.ts localizeOptions). */
  const productData = localizer ? localizer.options(productRead) : productRead

  /* The site's owner and shop, read here because which sections the theme
     has decides whether the built-in product section is added below. */
  const cached = !previewToken
  const { owner: shop, products, productCount } = await ownerOf(product.creator_id, install.id, themeSettings, { cached })

  /* A template saved before the presets carried a product section gets
     one, where the untouched "Product name" placeholder was, and a product
     section saved before it had blocks draws the blocks its old switches
     describe: product-page.ts. A page with a product section of the
     creator's own (one that reads `product` or `page.product`) gets none:
     it would draw the product twice. */
  const sections: SectionInstance[] = withMainProduct(localizer ? localizer.sections(rawSections, shop.sources) : rawSections, (type) => drawsTheProduct(type, shop.sources)).map(s =>
    s.type === "product"
      ? (() => { const drawn = withDeliveryBlock(withProductBlocks(s)); return { ...drawn, settings: { ...drawn.settings, _product_data: localizer?.pricing ? { ...productData, display: { market: localizer.pricing.market, base: localizer.pricing.base, fx: localizer.pricing.fx, locale: localizer.locale } } : productData } } })()
      : s
  )

  /**
   * The product page borrows the HOME page's header and footer when it has
   * none of its own, so a store's chrome is its chrome on every page. Composed
   * here, where that rule lives, and handed to the same page component the
   * storefront uses — which is what stops this route drifting from the others
   * the way all four had.
   */
  const inLanguage = (section: SectionInstance | undefined) => (section && localizer ? localizer.sections([section], shop.sources)[0] : section)
  const header = inLanguage(homeHeader) ?? sections.find((s) => s.type === "header")
  const footer = inLanguage(homeFooter) ?? sections.find((s) => s.type === "footer")
  const page = [
    ...(header ? [header] : []),
    ...sections.filter((s) => s.type !== "header" && s.type !== "footer"),
    ...(footer ? [footer] : []),
  ]

  /**
   * Rendered here, on the server, once — and as "product", not "index".
   * A section reads that as `page.template` and `allowed_templates` is
   * written against it, so the wrong word here hides the right sections.
   */
  /**
   * THE PRODUCT, TO EVERY SECTION ON ITS PAGE. A `.storelib` section reads
   * it as `product`, a setting holding `{{ product.title }}` is filled from
   * it, and the shop a "You may also like" grid draws is every other
   * product: the one on the page is not a suggestion for itself. Held with
   * the published site's shop when this is the live page, read directly for
   * a preview.
   */
  const facts = productFacts(product)
  const shopCards = localizer ? localizer.cards(products) : products
  const others = shopCards.filter((p) => p.id !== product.id)
  const dressed = await dressPage(shop, page, shopCards, productCount, "product", product.title ?? "Product", facts, { cached })
  /**
   * THE PRODUCT THIS PAGE IS ABOUT, as `page.product` too: the same fields
   * as a card in `products`, and its description as plain text. A section
   * written for the product page reads it; a section that does not, does
   * not notice it. See content/developers/selling.md.
   */
  const about = { product: toProductPage({ ...product, ...extra }, variants) }
  const prerendered = renderWithSources(shop.sources, dressed.sections, themeSettings, "product", others, about, dressed.data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "product" }}>
      <ThemePage
        theme={themeSettings}
        sections={dressed.sections}
        // Whose site this is, for the sections that send something somewhere.
        storefront={{ creatorId: product.creator_id ?? undefined, installId: install.id, language: previewToken ? undefined : await languageChoice(product.creator_id, owner?.locale, owner?.market), words: localizer?.words, display: previewToken ? undefined : localizer?.display }}
        className="min-h-screen"
      />
      {previewToken ? null : <TrackView type="product" creatorId={product.creator_id} productId={product.id} />}
      {previewToken ? null : <SiteVitals installId={install.id} />}
    </StorelibSourcesProvider>
  )
}
