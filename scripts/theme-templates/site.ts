/**
 * A template drawn the way a creator's website draws it, with no database:
 * composed from theme-packages/ (lib/themes/template-packages.ts), imported
 * by the same converter Add uses, and answered by the compat engine's own
 * answer() on a local port. Its pictures are served from the overlay's
 * assets/ folder under the name the import would store them by.
 *
 * Used by scripts/build-theme-template-covers.ts (the listing covers) and by
 * tests/theme-templates.test.ts (which only imports and draws, no browser).
 */
import { createServer, type Server } from "node:http"
import { existsSync, readFileSync } from "node:fs"
import { extname, join } from "node:path"
import JSZip from "jszip"

import { composeTemplateFiles, templateDirs, templateMenus } from "../../lib/themes/template-packages"
import { convertShopifyTheme, type ConversionReport, type ImportedTheme } from "../../lib/storelib-theme/shopify/convert"
import { ASSET_MAP_PATH } from "../../lib/storelib-theme/compat/install"
import { themeOfInstall } from "../../lib/storelib-theme/compat/page"
import { answer, themeAsset, type CartEntry, type SiteData } from "../../lib/storelib-theme/compat/site"
import { compatMenus } from "../../lib/storelib-theme/compat/menus"
import type { CompatTheme } from "../../lib/storelib-theme/compat/theme"
import { SAMPLE_SHOPS } from "./shops"

export const MEDIA_PREFIX = "/__media/"
const MIME: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif" }

export interface ImportedTemplate {
  id: string
  theme: ImportedTheme
  report: ConversionReport
  /** The install's files as the import stores them, the asset map included. */
  files: Record<string, string>
  /** assets/ pictures by name. */
  media: Map<string, Uint8Array>
  zipBytes: number
  fileCount: number
}

export async function importTemplate(id: string): Promise<ImportedTemplate> {
  const composed = composeTemplateFiles(id)
  const zip = new JSZip()
  for (const [rel, bytes] of composed) zip.file(rel, bytes)
  const zipBytes = (await zip.generateAsync({ type: "nodebuffer", compression: "STORE" })).byteLength
  const r = await convertShopifyTheme(zip, { fallbackName: id })
  if (r.ok === false) throw new Error(`${id}: ${(r as { error: string }).error}`)
  const media = new Map(r.theme.binaries.map((b) => [b.name, b.bytes]))
  const addresses = Object.fromEntries([...media.keys()].map((n) => [n, `${MEDIA_PREFIX}${encodeURIComponent(n)}`]))
  return { id, theme: r.theme, report: r.report, files: { ...r.theme.files, [ASSET_MAP_PATH]: JSON.stringify(addresses) }, media, zipBytes, fileCount: composed.size }
}

export interface SampleProduct {
  title: string
  price: string
  compare?: string
  /** A file in the template's assets/ or in scripts/theme-templates/products/<template>/. */
  image?: string
  kind?: string
  description?: string
  /** Up to three options; every combination is a variant, as Products › Variants makes them (lib/physical/variants.ts). */
  options?: { name: string; values: string[] }[]
  /** Dollars an option value adds to the price (and to the compare at price): { "A3": 10, "Oak frame": 45 }. */
  add?: Record<string, number>
  /** A picture for an option value, a colour's own photo: the variant shows it and the gallery holds it. */
  pictures?: Record<string, string>
  /** Variants that are sold out, by name ("XL", "XL / Sand") or by one of their values. */
  soldOut?: string[]
  /** The sample's star rating and review count, [4.8, 36]; left out, one is made from its place in the list (sampleProof). */
  rating?: [number, number]
  /** Units the sample has sold, as a store's paid orders count them; left out, made like the rating. */
  sold?: number
}

/*
  Product page round 23: the sample shop's products carry a rating and a sold
  count, so a product page's Reviews and Sold counter blocks (which read the
  product's own numbers, never typed ones) have something to draw in the
  previews and covers. A live store draws its own reviews and paid orders.
*/
function sampleProof(p: SampleProduct, i: number): { rating: { value: number; count: number }; sold: number } {
  const [value, count] = p.rating ?? [[4.9, 4.8, 4.7, 4.9, 4.8, 4.6][i % 6], 14 + ((i * 23) % 71)]
  return { rating: { value, count }, sold: p.sold ?? 6 + ((i * 11) % 37) }
}

const money = (n: number) => `$${n.toFixed(2)}`
const dollars = (s: string | undefined) => (s ? parseFloat(s.replace(/[^0-9.]/g, "")) || 0 : 0)

/** The variants a product's options make, the first option slowest, each with its own id, price, picture and stock. */
function variantsOf(p: SampleProduct, i: number, imageUrl: (name: string) => string) {
  const options = (p.options ?? []).filter((o) => o.values.length).slice(0, 3)
  if (!options.length) return []
  let rows: string[][] = [[]]
  for (const o of options) rows = rows.flatMap((r) => o.values.map((v) => [...r, v]))
  return rows.map((values, k) => {
    const name = values.join(" / ")
    const extra = values.reduce((sum, v) => sum + (p.add?.[v] ?? 0), 0)
    const picture = values.map((v) => p.pictures?.[v]).find(Boolean)
    const compare = dollars(p.compare)
    return {
      id: `00000000-0000-4000-8000-${String(i + 10).padStart(4, "0")}${String(k + 1).padStart(8, "0")}`,
      name, options: values,
      price: money(dollars(p.price) + extra),
      compare_price: compare ? money(compare + extra) : "",
      available: !(p.soldOut ?? []).some((s) => s === name || values.includes(s)),
      image: picture ? imageUrl(picture) : "",
    }
  })
}

function card(p: SampleProduct, i: number, imageUrl: (name: string) => string, currency = "USD") {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const image = p.image ? imageUrl(p.image) : ""
  const variants = variantsOf(p, i, imageUrl)
  const images = [...new Set([image, ...variants.map((v) => v.image)].filter(Boolean))]
  const proof = sampleProof(p, i)
  return {
    id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`,
    rating: proof.rating,
    settings: {
      title: p.title, slug, url: `/products/${slug}`, price: p.price, compare_price: p.compare ?? "", currency, free: false, pay_what_you_want: false,
      image, images, kind: p.kind ?? "physical", available: true, tag: "", checkout_url: `/checkout/${slug}`,
      description: p.description ?? "", description_html: p.description ? `<p>${p.description}</p>` : "", variants, options: (p.options ?? []).slice(0, 3), category: "",
      sold_count: proof.sold,
    },
  }
}

export interface BuiltSite {
  site: SiteData
  theme: CompatTheme
  imported: ImportedTemplate
}

/** `products: []` is a store that has made none yet. */
export function siteFor(imported: ImportedTemplate, shop: { name: string; products: SampleProduct[] }): BuiltSite {
  const { files } = imported
  const media = JSON.parse(files[ASSET_MAP_PATH]) as Record<string, string>
  const theme = themeOfInstall(files, imported.theme.settings, {
    assetUrl: (n) => media[n] ?? `/__asset/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : media[decodeURIComponent(v.match(/^shopify:\/\/shop_images\/([^?#]+)/)?.[1] ?? "")] ?? ""),
  })
  const pages = Object.fromEntries(imported.theme.pages.map((p) => [p.page_key, p.sections])) as unknown as SiteData["pages"]
  /* A sample shop that sells in its own currency (SAMPLE_SHOPS[template].currency) draws its prices with that symbol. */
  const cur = SAMPLE_SHOPS[imported.id.split("/").pop() ?? ""]?.currency
  const products = shop.products.map((p, i) => card(p, i, (name) => media[name] ?? `/__product/${encodeURIComponent(name)}`, cur?.code ?? "USD"))
  const collections = products.length ? [{ id: "c-all", title: "All products", handle: "frontpage", description: "", image: "", url: "/collections/frontpage", products, products_count: products.length }] : []
  const site: SiteData = {
    creatorId: "c",
    theme,
    pages,
    products: products as never,
    collections: collections as never,
    menus: compatMenus(templateMenus(imported.id) as never, Object.keys(pages)),
    shop: { name: shop.name, currency: cur?.code ?? "USD", moneyFormat: cur?.format ?? "${{amount}}" },
    host: "127.0.0.1",
  }
  return { site, theme, imported }
}

/** The site on a local port. `productsDir` holds the sample products' pictures. */
export async function serve(built: BuiltSite, productsDir: string, opts: { eager?: boolean; cart?: CartEntry[] } = {}): Promise<{ base: string; server: Server; missing: string[] }> {
  const { site, theme, imported } = built
  const missing: string[] = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    /* The website sizes a picture through Next's image optimizer; here the picture itself answers. */
    if (url.pathname === "/_next/image") {
      const to = url.searchParams.get("url") ?? ""
      if (to.startsWith("/") && !to.startsWith("//")) { res.writeHead(302, { Location: to, "Cache-Control": "public, max-age=3600" }); res.end(); return }
    }
    const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
    if (url.pathname.startsWith(MEDIA_PREFIX)) {
      const bytes = imported.media.get(name)
      if (!bytes) { missing.push(url.pathname); res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "public, max-age=3600" }); res.end(Buffer.from(bytes)); return
    }
    if (url.pathname.startsWith("/__product/")) {
      const file = join(productsDir, name.replace(/[^A-Za-z0-9._-]/g, ""))
      const own = join(templateDirs(imported.id).overlay, "assets", name.replace(/[^A-Za-z0-9._-]/g, ""))
      const found = existsSync(file) ? file : existsSync(own) ? own : null
      if (!found) { missing.push(url.pathname); res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "public, max-age=3600" }); res.end(readFileSync(found)); return
    }
    if (url.pathname.startsWith("/__asset/")) {
      const picture = imported.media.get(name)
      if (picture) { res.writeHead(200, { "Content-Type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "public, max-age=3600" }); res.end(Buffer.from(picture)); return }
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { missing.push(url.pathname); res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type }); res.end(a.body); return
    }
    /* A visitor with something in the cart: any address asked with ?__cart, and the scripts of the page it drew. */
    const cart = opts.cart && (url.searchParams.has("__cart") || /[?&]__cart\b/.test(String(req.headers.referer ?? ""))) ? opts.cart : []
    if (url.pathname === "/cart.js" && !cart.length) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ item_count: 0, items: [], total_price: 0 })); return }
    try {
      const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: null, cart })
      if (out.status >= 400 && !/\.(js|json|map)$/.test(url.pathname)) missing.push(`${out.status} ${url.pathname}`)
      /* For a photograph of the whole page at once: no picture waits to be scrolled to. */
      const body = opts.eager && typeof out.body === "string" && /html/.test(out.type) ? out.body.replace(/\sloading=(["'])lazy\1/g, ' loading="eager"') : out.body
      res.writeHead(out.status, { ...(out.headers ?? {}), "Content-Type": out.type }); res.end(body)
    } catch (e) {
      missing.push(`500 ${url.pathname} ${String(e).slice(0, 200)}`)
      res.writeHead(500); res.end(String(e))
    }
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server, missing }
}
