/**
 * Round U: the website checkout that refused shipped products, settings that
 * open at the top and hold the page still, integrations Storelib can run from
 * /admin, physical products kept out of the marketplace, and the help pages
 * the settings point at.
 *
 *   npx tsx tests/round-u.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { priceCart } from "@/lib/checkout/pricing"
import { TRACKERS, TRACKER_HOSTS, tidyId, trackingTags } from "@/lib/store/tracking"
import { INTEGRATIONS, integrationById, visibleIntegrations } from "@/lib/integrations/catalog"
import { applyCatalogOverrides, readOverride, safeLogoUrl } from "@/lib/integrations/overrides"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"
import { ALL_HELP_ARTICLES } from "@/lib/help/articles"
import { replaceMemory, sameMemory, type MemoryDb } from "@/lib/ai-memory/store"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A database with just enough of PostgREST's shape for priceCart: products by id, nothing owned, no variants. */
function fakeDb(products: Record<string, unknown>[]) {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {}
    const self = () => q
    for (const m of ["select", "in", "eq", "neq", "is", "order", "limit", "gte"]) q[m] = self
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok)
    return q
  }
  return { from: (t: string) => chain(t === "products" ? products : []) }
}

async function main() {
  console.log("\nA website cart with something that ships\n")
  {
    const shop = "11111111-1111-4111-8111-111111111111"
    const hoodie = { id: "22222222-2222-4222-8222-222222222222", title: "Hoodie", slug: "hoodie", price_cents: 4000, pay_what_you_want: false, pwyw_min_price_cents: null, thumbnail_url: null, type: "physical", status: "published", creator_id: shop }
    const ebook = { id: "33333333-3333-4333-8333-333333333333", title: "Ebook", slug: "ebook", price_cents: 1500, pay_what_you_want: false, pwyw_min_price_cents: null, thumbnail_url: null, type: "digital", status: "published", creator_id: shop }
    const onlyShips = await priceCart(fakeDb([hoodie]), { items: [{ productId: hoodie.id, variantId: null, quantity: 2 }] })
    check("a cart of shipped products is handed on whole, not refused", onlyShips.ok === true && onlyShips.ships.length === 1 && onlyShips.ships[0].quantity === 2, onlyShips)
    const mixed = await priceCart(fakeDb([hoodie, ebook]), { items: [{ productId: hoodie.id, quantity: 1 }, { productId: ebook.id, quantity: 1 }] })
    check("  a mixed cart goes on with every line, the download beside the hoodie", mixed.ok === true && mixed.ships.length === 2)
    const digital = await priceCart(fakeDb([ebook]), { items: [{ productId: ebook.id, quantity: 1 }] })
    check("  a cart with nothing that ships stays on the basket checkout", digital.ok === true && digital.ships.length === 0 && digital.lines.length === 1)
    const route = read("app/api/checkout/cart/route.ts")
    check("the basket route sends a shipping cart to the physical checkout with its url", /if \(priced\.ships\.length > 0\)/.test(route) && /physicalCheckoutHref\(creatorId, priced\.ships/.test(route) && /ships: true/.test(route))
    check("  and the old refusal is gone, with named items when something really can't be bought", !/"Nothing in the cart can be bought right now"/.test(route.replace(/\/\*[\s\S]*?\*\//g, "")) && /can't be bought right now/.test(route))
    check("  a code on a shipping cart is added on the next page, not refused", /Something in this cart ships/.test(read("app/api/coupons/validate/route.ts")))
    check("  an imported theme's checkout follows the url it is given", /location\.replace\(x\.b\.url\)/.test(read("lib/storelib-theme/compat/site.ts")))
  }

  console.log("\nSettings opens at the top and holds the page still\n")
  {
    const form = read("components/app/settings-form-new.tsx")
    check("a section opens at its top, and the old height pin is cleared", /EVERY SECTION OPENS AT ITS TOP/.test(form) && /formRef\.current\.style\.minHeight = ""/.test(form) && /scroller\.scrollTo\(\{ top: 0, behavior: "instant"/.test(form) && !/form\.style\.minHeight = `\$\{Math\.max/.test(form))
    check("  a little wider on a computer", /lg:max-w-\[1200px\]/.test(form) && /lg:grid-cols-\[232px_minmax\(0,1fr\)\]/.test(form))
    const sheet = read("components/app/settings-sheet.tsx")
    check("the window is held while the sheet is up, its scroll bar's room kept", /html\.style\.overflow = "hidden"/.test(sheet) && /setProperty\("scrollbar-gutter", "stable"\)/.test(sheet) && /window\.innerWidth - html\.clientWidth/.test(sheet))
    check("  a wheel or a finger on the dimmed page scrolls nothing", /addEventListener\("wheel", outside, \{ passive: false \}\)/.test(sheet) && /addEventListener\("touchmove", outside, \{ passive: false \}\)/.test(sheet))
    check("  no blurred fade cutting the top; a hairline under the handle once scrolled", !/backdropFilter: "blur\(6px\)"/.test(sheet) && /shadow-\[0_1px_0_rgba\(15,17,21,0\.06\)\]/.test(sheet))
  }

  console.log("\nIntegrations\n")
  {
    check("Klaviyo keeps its case, Omnisend and Clarity are lower case, the rest upper", tidyId("klaviyo", " AbC123 ") === "AbC123" && tidyId("omnisend", "5F8A1B2C3D4E5F6A7B8C9D0E") === "5f8a1b2c3d4e5f6a7b8c9d0e" && tidyId("clarity", "K3X9Q2W7AB") === "k3x9q2w7ab" && tidyId("ga4", "g-abcd1234") === "G-ABCD1234")
    check("  a bad one is refused", tidyId("klaviyo", "AbC12") === "bad" && tidyId("klaviyo", "<x>") === "bad" && tidyId("omnisend", "zz") === "bad")
    const tags = trackingTags({ klaviyo: "AbC123", omnisend: "5f8a1b2c3d4e5f6a7b8c9d0e", clarity: "k3x9q2w7ab" })
    check("  their own snippets, by ID only", tags.map((t) => t.key).join() === "clarity,klaviyo,omnisend" && tags.some((t) => t.src === "https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AbC123"))
    check("  every host is in the content security policy and vercel.json carries it", TRACKER_HOSTS.every((h) => CONTENT_SECURITY_POLICY.includes(h)) && read("vercel.json").includes(CONTENT_SECURITY_POLICY))
    check("Email marketing and Automation are categories; the services asked for are listed, never installable", ["klaviyo", "omnisend", "mailchimp", "brevo", "zapier", "make", "dsers", "zendrop", "spocket", "autods", "syncee"].every((id) => !!integrationById(id)) && INTEGRATIONS.filter((i) => i.kind === "listed").every((i) => i.comingSoon && !i.builtIn))
    check("  the dropshipping ones only with physical products on", !visibleIntegrations(false).some((i) => i.id === "zendrop") && visibleIntegrations(true).some((i) => i.id === "zendrop"))
    const rows = [readOverride({ id: "meta-pixel", availability: "coming_soon", name: "Meta" }), readOverride({ id: "tiktok-pixel", availability: "hidden" }), readOverride({ id: "sendcloud", custom: true, name: "Sendcloud", category: "shipping", physical: true }), readOverride({ id: "Bad Id" })]
    check("an /admin row is read defensively", rows[3] === null && rows[0]?.availability === "coming_soon")
    const after = applyCatalogOverrides(visibleIntegrations(true), rows.filter((r): r is NonNullable<typeof r> => !!r), true)
    check("  paused shows as Coming soon, hidden is gone, a custom one is added as Coming soon", after.find((i) => i.id === "meta-pixel")?.paused === true && after.find((i) => i.id === "meta-pixel")?.name === "Meta" && !after.some((i) => i.id === "tiktok-pixel") && after.find((i) => i.id === "sendcloud")?.comingSoon === true)
    check("  a custom physical one stays out while physical commerce is off", !applyCatalogOverrides(visibleIntegrations(false), rows.filter((r): r is NonNullable<typeof r> => !!r), false).some((i) => i.id === "sendcloud"))
    check("  an icon is an https image or a file of ours, never a script address", safeLogoUrl("javascript:alert(1)") === null && safeLogoUrl("/integrations/x.svg") === "/integrations/x.svg" && safeLogoUrl("http://x.com/a.png") === null)
    const ui = read("components/app/settings/integrations-directory.tsx")
    check("the directory: real statuses, Storelib's own mark, Tell me when it's ready, Back where you were", /function StatusBadge/.test(ui) && /data-integration-mark="storelib"/.test(ui) && /Tell me when it's ready/.test(ui) && /listScroll\.current/.test(ui) && /integration-grid-in/.test(ui))
    const req = read("app/api/store/integrations/request/route.ts")
    check("a request says sent only once it is kept, and never shows a store the SQL part", /return physicalJson\(\{ ok: true \}\)/.test(req) && !/Run SQL part/.test(req) && /already: true/.test(req))
    const admin = read("app/api/admin/integrations/route.ts")
    check("/admin › Integrations behind the admin cookie, answers requests, edits the catalog, never reads a key", /requireAdmin\(\)/.test(admin) && /action === "request"/.test(admin) && /action === "catalog"/.test(admin) && !/secret_ciphertext|api_key/.test(admin))
    check("  listed in the console", /href: "\/admin\/integrations"/.test(read("app/admin/_console/shell.tsx")))
    const side = read("components/app/sidebar.tsx")
    check("the sidebar gets an Integrations group only when something is installed", /if \(installedIntegrations\.length > 0\)/.test(side) && /\/api\/store\/integrations\/installed/.test(side))
    const sql = read("supabase/sql/run-now/115_integrations_admin_and_marketplace_search.sql")
    check("part 115: request notes, a server only catalog, search without physical products", /ADD COLUMN IF NOT EXISTS admin_note/.test(sql) && /CREATE TABLE IF NOT EXISTS public\.integration_catalog/.test(sql) && /REVOKE ALL ON public\.integration_catalog FROM anon, authenticated/.test(sql) && /coalesce\(p\.type, ''\) <> 'physical'/.test(sql) && /notify pgrst, 'reload schema';\n$/.test(sql))
    check("  with its README row and its check after", /115_integrations_admin_and_marketplace_search\.sql/.test(read("supabase/sql/run-now/README.md")) && /p115_integrations_admin_search/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log("\nPhysical products stay off the marketplace\n")
  {
    check("the sitemap, the seller's marketplace profile and More from this seller leave them out", /\.neq\("type", "physical"\)/.test(read("lib/seo/sitemaps.ts")) && (read("app/(marketing)/u/[username]/page.tsx").match(/\.neq\("type", "physical"\)/g) ?? []).length >= 2 && /\.neq\("type", "physical"\)/.test(read("lib/commerce/product-page-cache.ts")))
  }

  console.log("\nHelp, the 404 and the header\n")
  {
    const slugs = new Set(ALL_HELP_ARTICLES.map((a) => `/help/${a.category}/${a.slug}`))
    const linked = [...read("lib/settings/explainers.ts").matchAll(/guide: "(\/help\/[^"]+)"/g)].map((m) => m[1])
    check("every How it works guide opens a real article", linked.length > 0 && linked.every((l) => slugs.has(l)), linked.filter((l) => !slugs.has(l)))
    const taxes = ALL_HELP_ARTICLES.find((a) => a.category === "physical-products" && a.slug === "taxes")
    check("  /help/physical-products/taxes is a full article: setup, examples, troubleshooting", !!taxes && taxes.body.filter((b) => b.type === "table").length >= 3 && taxes.body.some((b) => b.type === "steps"))
    const nf = read("app/not-found.tsx")
    check("the 404: the header, Go back and home, no Explore button", /<PlatformHeaderClient \/>/.test(nf) && /<NotFoundActions \/>/.test(nf) && !/href="\/explore"/.test(nf))
    const header = read("components/platform/platform-header-client.tsx")
    check("Help, Terms and Privacy take the reading header, no marketplace search", /const isReadRoute = pathname === "\/help"/.test(header) && /isDevelopersRoute \|\| isReadRoute/.test(header))
    check("  on the dark bar the search field is the bar's colour, not white", /!buyerHeaderLight && HEADER_FIELD_ON_DARK/.test(header))
    check("  those pages follow the header colour set in /admin", ["app/help/layout.tsx", "app/terms/layout.tsx", "app/privacy/layout.tsx"].every((p) => /ConditionalHeader buyerHeaderLight=\{buyerHeaderLight\}/.test(read(p))))
  }

  console.log("\nSettings data and AI Memory\n")
  {
    const panel = read("components/app/settings/store-details-panel.tsx")
    check("store name and contact email start from the account, never a made up shop", !/Angus Farm/.test(panel) && /data\.suggested\?\.storeName/.test(panel) && /data\.suggested\?\.contactEmail/.test(panel))
    const billing = read("components/app/billing/billing-page-client.tsx")
    check("Plan: the pricing cards first, then the overview and the history", billing.indexOf("<PricingTiers") < billing.indexOf("SECTION 1: Subscription Overview") && billing.indexOf("SECTION 1: Subscription Overview") < billing.indexOf("SECTION 2: Billing History"))
    check("a memory written twice with other punctuation is one", sameMemory("No gradients.", "no   gradients") && !sameMemory("no gradients", "gradients"))
    const rows: { id: string; content: string; install_id: null; source: string; created_at: string; creator_id: string }[] = [{ id: "a", content: "Prices in dollars", install_id: null, source: "creator", created_at: "2026-10-01", creator_id: "c" }]
    const db = {
      from: () => {
        let mode = "select"
        let ins: Record<string, unknown> | null = null
        const q: Record<string, unknown> = {}
        const self = () => q
        for (const m of ["eq", "is", "order", "limit", "select", "single"]) q[m] = self
        q.insert = (r: Record<string, unknown>) => ((mode = "insert"), (ins = r), q)
        q.delete = () => ((mode = "delete"), q)
        q.then = (ok: (v: unknown) => unknown) => {
          if (mode === "insert" && ins) {
            const row = { id: "b", content: String(ins.content), install_id: null, source: "creator", created_at: "2026-10-10", creator_id: "c" }
            rows.unshift(row)
            return Promise.resolve({ data: row, error: null }).then(ok)
          }
          if (mode === "delete") {
            rows.splice(rows.findIndex((r) => r.id === "a"), 1)
            return Promise.resolve({ data: null, error: null }).then(ok)
          }
          return Promise.resolve({ data: [...rows], error: null }).then(ok)
        }
        return q
      },
    } as unknown as MemoryDb
    const out = await replaceMemory(db, "c", "a", "Prices in euros")
    check("correcting a memory keeps the new words and forgets the old", out.ok && out.memory.content === "Prices in euros" && rows.length === 1 && rows[0].content === "Prices in euros", rows)
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
