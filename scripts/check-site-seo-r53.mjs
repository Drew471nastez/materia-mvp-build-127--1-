/**
 * ===========================================================================
 *  WHAT GOOGLE READS FROM A PUBLISHED WEBSITE AND A ONEPAGE (round 53)
 * ===========================================================================
 * Against a local production build (`next start` in DIR) reading the
 * Supabase stub, every page type on every kind of host, as a crawler gets
 * it: the markup a request with the public Host header is answered with
 * (proxy.ts routes it as on Vercel), then the files beside it.
 *
 *   nova.storelib.com      Storelib theme, subdomain
 *   www.lenashop.test      Storelib theme, connected domain (lena.storelib.com names it)
 *   mara.storelib.com      imported theme (the owner's Materia, with a
 *                          Dawn style Liquid head: page_title,
 *                          page_description, canonical_url, settings.favicon)
 *   www.irisshop.test      the same, on a connected domain
 *   storelib.me/satori     a OnePage
 *   www.satorilinks.test   the same creator's page domain: its OnePage at /links
 *
 * Each site sets its favicon (a 300 by 200 PNG in storage, so the square
 * one has to be made), a brand name, an SEO title and description and a
 * share picture, and has an about page, products, a collection and a blog
 * with a post.
 *
 * Build it pointed at the stub first:
 *
 *   node scripts/load/local-bench.mjs --stub &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 <CLAUDE.md placeholders> pnpm build
 *   DIR=<built checkout> node scripts/check-site-seo-r53.mjs [--json FILE]
 *
 * For every page: status, <title>, meta description, canonical (absolute,
 * on the primary host), og:title, og:description, og:site_name, og:url,
 * og:image (absolute), twitter:card, no noindex, <link rel=icon> on the
 * page's own host with sizes of 48 or more, apple-touch-icon, never
 * Storelib's icon, and never the words "Storelib" in the title or
 * description. The front page: WebSite structured data with name and
 * alternateName. A product: Product with name, image and an Offer with
 * price, priceCurrency and availability. A post: BlogPosting with
 * headline, image, datePublished, author and publisher. Each host's
 * /favicon.ico (a square PNG of 48 or more, a multiple of 48),
 * /apple-touch-icon, /site.webmanifest, /robots.txt (no rule keeping a
 * crawler from the icon, a sitemap on the primary host) and /sitemap.xml
 * (every page, product, collection, blog and post, on the primary host).
 *
 * Exits 1 on any failure; --json writes every check.
 */
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { request as httpRequest } from "node:http"
import sharp from "sharp"
import { build } from "esbuild"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { fixtureTables, products, CREATOR as SATORI, USER as SATORI_USER } from "./load/local-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3531)
const STUB_PORT = Number(process.env.STUB_PORT || 54391)
const STUB = `http://127.0.0.1:${STUB_PORT}`
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const at = "2026-10-01T10:00:00.000Z"
const root = process.cwd()

/* ── Pictures in storage: each site's favicon, 300 by 200 (not square, on purpose), and satori's photo ── */
const png = (w, h, color) => sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer()
const FILES = {
  "media/nova/favicon.png": { type: "image/png", body: await png(300, 200, "#ff5500") },
  "media/lena/favicon.png": { type: "image/png", body: await png(300, 200, "#0055ff") },
  "media/mara/favicon.png": { type: "image/png", body: await png(300, 200, "#11aa55") },
  "media/iris/favicon.png": { type: "image/png", body: await png(300, 200, "#aa1155") },
  "media/satori/avatar.png": { type: "image/png", body: await png(400, 400, "#7733cc") },
}
const storage = (path) => `${STUB}/storage/v1/object/public/${path}`
/* Pictures a share card names: full https addresses (never fetched by this probe). */
const shot = (name) => `https://cdn.example.com/${name}.jpg`

/* ── The fixture ── */
const T = fixtureTables()
for (const t of ["store_theme_settings", "store_theme_pages", "store_theme_custom_files", "product_collections", "product_collection_items", "site_blog_settings", "site_blog_posts", "site_blog_categories", "site_blog_authors", "site_blog_redirects", "store_menus", "site_releases", "store_localization", "site_access", "site_deployments", "wishlist_items", "subscribers", "team_members", "membership_plans", "product_sales_status", "community_members", "community_plans", "offers", "product_bundles", "upsells", "store_settings", "commerce_settings", "store_offers"]) T[t] = T[t] ?? []

/* satori's photo, so the OnePage has an icon of its own. */
T.profiles[0].avatar_url = storage("media/satori/avatar.png")
T.creators[0].avatar_url = storage("media/satori/avatar.png")
T.onepages[0].published_profile.avatar_url = storage("media/satori/avatar.png")
/* kai: a OnePage with no domain of its own, so storelib.me/kai is its canonical. */
const KAI_USER = "11111111-1111-4111-8111-1111111111aa"
const KAI = "22222222-2222-4222-8222-2222222222aa"
T.profiles.push({ ...T.profiles[0], id: KAI_USER, username: "kai", display_name: "Kai Records", bio: "Records from Kai", avatar_url: storage("media/satori/avatar.png") })
T.creators.push({ ...T.creators[0], id: KAI, user_id: KAI_USER, slug: "kai", username: "kai", display_name: "Kai Records", bio: "Records from Kai" })
T.onepages.push({ ...T.onepages[0], id: "66666666-6666-4666-8666-0000000000aa", slug: "kai", seller_id: KAI, creator_id: KAI, owner_id: KAI_USER, title: "Kai Records", bio: "Records from Kai", published_profile: { title: "Kai Records", bio: "Records from Kai", avatar_url: storage("media/satori/avatar.png") }, published_blocks: [{ id: "blk-kai", type: "link", enabled: true, sort_order: 1, data: { title: "Listen", url: "https://example.com/kai" } }] })

const SITE = {}
function people({ name, user, creator, brand }) {
  T.profiles.push({ id: user, username: name, display_name: `${brand} owner`, avatar_url: null, email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at })
  T.creators.push({ id: creator, user_id: user, slug: name, username: name, name, display_name: `${brand} owner`, onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at })
}
function shopRows({ name, creator, user, slugs, n }) {
  const ids = slugs.map((_, k) => `33333333-3333-4333-8333-0000000000${n}${k + 1}`)
  T.products.push(...slugs.map((slug, k) => ({ ...products[0], id: ids[k], creator_id: creator, seller_id: creator, title: `${name} ${slug}`, slug, description: `The ${slug} from ${name}, described.`, thumbnail_url: shot(`${name}-${slug}`), gallery_urls: [shot(`${name}-${slug}-2`)], images: [shot(`${name}-${slug}`)], creators: { user_id: user } })))
  const collection = `77777777-7777-4777-8777-0000000000${n}1`
  T.product_collections.push({ id: collection, creator_id: creator, slug: "best", title: "Best sellers", description: `${name}'s best sellers.`, image_url: shot(`${name}-best`), published: true, sort_order: 0, created_at: at, updated_at: at })
  T.product_collection_items.push(...ids.map((product_id, position) => ({ id: `${collection}-${position}`, collection_id: collection, product_id, position, created_at: at })))
  T.site_blog_settings.push({ creator_id: creator, handle: "news", previous_handles: [], title: "Journal", description: `Notes from ${name}.`, posts_per_page: 12, seo_title: null, seo_description: null, og_image_url: null, created_at: at, updated_at: at })
  T.site_blog_posts.push({ id: `88888888-8888-4888-8888-0000000000${n}1`, creator_id: creator, status: "published", slug: "first-post", title: `${name}'s first post`, excerpt: "How the first collection was made.", summary: "How the first collection was made.", content: [{ type: "p", html: "The first collection took a year. This is how it was made, from the first sketch to the last stitch." }], cover_image_url: shot(`${name}-post`), cover_alt: "", category_id: null, tags: [], author_id: null, seo_title: null, seo_description: null, canonical_url: null, og_title: null, og_description: null, og_image_url: null, noindex: false, featured: false, word_count: 20, reading_minutes: 1, published_at: at, first_published_at: at, content_updated_at: at, created_at: at, updated_at: at })
}
const siteSettings = (name, brand) => ({
  brand_name: brand,
  favicon_url: storage(`media/${name}/favicon.png`),
  seo_title: `${brand}: handmade goods`,
  seo_description: `${brand} makes handmade goods in small batches.`,
  seo_og_image: shot(`${name}-share`),
})

const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
function storelibSite({ name, brand, user, creator, install, n }) {
  people({ name, user, creator, brand })
  const settings = { id: `s-${name}`, install_id: install, settings: siteSettings(name, brand), draft_settings: null, created_at: at, updated_at: at }
  const pages = ["home", "about"].map((key, i) => ({ id: `p-${name}-${i}`, install_id: install, page_key: key, sections, draft_sections: null, created_at: at, updated_at: at }))
  T.store_theme_installs.push({ id: install, creator_id: creator, theme_id: "default", name: `${name}'s site`, status: "published", is_custom: false, sort_order: 0, created_at: at, updated_at: at, published_at: at, store_theme_settings: settings, settings, pages })
  T.store_theme_settings.push(settings)
  T.store_theme_pages.push(...pages)
  shopRows({ name, creator, user, slugs: [`${name}-pack-1`, `${name}-pack-2`], n })
  SITE[name] = { brand, kind: "storelib", product: `${name}-pack-1`, page: "/about" }
}

/*
  The owner's Materia (tests/fixtures/materia-live), with its head written
  the way a Shopify theme writes it (Dawn's layout and meta-tags snippet), in
  place of the served head the fixture keeps: the probe is of what Storelib
  gives the theme's Liquid, so the head has to ask for it.
*/
const LIQUID_HEAD = `
<title>{{ page_title }}{% if current_page != 1 %} &ndash; Page {{ current_page }}{% endif %}{% unless page_title contains shop.name %} &ndash; {{ shop.name }}{% endunless %}</title>
{% if page_description %}<meta name="description" content="{{ page_description | escape }}">{% endif %}
<link rel="canonical" href="{{ canonical_url }}">
{% if settings.favicon != blank %}<link rel="icon" type="image/png" href="{{ settings.favicon | image_url: width: 32, height: 32 }}">{% endif %}
{%- liquid
  assign og_title = page_title | default: shop.name
  assign og_url = canonical_url | default: request.origin
  assign og_type = 'website'
  assign og_description = page_description | default: shop.description | default: shop.name
  if request.page_type == 'product'
    assign og_type = 'product'
  elsif request.page_type == 'article'
    assign og_type = 'article'
  endif
-%}
<meta property="og:site_name" content="{{ shop.name }}">
<meta property="og:url" content="{{ og_url }}">
<meta property="og:title" content="{{ og_title | escape }}">
<meta property="og:type" content="{{ og_type }}">
<meta property="og:description" content="{{ og_description | escape }}">
{%- if page_image -%}
<meta property="og:image" content="http:{{ page_image | image_url }}">
<meta property="og:image:secure_url" content="https:{{ page_image | image_url }}">
{%- endif -%}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{ og_title | escape }}">
<meta name="twitter:description" content="{{ og_description | escape }}">
`
const SERVED_HEAD_TAGS = /<title>[\s\S]*?<\/title>|<meta\b[^>]*\b(?:property|name)="(?:og:[a-z_:]+|twitter:[a-z_:]+|description)"[^>]*>|<link\b[^>]*\brel="(?:canonical|icon|shortcut icon|apple-touch-icon|alternate)"[^>]*>|<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g
async function materia() {
  const dir = join(root, "node_modules/.cache/r53")
  mkdirSync(dir, { recursive: true })
  const entry = join(dir, "materia-src.mjs")
  const out = join(dir, "materia-entry.mjs")
  writeFileSync(entry, `import { materiaLiveTheme } from ${JSON.stringify(join(root, "scripts/materia-live-fixture.mjs"))}
export async function theme(head, schema) {
  return materiaLiveTheme({ edit: async (zip) => {
    const layout = await zip.file("layout/theme.liquid").async("string")
    zip.file("layout/theme.liquid", layout.replace(${SERVED_HEAD_TAGS.toString()}, "").replace("{{ content_for_header }}", "{{ content_for_header }}\\n" + head))
    /* A product and a collection template, as every Shopify theme has (the fixture keeps the front page only). */
    zip.file("sections/main-product.liquid", '<div class="probe-product"><h1>{{ product.title }}</h1><p>{{ product.price | money }}</p>{{ product.description }}</div>\\n{% schema %}{"name":"Product","settings":[]}{% endschema %}\\n')
    zip.file("templates/product.json", JSON.stringify({ sections: { main: { type: "main-product", settings: {} } }, order: ["main"] }))
    zip.file("sections/main-collection.liquid", '<div class="probe-collection"><h1>{{ collection.title }}</h1>{% for p in collection.products %}<a href="{{ p.url }}">{{ p.title }}</a>{% endfor %}</div>\\n{% schema %}{"name":"Collection","settings":[]}{% endschema %}\\n')
    zip.file("templates/collection.json", JSON.stringify({ sections: { main: { type: "main-collection", settings: {} } }, order: ["main"] }))
    const s = JSON.parse(await zip.file("config/settings_schema.json").async("string"))
    s.push(schema)
    zip.file("config/settings_schema.json", JSON.stringify(s))
  } })
}
`)
  await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", packages: "external", tsconfig: join(root, "tsconfig.json"), outfile: out, logLevel: "warning" })
  return (await import(out)).theme(LIQUID_HEAD, { name: "Logos", settings: [{ type: "image_picker", id: "favicon", label: "Favicon" }] })
}
const materiaTheme = await materia()
function compatSite({ name, brand, user, creator, install, n }) {
  people({ name, user, creator, brand })
  const t = materiaTheme
  const own = siteSettings(name, brand)
  /* The favicon is one value in both places (lib/website-builder/favicon-sync.ts). */
  const merged = { ...t.settings, ...own, shopify: { ...(t.settings.shopify ?? {}), favicon: own.favicon_url } }
  const settings = { id: `s-${name}`, install_id: install, settings: merged, draft_settings: null, created_at: at, updated_at: at, kind: "shopify", live: "shopify", draft: null }
  const pages = Object.entries(t.pages).map(([key, s], i) => ({ id: `p-${name}-${i}`, install_id: install, page_key: key, sections: s, draft_sections: null, created_at: at, updated_at: at }))
  T.store_theme_installs.push({ id: install, creator_id: creator, theme_id: "custom", name: "Materia", status: "published", is_custom: true, sort_order: 0, created_at: at, updated_at: at, published_at: at, store_theme_settings: settings, settings, pages })
  T.store_theme_settings.push(settings)
  T.store_theme_pages.push(...pages)
  T.store_theme_custom_files.push(...Object.entries(t.all).map(([path, content]) => ({ install_id: install, path, content, draft_content: null })))
  shopRows({ name, creator, user, slugs: ["pants-down", "black-sleeves"], n })
  SITE[name] = { brand, kind: "imported", product: "pants-down", page: null, pageKeys: Object.keys(t.pages) }
}

storelibSite({ name: "nova", brand: "Nova Studio", user: "11111111-1111-4111-8111-1111111111dd", creator: "22222222-2222-4222-8222-2222222222dd", install: "44444444-4444-4444-8444-4444444444dd", n: "d" })
storelibSite({ name: "lena", brand: "Lena Goods", user: "11111111-1111-4111-8111-1111111111cc", creator: "22222222-2222-4222-8222-2222222222cc", install: "44444444-4444-4444-8444-4444444444cc", n: "c" })
compatSite({ name: "mara", brand: "Mara Wear", user: "11111111-1111-4111-8111-1111111111ee", creator: "22222222-2222-4222-8222-2222222222ee", install: "44444444-4444-4444-8444-4444444444ee", n: "e" })
compatSite({ name: "iris", brand: "Iris Atelier", user: "11111111-1111-4111-8111-1111111111ff", creator: "22222222-2222-4222-8222-2222222222ff", install: "44444444-4444-4444-8444-4444444444ff", n: "f" })
T.custom_domains = [
  { id: "d1", domain: "lenashop.test", creator_id: "22222222-2222-4222-8222-2222222222cc", status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: "11111111-1111-4111-8111-1111111111cc" } },
  { id: "d2", domain: "irisshop.test", creator_id: "22222222-2222-4222-8222-2222222222ff", status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: "11111111-1111-4111-8111-1111111111ff" } },
  { id: "d3", domain: "satorilinks.test", creator_id: SATORI, status: "active", purpose: "creator_page", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: SATORI_USER } },
]
T.profiles_public = T.profiles.map(({ email: _e, ...row }) => row)
T.creators_public = T.creators.map(({ stripe_account_id: _s, ...row }) => row)

/* ── The server ── */
const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T, files: FILES })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })

const ask = (host, path, { accept = "text/html", redirects = 0 } = {}) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, headers: { host, "x-forwarded-host": host, "x-forwarded-proto": "https", accept, "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } }, (res) => {
    const chunks = []
    res.on("data", (c) => chunks.push(c))
    res.on("end", async () => {
      const body = Buffer.concat(chunks)
      const loc = res.headers.location
      if (redirects > 0 && loc && res.statusCode >= 300 && res.statusCode < 400) {
        const u = new URL(loc, `https://${host}${path}`)
        return resolve(ask(u.host, `${u.pathname}${u.search}`, { accept, redirects: redirects - 1 }).then((r) => ({ ...r, via: [`${res.statusCode} ${loc}`, ...(r.via ?? [])] })))
      }
      resolve({ status: res.statusCode, headers: res.headers, body, text: body.toString("utf8"), host, path })
    })
  })
  req.on("error", reject)
  req.end()
})
for (let i = 0; i < 480; i++) { try { await ask("storelib.com", "/robots.txt"); break } catch { await sleep(250) } }

/* ── Reading a page's head ── */
const decode = (s) => String(s ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&ndash;/g, "–")
function attrsOf(tag) {
  const out = {}
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "")
  return out
}
function headOf(page) {
  /* The head only: an SVG's <title> in the body (a payment icon) is not the page's. */
  const end = page.search(/<\/head\s*>/i)
  const html = end > 0 ? page.slice(0, end) : page
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrsOf(m[0]))
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrsOf(m[0]))
  const meta = (k) => metas.filter((a) => a.name === k || a.property === k).map((a) => a.content)
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => decode(m[1]).replace(/\s+/g, " ").trim())
  const rel = (r) => links.filter((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes(r))
  const ld = [...page.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try {
      const j = JSON.parse(m[1])
      const all = Array.isArray(j) ? j : [j]
      return all.flatMap((x) => (x && x["@graph"] ? x["@graph"] : [x]))
    } catch { return [{ "@type": "INVALID JSON" }] }
  })
  return { titles, meta, rel, ld }
}

const results = []
let failed = 0
function check(group, what, ok, got) {
  results.push({ group, what, ok: !!ok, got: ok ? undefined : got })
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${JSON.stringify(got)?.slice(0, 260)}`}`)
}
const hostOf = (u) => { try { return new URL(u).host } catch { return null } }
const absolute = (u) => /^https:\/\/[^/]+\//.test(u ?? "")

/* ── One HTML page ── */
async function page({ group, host, path, primary, canonicalPath = path, brand, kind, type, ownSiteIcon = true }) {
  console.log(`\n${group}  ${type}  https://${host}${path}`)
  const r = await ask(host, path, { redirects: 3 })
  check(group, `${type}: answers 200`, r.status === 200, { status: r.status, via: r.via })
  /* DUMP=<dir>: every page as served, to read by hand. */
  if (process.env.DUMP) { mkdirSync(process.env.DUMP, { recursive: true }); writeFileSync(join(process.env.DUMP, `${host}${path}`.replace(/[^a-z0-9.]+/gi, "_") + ".html"), r.text) }
  if (r.status !== 200) return
  const h = headOf(r.text)
  const title = h.titles[0] ?? ""
  const desc = h.meta("description")[0] ?? ""
  const canon = h.rel("canonical").map((l) => l.href)
  const robots = [...h.meta("robots"), ...h.meta("googlebot"), String(r.headers["x-robots-tag"] ?? "")].join(" ")
  check(group, `${type}: one <title>, with the site's name, never "Storelib"`, h.titles.length === 1 && title.includes(brand) && !/storelib/i.test(title), h.titles)
  check(group, `${type}: one meta description, never "Storelib"`, h.meta("description").length === 1 && desc.length >= 10 && !/storelib/i.test(desc), h.meta("description"))
  check(group, `${type}: one canonical, absolute, on ${primary}${canonicalPath}`, canon.length === 1 && canon[0] === `https://${primary}${canonicalPath}`, canon)
  check(group, `${type}: no noindex`, !/noindex/i.test(robots), robots)
  const og = (k) => h.meta(`og:${k}`)
  check(group, `${type}: og:title`, og("title").length === 1 && og("title")[0].length > 0 && !/^storelib$/i.test(og("title")[0]), og("title"))
  check(group, `${type}: og:description, never "Storelib"`, og("description").length === 1 && og("description")[0].length > 0 && !/storelib/i.test(og("description")[0]), og("description"))
  check(group, `${type}: og:site_name is "${brand}"`, og("site_name").length === 1 && og("site_name")[0] === brand, og("site_name"))
  check(group, `${type}: og:url is the canonical`, og("url").length === 1 && og("url")[0] === canon[0], og("url"))
  check(group, `${type}: og:image absolute https`, og("image").length >= 1 && og("image").every(absolute), og("image"))
  check(group, `${type}: never says Storelib wrote or published it (author, creator, publisher, generator, keywords)`, !["author", "creator", "publisher", "generator", "keywords"].some((k) => h.meta(k).some((v) => /storelib|sell digital products/i.test(v))), ["author", "creator", "publisher", "generator", "keywords"].map((k) => h.meta(k)))
  if (type === "product") check(group, `${type}: og:image is the product's own photo`, og("image").length >= 1 && og("image").every((u) => /-(pack-\d|pants-down|black-sleeves)(-2)?\.jpg$/.test(u)), og("image"))
  if (type === "collection") {
    check(group, `${type}: its own description`, /best sellers/i.test(desc), desc)
    check(group, `${type}: og:image is its own picture`, og("image").length >= 1 && og("image").every((u) => /-best\.jpg$/.test(u)), og("image"))
  }
  check(group, `${type}: twitter:card`, h.meta("twitter:card").length === 1 && /^summary(_large_image)?$/.test(h.meta("twitter:card")[0]), h.meta("twitter:card"))
  if (ownSiteIcon) {
    const icons = h.rel("icon")
    const big = icons.filter((l) => /^\d+x\d+$/.test(l.sizes ?? "") && Number(l.sizes.split("x")[0]) >= 48 && Number(l.sizes.split("x")[0]) % 48 === 0)
    const onHost = (l) => !hostOf(new URL(l.href, `https://${host}/`).href) || hostOf(new URL(l.href, `https://${host}/`).href) === host || hostOf(new URL(l.href, `https://${host}/`).href) === primary
    check(group, `${type}: <link rel=icon> on this host, sized 48 or more (a multiple of 48)`, big.length >= 1 && big.every(onHost), icons)
    check(group, `${type}: every <link rel=icon> is 48 or more, or says no size (Google picks any)`, icons.every((l) => !l.sizes || l.sizes === "any" || Number(l.sizes.split("x")[0]) >= 48), icons)
    check(group, `${type}: apple-touch-icon on this host`, h.rel("apple-touch-icon").length >= 1 && h.rel("apple-touch-icon").every(onHost), h.rel("apple-touch-icon"))
    check(group, `${type}: never Storelib's icon`, ![...icons, ...h.rel("apple-touch-icon"), ...h.rel("shortcut")].some((l) => /^https?:\/\/(www\.)?storelib\.(com|me)\/|^\/(icon|apple-icon)(\.png)?(\?|$)/.test(l.href)), icons)
  }
  if (type === "home") {
    const site = h.ld.find((x) => x["@type"] === "WebSite")
    check(group, `${type}: WebSite structured data named "${brand}", with an alternateName`, site && site.name === brand && typeof site.alternateName === "string" && site.alternateName.length > 0 && site.url === `https://${primary}/`, site)
  }
  if (type === "product") {
    const p = h.ld.find((x) => x["@type"] === "Product")
    const offer = Array.isArray(p?.offers) ? p.offers[0] : p?.offers
    check(group, `${type}: Product with name, image, Offer price, priceCurrency, availability`, p && p.name && p.image && offer && offer.price !== undefined && offer.priceCurrency && offer.availability, p)
    check(group, `${type}: Product url on ${primary}`, p && hostOf(p.url) === primary, p?.url)
  }
  if (type === "article") {
    const a = h.ld.find((x) => x["@type"] === "BlogPosting" || x["@type"] === "Article")
    check(group, `${type}: BlogPosting with headline, image, datePublished, author, publisher`, a && a.headline && a.image && a.datePublished && a.author && a.publisher?.name === brand, a)
  }
  return { title, desc, canonical: canon[0], ogImage: og("image")[0], siteName: og("site_name")[0] }
}

async function files({ group, host, primary, brand, sitemap = [] }) {
  console.log(`\n${group}  files  https://${host}`)
  const ico = await ask(host, "/favicon.ico", { accept: "image/*", redirects: 2 })
  let meta = null
  try { meta = ico.status === 200 ? await sharp(ico.body).metadata() : null } catch { meta = null }
  check(group, "/favicon.ico: the site's picture, a square PNG of 48 or more, a multiple of 48", ico.status === 200 && meta && meta.width === meta.height && meta.width >= 48 && meta.width % 48 === 0, { status: ico.status, type: ico.headers?.["content-type"], via: ico.via, size: meta && `${meta.width}x${meta.height}` })
  check(group, "/favicon.ico: never Storelib's", ico.status === 200 && !(ico.via ?? []).some((v) => /storelib\.com\//.test(v)) && meta?.width !== undefined, { via: ico.via })
  const touch = await ask(host, "/apple-touch-icon", { accept: "image/*", redirects: 2 })
  let tmeta = null
  try { tmeta = touch.status === 200 ? await sharp(touch.body).metadata() : null } catch { tmeta = null }
  check(group, "/apple-touch-icon: 180 by 180", touch.status === 200 && tmeta?.width === 180 && tmeta?.height === 180, { status: touch.status, size: tmeta && `${tmeta.width}x${tmeta.height}` })
  const man = await ask(host, "/site.webmanifest", { accept: "application/manifest+json" })
  let m = null
  try { m = JSON.parse(man.text) } catch { m = null }
  check(group, `/site.webmanifest: named "${brand}", icons on this host`, man.status === 200 && m?.name === brand && (m.icons ?? []).length >= 1 && m.icons.every((i) => i.src.startsWith("/")), { status: man.status, m })
  const robots = await ask(host, "/robots.txt", { accept: "text/plain" })
  check(group, "/robots.txt: lets crawlers in", robots.status === 200 && /User-agent: \*/i.test(robots.text) && !/^Disallow:\s*\/\s*$/m.test(robots.text), robots.text.slice(0, 300))
  check(group, "/robots.txt: nothing keeps a crawler from the icon", !/^Disallow:\s*\/(favicon|apple-touch|site\.webmanifest|\*\.ico)/m.test(robots.text), robots.text.slice(0, 300))
  check(group, `/robots.txt: names the sitemap on ${primary}`, robots.text.includes(`Sitemap: https://${primary}/sitemap.xml`), robots.text.slice(0, 300))
  const sm = await ask(host, "/sitemap.xml", { accept: "application/xml" })
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => decode(x[1]))
  check(group, "/sitemap.xml: answers with addresses", sm.status === 200 && locs.length > 0, { status: sm.status, body: sm.text.slice(0, 200) })
  check(group, `/sitemap.xml: every address on ${primary}`, locs.length > 0 && locs.every((l) => hostOf(l) === primary), locs.filter((l) => hostOf(l) !== primary).slice(0, 5))
  for (const p of sitemap) check(group, `/sitemap.xml lists ${p}`, locs.includes(`https://${primary}${p}`), locs)
  return { locs: locs.length }
}

/* ── Websites ── */
const summary = {}
for (const [host, name, primary] of [["nova.storelib.com", "nova", "nova.storelib.com"], ["www.lenashop.test", "lena", "www.lenashop.test"], ["lena.storelib.com", "lena", "www.lenashop.test"], ["mara.storelib.com", "mara", "mara.storelib.com"], ["www.irisshop.test", "iris", "www.irisshop.test"]]) {
  const s = SITE[name]
  const group = `${host} (${s.kind === "storelib" ? "Storelib theme" : "imported theme"}${host === primary ? "" : `, names ${primary}`})`
  const base = { group, host, primary, brand: s.brand, kind: s.kind }
  const rows = {}
  rows.home = await page({ ...base, path: "/", type: "home" })
  if (s.page) rows.page = await page({ ...base, path: s.page, type: "page" })
  rows.product = await page({ ...base, path: `/products/${s.product}`, type: "product" })
  rows.collection = await page({ ...base, path: "/collections/best", type: "collection" })
  rows.blog = await page({ ...base, path: "/blogs/news", type: "blog" })
  rows.article = await page({ ...base, path: "/blogs/news/first-post", type: "article" })
  if (host === primary) rows.files = await files({ ...base, sitemap: ["/", ...(s.page ? [s.page] : []), `/products/${s.product}`, "/collections/best", "/blogs/news", "/blogs/news/first-post"] })
  summary[host] = rows
}

/* ── The OnePage ── */
{
  const brand = "Satori Studio"
  const group = "storelib.me/kai (OnePage)"
  /* On storelib.me the host is Storelib's: its icon is Storelib's, and is not checked here. */
  summary["storelib.me/kai"] = { onepage: await page({ group, host: "storelib.me", path: "/kai", primary: "storelib.me", brand: "Kai Records", type: "onepage", ownSiteIcon: false }) }
  const sgroup = "storelib.me/satori (OnePage with a creator page domain)"
  summary["storelib.me/satori"] = { onepage: await page({ group: sgroup, host: "storelib.me", path: "/satori", primary: "www.satorilinks.test", canonicalPath: "/links", brand, type: "onepage", ownSiteIcon: false }) }
  const dgroup = "www.satorilinks.test/links (OnePage, creator page domain)"
  summary["www.satorilinks.test/links"] = {
    onepage: await page({ group: dgroup, host: "www.satorilinks.test", path: "/links", primary: "www.satorilinks.test", brand, type: "onepage" }),
  }
  /* The domain's front page is the creator page: Google reads the domain's icon from it first. */
  {
    const front = await ask("www.satorilinks.test", "/", { redirects: 2 })
    const icons = front.status === 200 ? headOf(front.text).rel("icon") : []
    console.log(`\n${dgroup}  front page  https://www.satorilinks.test/`)
    check(dgroup, "front page (the creator page): answers 200", front.status === 200, { status: front.status, via: front.via })
    check(dgroup, "front page: never Storelib's icon", icons.every((l) => !/^https?:\/\/(www\.)?storelib\.(com|me)\/|^\/(icon|apple-icon)(\.png)?(\?|$)|^\/icon-/.test(l.href)), icons)
  }
  console.log(`\n${dgroup}  files`)
  const ico = await ask("www.satorilinks.test", "/favicon.ico", { accept: "image/*", redirects: 2 })
  let meta = null
  try { meta = ico.status === 200 ? await sharp(ico.body).metadata() : null } catch { meta = null }
  check(dgroup, "/favicon.ico: the creator's picture, square, 48 or more, a multiple of 48", ico.status === 200 && meta && meta.width === meta.height && meta.width >= 48 && meta.width % 48 === 0, { status: ico.status, type: ico.headers?.["content-type"], via: ico.via, size: meta && `${meta.width}x${meta.height}` })
  const robots = await ask("www.satorilinks.test", "/robots.txt", { accept: "text/plain" })
  check(dgroup, "/robots.txt: lets crawlers in", robots.status === 200 && !/^Disallow:\s*\/\s*$/m.test(robots.text), robots.text.slice(0, 300))
  const sm = await ask("www.satorilinks.test", "/sitemap.xml", { accept: "application/xml", redirects: 2 })
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => decode(x[1]))
  check(dgroup, "/sitemap.xml lists https://www.satorilinks.test/links", locs.includes("https://www.satorilinks.test/links"), { status: sm.status, locs: locs.slice(0, 10) })
  console.log("\nstorelib.me  files")
  const meRobots = await ask("storelib.me", "/robots.txt", { accept: "text/plain" })
  check(group, "storelib.me/robots.txt: lets crawlers in, names a sitemap", meRobots.status === 200 && !/^Disallow:\s*\/\s*$/m.test(meRobots.text) && /Sitemap:/i.test(meRobots.text), meRobots.text.slice(0, 300))
  const smUrl = (meRobots.text.match(/Sitemap:\s*(\S+)/i) ?? [])[1]
  if (smUrl) {
    const u = new URL(smUrl)
    const meSm = await ask(u.host, u.pathname, { accept: "application/xml", redirects: 2 })
    let all = [...meSm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => decode(x[1]))
    /* An index: each file it names. */
    if (/<sitemapindex/.test(meSm.text)) {
      const inner = []
      for (const l of all) { const v = new URL(l); inner.push(...[...(await ask(v.host, v.pathname, { accept: "application/xml", redirects: 2 })).text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => decode(x[1]))) }
      all = inner
    }
    check(group, "storelib.me's sitemap names kai's OnePage at storelib.me/kai", all.includes("https://storelib.me/kai"), all.filter((l) => /kai|satori/.test(l)))
    /* Its canonical is on its own domain, whose own sitemap lists it (above): never listed at storelib.me too. */
    check(sgroup, "and not satori's at storelib.me/satori, whose canonical is its domain", !all.includes("https://storelib.me/satori"), all.filter((l) => /satori/.test(l)))
  }
}

console.log(`\n${failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`}`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ measuredAt: new Date().toISOString(), failed, results, summary }, null, 2))
process.exit(failed ? 1 : 0)
