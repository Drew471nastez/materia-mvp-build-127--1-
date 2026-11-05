/**
 * ===========================================================================
 *  A NEW ACCOUNT'S WEBSITE, FROM THE FIRST VISIT TO A PRODUCT PAGE
 * ===========================================================================
 * Four reports, one suite:
 *
 *   1. A new account opened Website and found "Nothing is live" with nothing
 *      to open. The first visit now installs Storelib Default as a draft,
 *      once, never published, and the page puts it in the big card with
 *      Customize and Publish (lib/website-builder/starter-website.ts).
 *   2. The account pages: a single saved address drew a hairline half as
 *      wide as every other on the page.
 *   3. A download in the builder's preview did nothing: the canvas blocked
 *      every link. A file now opens in a tab of its own
 *      (lib/website-builder/canvas-intercept.ts fileLinkHref).
 *   4. The product page: a slug two shops share was a 404 on both, a
 *      variant's picture was a second copy of a gallery picture, the price
 *      read "$48" beside cards saying "$48.00" and ignored Show currency
 *      codes, and the share card did not carry the site's language.
 *
 *   npx tsx tests/new-user-site.test.ts
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { ensureStarterWebsite, needsStarter, starterKeeper, starterRows, STARTER_THEME_ID } from "@/lib/website-builder/starter-website"
import { STORELIB_DEFAULT_ID } from "@/lib/website-builder/theme-registry"
import { fileLinkHref, leavesThePage, type ClickTargetLike } from "@/lib/website-builder/canvas-intercept"
import { money, productImages, imageIndexForVariant } from "@/lib/products/product-page-model"
import { createRequire } from "node:module"
import { untt } from "./i18n-source"

/*
  `server-only` throws outside a bundler under tsx; the push runner already
  resolves it to nothing. The same here, so `npx tsx` runs this file too: the
  product read is imported after the stub (below, in main).
*/
{
  const req = createRequire(join(process.cwd(), "package.json"))
  try {
    const at = req.resolve("server-only")
    req.cache[at] = { id: at, filename: at, loaded: true, exports: {} } as never
  } catch {
    /* Not installed: nothing to stub. */
  }
}

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** A fake element tree: an anchor with attributes, and what it sits in. */
function anchor(attrs: Record<string, string>, inside: string[] = []): ClickTargetLike {
  const el: ClickTargetLike = {
    tagName: "A",
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    closest: (sel) => {
      if (/a\[href\]/.test(sel) && "href" in attrs) return el
      if (inside.some((s) => sel.includes(s))) return el
      return null
    },
  }
  return el
}

const CREATOR = "c0000000-0000-4000-8000-000000000001"

async function main() {
  // ── 1. The first website ───────────────────────────────────────────────
  section("1. A new account has a website to open")
  {
    const rows = starterRows(CREATOR)
    check("the starter is Storelib Default", !!rows && rows.install.theme_id === STORELIB_DEFAULT_ID && STARTER_THEME_ID === STORELIB_DEFAULT_ID)
    check("installed as a draft, never published", rows?.install.status === "draft")
    check("with a home page and a product page from the theme's preset",
      !!rows && rows.pages.map((p) => p.page_key).join() === "home,product" && rows.pages.every((p) => p.sections.length > 0) &&
        rows.pages[1].sections.some((s) => s.type === "product"))
    check("only an empty library gets one, and never on a count that could not be read",
      needsStarter(0) && !needsStarter(1) && !needsStarter(5) && !needsStarter(null) && !needsStarter(undefined))
    check("of two made at once, the older stays",
      starterKeeper([{ id: "b", created_at: "2026-10-05T10:00:01Z" }, { id: "a", created_at: "2026-10-05T10:00:02Z" }]) === "b")
    check("and in the same instant, the smaller id", starterKeeper([{ id: "b", created_at: "2026-10-05T10:00:00Z" }, { id: "a", created_at: "2026-10-05T10:00:00Z" }]) === "a")
    check("no rows, no keeper", starterKeeper([]) === null)

    const themes = [{ id: STORELIB_DEFAULT_ID, name: "Storelib Default" }]
    const db = fakeDb({ themes: [...themes], store_theme_installs: [], store_theme_settings: [], store_theme_pages: [] })
    const first = await ensureStarterWebsite(db as never, CREATOR)
    const installs = db.tables.store_theme_installs
    check("an empty library: one install, made", first.created && installs.length === 1 && installs[0].id === first.installId)
    check("  as a draft of Storelib Default, first in the library",
      installs[0].status === "draft" && installs[0].theme_id === STORELIB_DEFAULT_ID && installs[0].sort_order === 0 && installs[0].creator_id === CREATOR)
    check("  with its settings and its two pages",
      db.tables.store_theme_settings.length === 1 && db.tables.store_theme_pages.length === 2 &&
        db.tables.store_theme_pages.every((p) => p.install_id === first.installId))
    check("  and nothing published anywhere", !installs.some((i) => i.status === "published"))
    const again = await ensureStarterWebsite(db as never, CREATOR)
    check("a second visit adds nothing", !again.created && db.tables.store_theme_installs.length === 1 && db.tables.store_theme_pages.length === 2)

    const kept = fakeDb({ themes: [...themes], store_theme_installs: [{ id: "x", creator_id: CREATOR, theme_id: "other", status: "unpublished" }] })
    const none = await ensureStarterWebsite(kept as never, CREATOR)
    check("a library with anything in it is never touched", !none.created && kept.tables.store_theme_installs.length === 1)

    const broken = fakeDb({ themes: [...themes] }, { failWith: { store_theme_installs: { code: "42P01", message: "missing" } } })
    const quiet = await ensureStarterWebsite(broken as never, CREATOR)
    check("a library that cannot be read is not called empty", !quiet.created && quiet.installId === null)

    const half = fakeDb({ themes: [...themes], store_theme_installs: [] }, { failInsert: { store_theme_pages: { code: "23502", message: "no" } } })
    const failedWrite = await ensureStarterWebsite(half as never, CREATOR)
    check("pages that fail to write take the install with them", !failedWrite.created && half.tables.store_theme_installs.length === 0)

    const race = fakeDb({ themes: [...themes], store_theme_installs: [], store_theme_settings: [], store_theme_pages: [] })
    const [a, b] = await Promise.all([ensureStarterWebsite(race as never, CREATOR), ensureStarterWebsite(race as never, CREATOR)])
    check("two visits at once: one website, not two",
      race.tables.store_theme_installs.length === 1 && race.tables.store_theme_settings.length === 1 && race.tables.store_theme_pages.length === 2,
      `${race.tables.store_theme_installs.length} installs`)
    check("  and both answer with the same one", !!a.installId && a.installId === b.installId && [a.created, b.created].filter(Boolean).length === 1)

    const page = code("app/(storelib)/app/website-builder/page.tsx")
    check("the website page seeds through the starter, not the old function that published",
      /ensureStarterWebsite\(createAdminClient\(\), creator\.id\)/.test(page) && !/initialize_creator_themes/.test(page))
    check("  only for a library read that came back empty", /if \(rows && rows\.length === 0\)/.test(page))
    check("the initialize route uses it too", /ensureStarterWebsite\(admin, creator\.id\)/.test(code("app/api/website-builder/initialize/route.ts")) &&
      !/initialize_creator_themes/.test(code("app/api/website-builder/initialize/route.ts")))

    const client = code("app/(storelib)/app/website-builder/website-builder-client.tsx")
    check("with nothing live and nothing that was, the first draft takes the big card",
      /const starter = live \|\| offline \? null : \(installs\.find\(\(i\) => i\.status === "draft"\) \?\? null\)/.test(client) && /data-starter-card=""/.test(client))
    check("  and is not listed again in the library", /i\.status !== "published" && i\.id !== starter\?\.id/.test(client))
    check("  its card says Customize and opens the editor", />\s*Customize\s*</.test(client) && /onClick=\{\(\) => go\(editorHref\(username, starter\.id\)\)\}/.test(client))
    check("  and Publish asks first, through the same question as every Publish", /onClick=\{\(\) => setPublishing\(starter\)\}/.test(client) && /data-control="publish"/.test(client))
    check("an empty library offers the default theme in one press", /data-live-empty="first"/.test(client) && /addListing\(explore\[0\]\)/.test(client))
    /* Changed on purpose (round 42, team member hiding): Remove is also kept from a team member, so the guard reads `installs.length > 1 && !teamMember`. The only website is still never removable. */
    check("the only website cannot be removed, since an empty library gets it back", /else if \(installs\.length > 1(?: && !teamMember)?\) \{/.test(client))
    check("no banned words in the new copy", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(
      (client.match(/data-starter-card[\s\S]*?data-live-empty="first"[\s\S]*?<\/div>/) ?? [""])[0]))
  }

  // ── 2. The account pages ──────────────────────────────────────────────
  section("2. The account pages")
  {
    const acct = read("themes/default/sections/main_account.storelib")
    const generated = read("themes/default/sources.generated.ts")
    check("one saved address takes the whole row, so its hairline matches the others", /\.addr:only-child \{ grid-column: 1 \/ -1; \}/.test(acct))
    check("  and the shipped sources carry it", generated.includes(".addr:only-child { grid-column: 1 / -1; }"))
    check("orders still offer their action (Download, View order)", /order\.action_url/.test(acct) && /order\.action_label/.test(acct))
  }

  // ── 3. Downloads in the builder ───────────────────────────────────────
  section("3. A download in the preview opens the file")
  {
    check("a link with download on it is a file", fileLinkHref(anchor({ href: "https://x.test/guide", download: "" })) === "https://x.test/guide")
    check("an uploaded PDF behind a button is a file", fileLinkHref(anchor({ href: "https://storelib.com/media/theme-assets/u/guide.pdf?v=2" })) === "https://storelib.com/media/theme-assets/u/guide.pdf?v=2")
    check("a zip, an epub, a preset pack", ["a.zip", "b.EPUB", "c.lrtemplate"].every((f) => fileLinkHref(anchor({ href: `/files/${f}` })) !== null))
    check("an order's Download, the receipt page, is a file", fileLinkHref(anchor({ href: "https://storelib.com/receipt/tok-1" })) !== null)
    check("and so is the download route", fileLinkHref(anchor({ href: "/api/download/abc" })) !== null)
    check("a page of the site is not", fileLinkHref(anchor({ href: "/products/linen-apron" })) === null && fileLinkHref(anchor({ href: "/about" })) === null)
    check("an anchor, an email, a script are not", ["#faq", "mailto:a@b.c", "javascript:void(0)", "tel:123"].every((h) => fileLinkHref(anchor({ href: h })) === null))
    check("nothing pressed, nothing to open", fileLinkHref(null) === null)
    check("a file link is still a link the canvas stops from leaving", leavesThePage(anchor({ href: "/x.pdf" })))
    const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("the canvas opens it in a tab of its own, with the inspector off only",
      /const file = inspectorRef\.current \? null : fileLinkHref\(/.test(editor) && /window\.open\(new URL\(file, window\.location\.href\)\.href, "_blank", "noopener,noreferrer"\)/.test(editor))
    check("  after the rule that blocks every link has kept the builder where it is",
      editor.indexOf("if (leavesThePage(e.target") < editor.indexOf("fileLinkHref(e.target") && editor.indexOf("fileLinkHref(e.target") - editor.indexOf("if (leavesThePage(e.target") < 400)
  }

  // ── 4. The product page ───────────────────────────────────────────────
  section("4. The product page fetches everything")
  {
    const { productSectionData } = await import("@/lib/products/product-section-data")
    check("a price reads as the cards around it do", money(4800) === "$48.00" && money(4850) === "$48.50" && money(125000) === "$1,250.00")
    check("  with the code when the theme shows codes", money(4800, { code: true }) === "$48.00 USD")
    check("  and never a negative or a NaN", money(-5) === "$0.00" && money(Number.NaN) === "$0.00")
    const blocks = code("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("every price block prints through the section's money", !/(?<![.\w])money\(/.test(blocks) && (blocks.match(/ctx\.money\(/g) ?? []).length >= 4)
    check("which follows Show currency codes", /* Changed on purpose (round AC): the market (currency) rides beside the language. Then: in the store's own currency. */ /return shown \?\? money\(cents, \{ code: theme\.currency_code_enabled === true, currency: storefront\.currency \}\)/.test(code("components/website-builder/sections/renderers/ProductSection.tsx")))

    const render = code("components/website-builder/theme/render-product.tsx")
    check("the product read is held to the site's owner, so a slug two shops share is not a 404",
      /if \(creatorId\) query = query\.eq\("creator_id", creatorId\)/.test(render) && /fetchProductBySlug\(slug, owner\?\.creatorId\)/.test(render))
    check("  and no longer asks for exactly one row of a slug across Storelib", !/\.eq\("slug", slug\)[\s\S]{0,80}\.maybeSingle\(\)/.test(render))
    check("  a renamed slug is held to the owner too", /\(!creatorId \|\| p\.creator_id === creatorId\)/.test(render))
    const route = code("app/(site)/w/[username]/products/[slug]/page.tsx")
    check("the site's product route passes its owner to the metadata and the structured data",
      /creatorId: creator\.creatorId, locale: siteLocale\(settings\)/.test(route) && /seller: creator\.displayName, creatorId: creator\.creatorId/.test(route))
    check("the share card carries the site's language", /\.\.\.\(site\?\.locale \? \{ locale: site\.locale \} : \{\}\)/.test(render))

    const STORE = "https://abc.supabase.co/storage/v1/object/public/product-images/u/"
    const db = fakeDb({
      product_variants: [
        { id: "v1", product_id: "p1", name: "Sand", option1: "Sand", price_cents: 4800, image_url: `${STORE}sand.jpg`, active: true, position: 0 },
        { id: "v2", product_id: "p1", name: "Ink", option1: "Ink", price_cents: 5200, image_url: `${STORE}ink.jpg`, active: true, position: 1 },
      ],
    })
    const data = await productSectionData(db as never, {
      id: "p1", title: "Apron", slug: "apron", type: "digital", price_cents: 4800,
      description: "<p>Line one</p><ul><li>Two</li></ul>",
      thumbnail_url: "https://storelib.com/media/product-images/u/front.jpg",
      gallery_urls: ["https://storelib.com/media/product-images/u/front.jpg", "https://storelib.com/media/product-images/u/sand.jpg", `${STORE}back.jpg`],
    })
    const images = productImages(data)
    check("every picture once: the gallery and the variants', on Storelib's own address",
      images.length === 4 && images.every((u) => u.startsWith("https://storelib.com/media/")), images.join(" "))
    check("a variant's picture is found in the gallery, not added as a copy",
      data.variants?.[0].image_url === "https://storelib.com/media/product-images/u/sand.jpg" && imageIndexForVariant(images, data.variants?.[0]) === 1)
    check("the description arrives whole, as rich text", /<p>Line one<\/p>/.test(data.description_html ?? "") && /<li>Two<\/li>/.test(data.description_html ?? ""))
    check("both variants, with their own prices", data.variants?.map((v) => v.price_cents).join() === "4800,5200")
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
