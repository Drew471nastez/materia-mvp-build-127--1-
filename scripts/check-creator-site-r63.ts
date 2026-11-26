/**
 * ===========================================================================
 *  A CREATOR'S BUILT WEBSITE, DRAWN AND PHOTOGRAPHED (round 63)
 * ===========================================================================
 * What Build website (app/api/admin/creators/site) makes, drawn by the real
 * renderer with no database: the content rows a creator has (a JSON file of
 * what their public pages show, see --content), read by
 * lib/admin/creator-site/content.ts exactly as the route reads the database,
 * the Storelib Default template composed from theme-packages/, tailored by
 * lib/admin/creator-site/tailor.ts, imported by the converter Add uses and
 * answered by the compat engine's answer() on a local port. Their pictures
 * are answered from a local folder (--images) in place of storelib.com/media.
 *
 * Chromium photographs home, the collection and each product at 360, 390,
 * 768 and 1280 wide (deviceScaleFactor 2) and measures:
 *   - every product card picture fills its frame (no empty band)
 *   - no page scrolls sideways
 *   - none of the template's sample words is on any page
 *
 * Compiled like a test suite (tsc, then node with scripts/push-test-register.mjs),
 * with Playwright from PLAYWRIGHT_MODULE or the global install:
 *   node <runner> scripts/check-creator-site-r63.ts -- --content <json> --images <dir> --out <dir>
 */
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { extname, join } from "node:path"
import JSZip from "jszip"

import { composeTemplateFiles } from "../lib/themes/template-packages"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { ASSET_MAP_PATH } from "../lib/storelib-theme/compat/install"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, themeAsset, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { creatorSiteContent, type CreatorRows } from "../lib/admin/creator-site/content"
import { templateSampleText } from "../lib/admin/creator-site/samples"
import { tailorTemplate } from "../lib/admin/creator-site/tailor"

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const CONTENT = arg("content") ?? process.env.CREATOR_CONTENT ?? ""
const IMAGES = arg("images") ?? process.env.CREATOR_IMAGES ?? ""
const OUT = arg("out") ?? process.env.CREATOR_OUT ?? "."
const WIDTHS = (arg("widths") ?? process.env.CREATOR_WIDTHS ?? "360,390,768,1280").split(",").map(Number)
const MIME: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }

type Content = {
  creator: { name: string; handle: string; creator_id: string; bio: string; avatar: string | null; social_links: Record<string, string> }
  site: { hero_image: string; hero_heading: string; logo: string | null; logo_mobile: string | null; collection_title: string; menu: { title: string; url: string }[] }
  products: { title: string; handle: string; price: number; currency: string; image: string; description_html: string }[]
}

/** The rows the database holds for this creator, as the route reads them: their live website still has the old theme's sample line under its hero. */
function rowsFrom(c: Content): CreatorRows {
  return {
    creator: { id: c.creator.creator_id, slug: c.creator.handle, username: c.creator.handle, display_name: c.creator.name },
    profile: { display_name: c.creator.name, username: c.creator.handle, avatar_url: c.creator.avatar },
    shopConfig: { headerSettings: { bio: c.creator.bio, avatarUrl: c.creator.avatar, socialLinks: Object.fromEntries(Object.entries(c.creator.social_links).map(([k, url]) => [k, { enabled: true, url }])) } },
    live: {
      settings: { brand_name: "Northwind" },
      pages: [
        {
          page_key: "home",
          sections: [
            { id: "header", type: "header", settings: { logo_text: "Northwind", logo_url: c.site.logo, mobile_logo_url: c.site.logo_mobile, cta_text: "Shop now" }, blocks: [] },
            { id: "hero", type: "hero", settings: { heading: c.site.hero_heading, subheading: "Templates, presets and guides from a studio that ships.", bg_type: "image", bg_image: c.site.hero_image, button_text: "Shop now", button2_text: "Learn more" }, blocks: [] },
            { id: "testimonials", type: "testimonials", settings: { heading: "What customers say", subheading: "Real words from real buyers." }, blocks: [] },
          ],
        },
        { page_key: "products", sections: [{ id: "grid", type: "product_list", settings: { heading: c.site.collection_title }, blocks: [] }] },
      ],
    },
    menus: { "main-menu": { title: "Main menu", links: c.site.menu } },
    products: c.products.map((p, i) => ({ id: `p${i}`, title: p.title, slug: p.handle })),
  }
}

async function main() {
  const c = JSON.parse(readFileSync(CONTENT, "utf8")) as Content
  const content = creatorSiteContent(rowsFrom(c), templateSampleText())
  writeFileSync(join(OUT, "content-read.json"), JSON.stringify(content, null, 2))

  const files = tailorTemplate(composeTemplateFiles("materia/default"), content)
  const zip = new JSZip()
  for (const [rel, bytes] of files) zip.file(rel, bytes)
  const r = await convertShopifyTheme(zip, { fallbackName: content.name })
  if (r.ok === false) throw new Error("the template did not convert")
  const media = new Map(r.theme.binaries.map((b) => [b.name, b.bytes]))
  const addresses = Object.fromEntries([...media.keys()].map((n) => [n, `/__media/${encodeURIComponent(n)}`]))
  const themeFiles: Record<string, string> = { ...r.theme.files, [ASSET_MAP_PATH]: JSON.stringify(addresses) }
  const theme = themeOfInstall(themeFiles, r.theme.settings, {
    assetUrl: (n) => addresses[n] ?? `/__asset/${encodeURIComponent(n)}`,
    assetText: (n) => themeFiles[`shopify/assets/${n}`] ?? null,
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : addresses[decodeURIComponent(v.match(/^shopify:\/\/shop_images\/([^?#]+)/)?.[1] ?? "")] ?? ""),
  })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections])) as unknown as SiteData["pages"]
  const money = (n: number) => (n === 0 ? "£0.00" : `£${n.toFixed(2)}`)
  const products = c.products.map((p, i) => ({
    id: `00000000-0000-4000-8000-0000000000${10 + i}`,
    rating: { value: 0, count: 0 },
    descriptionHtml: p.description_html,
    settings: {
      title: p.title, slug: p.handle, url: `/products/${p.handle}`, price: money(p.price), compare_price: "", currency: p.currency, free: p.price === 0, pay_what_you_want: false,
      image: p.image, images: [p.image], kind: "digital", available: true, tag: "", checkout_url: `/checkout/${p.handle}`,
      description: "", description_html: p.description_html, variants: [], options: [], category: "", sold_count: 0, sold_count_24h: 0, sold_count_7d: 0, sold_count_30d: 0,
    },
  }))
  const site: SiteData = {
    creatorId: c.creator.creator_id,
    theme,
    pages,
    products: products as never,
    collections: [{ id: "c-all", title: "All products", handle: "all", description: "", image: "", url: "/collections/all", products, products_count: products.length }] as never,
    menus: compatMenus({ "main-menu": { title: "Main menu", links: c.site.menu } } as never, Object.keys(pages)),
    shop: { name: c.creator.name, currency: "GBP", moneyFormat: "£{{amount}}" },
    host: "127.0.0.1",
  }

  const missing: string[] = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
    if (url.pathname.startsWith("/__media/")) {
      const bytes = media.get(name)
      if (!bytes) { missing.push(url.pathname); res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream" }); res.end(Buffer.from(bytes)); return
    }
    if (url.pathname.startsWith("/__asset/")) {
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { missing.push(url.pathname); res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type }); res.end(a.body); return
    }
    if (url.pathname === "/cart.js") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ item_count: 0, items: [], total_price: 0 })); return }
    try {
      const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: null, cart: [] })
      if (out.status >= 400 && !/\.(js|json|map)$/.test(url.pathname)) missing.push(`${out.status} ${url.pathname}`)
      const body = typeof out.body === "string" && /html/.test(out.type) ? out.body.replace(/\sloading=(["'])lazy\1/g, ' loading="eager"') : out.body
      res.writeHead(out.status, { ...(out.headers ?? {}), "Content-Type": out.type }); res.end(body)
    } catch (e) {
      missing.push(`500 ${url.pathname} ${String(e).slice(0, 200)}`)
      res.writeHead(500); res.end(String(e))
    }
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  /* storelib.com/media/<...>/<file> answered from the local folder by file name. */
  const localPicture = (address: string): Buffer | null => {
    const file = decodeURIComponent(address.split("?")[0].split("/").pop() ?? "")
    const p = join(IMAGES, file)
    return existsSync(p) ? readFileSync(p) : null
  }

  const require = createRequire(import.meta.url)
  /* Playwright is not a dependency of the app: the global install, or the one PLAYWRIGHT_MODULE names. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw = require(process.env.PLAYWRIGHT_MODULE ?? "playwright") as any
  const browser = await pw.chromium.launch()
  const report: Record<string, unknown>[] = []
  const samplesSeen: string[] = []
  const SAMPLE_WORDS = ["Northwind", "studio", "Sundry", "hello@example.com", "Acme", "Sarah J.", "10% off", "small runs", "Customer name", "Monday to Friday"]
  mkdirSync(OUT, { recursive: true })
  const paths = (process.env.CREATOR_PAGES ?? "").trim()
    ? (process.env.CREATOR_PAGES as string).split(",").map((p) => [p.replace(/^\/(pages\/)?/, "").replace(/\W+/g, "-") || "home", p])
    : [["home", "/"], ["about", "/pages/about"], ["collection", "/collections/all"], ...c.products.map((p) => [`product-${p.handle}`, `/products/${p.handle}`])]
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.route(/https:\/\/storelib\.com\/media\//, async (route: any) => {
      const b = localPicture(route.request().url())
      if (!b) return route.fulfill({ status: 404, body: "" })
      return route.fulfill({ status: 200, body: b, contentType: MIME[extname(route.request().url().split("?")[0]).toLowerCase()] ?? "image/png" })
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.route(/\/_next\/image\?/, async (route: any) => {
      const to = new URL(route.request().url()).searchParams.get("url") ?? ""
      const b = /^https:\/\/storelib\.com\/media\//.test(to) ? localPicture(to) : null
      if (b) return route.fulfill({ status: 200, body: b, contentType: MIME[extname(to.split("?")[0]).toLowerCase()] ?? "image/png" })
      if (to.startsWith("/")) return route.fulfill({ status: 302, headers: { Location: `${base}${to}` }, body: "" })
      return route.fulfill({ status: 404, body: "" })
    })
    for (const [label, path] of paths) {
      await page.goto(`${base}${path}`, { waitUntil: "load" })
      /* Down the page and back, so every section that appears on scroll has appeared before the photograph. */
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(900)
      const m = await page.evaluate(() => {
        const doc = document.documentElement
        const cards = [...document.querySelectorAll("product-card img, .product-card img, .card-product img, [class*=product-item] img, [class*=product-card] img")]
          .filter((img) => (img as HTMLImageElement).getBoundingClientRect().width > 40)
          .slice(0, 6)
          .map((img) => {
            const i = img as HTMLImageElement
            const r = i.getBoundingClientRect()
            const frame = (i.parentElement as HTMLElement).getBoundingClientRect()
            const fit = getComputedStyle(i).objectFit
            const shown = i.naturalWidth && i.naturalHeight ? (() => {
              /* The picture's drawn box inside its element, for object-fit contain or none. */
              const ar = i.naturalWidth / i.naturalHeight
              if (fit === "cover" || fit === "fill") return { w: r.width, h: r.height }
              return r.width / r.height > ar ? { w: r.height * ar, h: r.height } : { w: r.width, h: r.width / ar }
            })() : null
            return { src: (i.currentSrc || i.src).slice(-60), box: [Math.round(r.width), Math.round(r.height)], frame: [Math.round(frame.width), Math.round(frame.height)], fit, drawn: shown ? [Math.round(shown.w), Math.round(shown.h)] : null, natural: [i.naturalWidth, i.naturalHeight], complete: i.complete && i.naturalWidth > 0 }
          })
        const hero = document.querySelector(".hero__media, [class*=hero] img") as HTMLImageElement | null
        return {
          scrollW: doc.scrollWidth,
          clientW: doc.clientWidth,
          h1: [...document.querySelectorAll("h1")].map((h) => (h.textContent ?? "").trim().slice(0, 80)).filter(Boolean).join(" | "),
          hero: hero ? { src: (hero.currentSrc || hero.src).slice(-50), loaded: hero.complete && hero.naturalWidth > 0, box: [Math.round(hero.getBoundingClientRect().width), Math.round(hero.getBoundingClientRect().height)] } : null,
          cards,
          text: document.body.innerText,
        }
      })
      for (const s of SAMPLE_WORDS) if (m.text.toLowerCase().includes(s.toLowerCase())) samplesSeen.push(`${w} ${label}: "${s}"`)
      const { text: _t, ...rest } = m
      void _t
      report.push({ width: w, page: label, ...rest })
      await page.screenshot({ path: join(OUT, `${label}-${w}.png`), fullPage: true })
    }
    await ctx.close()
  }
  await browser.close()
  server.close()
  writeFileSync(join(OUT, "measure.json"), JSON.stringify({ report, samplesSeen, missing: [...new Set(missing)] }, null, 2))
  console.log(JSON.stringify({ pages: report.length, samplesSeen, missing: [...new Set(missing)].slice(0, 20) }, null, 2))
  for (const r of report) console.log(r.width, r.page, "h1:", r.h1, "overflow:", (r.scrollW as number) - (r.clientW as number), "cards:", JSON.stringify(r.cards), "hero:", JSON.stringify(r.hero))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
