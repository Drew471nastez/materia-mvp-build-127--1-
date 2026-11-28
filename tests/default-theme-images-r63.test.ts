/**
 * ===========================================================================
 *  ROUND 63 (j1): THE DEFAULT THEME, AND PRODUCT PICTURES THAT FILL THEIR FRAME
 * ===========================================================================
 *   1. The default is the current Storelib Default: the Materia template
 *      Browse themes shows (the Sundry sample shop), never the retired native
 *      registry theme. Pinned by its id, and run for real: a first visit and
 *      Start from blank import theme-packages/materia/templates/default
 *      through the real compose, conversion and storage code, against an
 *      in-memory database and storage.
 *   2. Product pictures fill their frame. Materia: a gallery picture in its
 *      fixed-shape frame drew at its own height (Storelib's weightless
 *      height:auto guard beat the theme's weightless cover rule), and product
 *      pictures stopped at 720 wide, soft at 2x. The native theme: with the
 *      default "picture's own shape", a row of pictures took the tallest's
 *      height and drew the others whole inside it, half the frame blank.
 *      scripts/check-product-images-r63.mjs measures the native theme in
 *      Chromium at 360, 390, 768 and 1280.
 *   3. A free product says Free in Materia, as the native theme does.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import {
  builtinListings,
  CODE_TEMPLATES,
  DEFAULT_CODE_TEMPLATE,
  DEFAULT_LISTING_SLUG,
  DEFAULT_TEMPLATE_LISTING_ID,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_PACKAGE,
  mergeListings,
  type ThemeListing,
} from "@/lib/themes/marketplace-shared"
import { ensureStarterWebsite, STARTER_NAME, STARTER_TEMPLATE } from "@/lib/website-builder/starter-website"
import { createStartWebsite } from "@/lib/website-builder/create-website"
import { homeChromeOnly, installCodeTemplate } from "@/lib/themes/template-install"
import { BROWSABLE_THEME_IDS, STORELIB_DEFAULT_ID } from "@/lib/website-builder/theme-registry"
import { chooseMateriaTemplate } from "@/lib/storelib-ai/materia/reference"
import { Ctx, renderString } from "@/lib/storelib-theme/compat/runtime"
import { compatFilter } from "@/lib/storelib-theme/compat/filters"
import { productObject } from "@/lib/storelib-theme/compat/objects"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** The in-memory database with an in-memory storage bucket, enough for the template import to store its pictures. */
function dbWithStorage(tables: Record<string, Record<string, unknown>[]>) {
  const db = fakeDb(tables as never) as ReturnType<typeof fakeDb> & { storage: unknown; uploads: string[] }
  db.uploads = []
  db.storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        db.uploads.push(`${bucket}/${path}`)
        return { data: { path }, error: null }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://store.test/${bucket}/${path}` } }),
    }),
  }
  return db
}
const CREATOR = "c0000000-0000-4000-8000-0000000000aa"
const USER = "u0000000-0000-4000-8000-0000000000aa"

async function main() {
  section("1. The default is the current Storelib Default, pinned by its id")
  {
    check("the default template is theme-packages/materia/templates/default", DEFAULT_CODE_TEMPLATE === "default" && DEFAULT_TEMPLATE_PACKAGE === "materia/default")
    check("  its listing id is template-materia-default, at the storelib-default address", DEFAULT_TEMPLATE_LISTING_ID === "template-materia-default" && DEFAULT_LISTING_SLUG === "storelib-default")
    check("  first in the code's list, named Storelib Default", CODE_TEMPLATES[0].template === DEFAULT_CODE_TEMPLATE && CODE_TEMPLATES[0].slug === DEFAULT_LISTING_SLUG && CODE_TEMPLATES[0].name === DEFAULT_TEMPLATE_NAME)
    const listing = builtinListings().find((l) => l.slug === DEFAULT_LISTING_SLUG)
    check("  Browse themes' Storelib Default is that template", listing?.id === DEFAULT_TEMPLATE_LISTING_ID && listing.codePackage === DEFAULT_TEMPLATE_PACKAGE && listing.builtinThemeId === null)
    check("  and it is the one with Sundry (its footer and about page)", /Sundry/.test(read("theme-packages/materia/templates/default/sections/footer-group.json")) && /Sundry/.test(read("theme-packages/materia/templates/default/templates/page.about.json")))
    const native = { ...listing!, id: "row-native", slug: "old-default", name: "Storelib Default", builtinThemeId: STORELIB_DEFAULT_ID, codePackage: null } as ThemeListing
    const shown = mergeListings([native])
    check("a listing row naming the native theme is retired: never offered", !shown.some((l) => l.builtinThemeId) && shown.filter((l) => l.name === "Storelib Default").length === 1 && shown.find((l) => l.name === "Storelib Default")?.id === DEFAULT_TEMPLATE_LISTING_ID)
    check("Add theme takes no native theme any more (the old default is not offered)", BROWSABLE_THEME_IDS.length === 0 && /BROWSABLE_THEME_IDS\.includes\(def\.id\)/.test(code("app/api/website-builder/themes/add/route.ts")))
    /* Changed on purpose (r69): the owner, "when entering the website builder, it should not use the old Storelib default": a first visit starts on Creator Landing. */
    check("a first visit never starts on it (Creator Landing, named My website)", STARTER_TEMPLATE === "creator" && (STARTER_TEMPLATE as string) !== DEFAULT_CODE_TEMPLATE && STARTER_NAME === "My website" && (STARTER_NAME as string) !== DEFAULT_TEMPLATE_NAME && !/getThemeDefinition|buildThemePreset|STORELIB_DEFAULT_ID/.test(code("lib/website-builder/starter-website.ts")))
    /* Changed on purpose (r69): the owner, "the AI should not use the old Storelib default": never its fallback. */
    check("the AI builder's fallback is never it", chooseMateriaTemplate({ prompt: "zzqx" }).template.template !== DEFAULT_CODE_TEMPLATE)
    /* Changed on purpose (r69): Start from blank is the starter template's frame. */
    check("Start from blank names the starter template, not it", /STARTER_CODE_TEMPLATE/.test(code("lib/website-builder/create-website.ts")) && !/DEFAULT_CODE_TEMPLATE/.test(code("lib/website-builder/create-website.ts")) && /userId: site\.ownerUserId \}/.test(code("app/api/website-builder/themes/create/route.ts")))
    check("the Website page and the initialize route pass the owner's id, for the pictures' folder",
      /ensureStarterWebsite\(createAdminClient\(\), creator\.id, \{ userId: access\.ownerUserId \}\)/.test(code("app/(storelib)/app/website-builder/website-page.tsx")) &&
        /ensureStarterWebsite\(admin, creator\.id, \{ userId: site\.ownerUserId \}\)/.test(code("app/api/website-builder/initialize/route.ts")))
    check("the Website page's function carries the theme's files, as the API routes do", /'\/app\/website-builder': \['\.\/theme-packages\/\*\*\/\*'\]/.test(read("next.config.mjs")))
    check("a public site with no website is the not published page, not a theme (unchanged)", /if \(found\.kind === "unpublished"\) return <SiteNotPublished/.test(read("app/(site)/w/[username]/render-site.tsx")))
  }

  /* Changed on purpose (r69): a first visit imports Creator Landing, measured the same way. */
  section("2. A first visit imports the starter (Creator Landing) for real")
  {
    const db = dbWithStorage({ themes: [{ id: STORELIB_DEFAULT_ID }], store_theme_installs: [], store_theme_settings: [], store_theme_pages: [], store_theme_custom_files: [] })
    const made = await ensureStarterWebsite(db as never, CREATOR, { userId: USER })
    const installs = db.tables.store_theme_installs
    check("one website, made", made.created && installs.length === 1 && installs[0].id === made.installId, { made, installs })
    check("  a draft named My website, an imported theme (not the native one's preset)", installs[0]?.status === "draft" && installs[0]?.name === "My website" && installs[0]?.is_custom === true, installs[0])
    const pages = db.tables.store_theme_pages.filter((p) => p.install_id === made.installId)
    const home = (pages.find((p) => p.page_key === "home")?.sections ?? []) as { type: string; group?: string }[]
    if (process.env.VERBOSE) console.log("  first visit home:", home.map((s) => s.type).join(", "))
    check("  its home page is Creator Landing's: the hello, the shelves, the letter, in its own frame", ["creator-hello", "creator-shelf", "creator-letter", "theme-header", "theme-footer"].every((t) => home.some((s) => s.type === t)) && !home.some((s) => ["hero-split-media", "products-carousel"].includes(s.type)), home.map((s) => s.type))
    check("  with a product page and a collection page", pages.some((p) => p.page_key === "product") && pages.some((p) => p.page_key === "collection"), pages.map((p) => p.page_key))
    check("  no native section anywhere", !pages.some((p) => ((p.sections ?? []) as { type: string }[]).some((s) => ["hero", "feature_grid", "product_list", "cta"].includes(s.type))))
    const files = db.tables.store_theme_custom_files.filter((f) => f.install_id === made.installId)
    check("  nothing of Sundry (Storelib Default's sample shop) in its files", files.length > 0 && !files.some((f) => /Sundry/.test(String(f.content))), files.length)
    check("  its pictures went to the owner's folder", db.uploads.length > 0 && db.uploads.every((u) => u.includes(`/${USER}/imported/`)), db.uploads.slice(0, 2))
    const again = await ensureStarterWebsite(db as never, CREATOR, { userId: USER })
    check("a second visit adds nothing", !again.created && db.tables.store_theme_installs.length === 1)
  }

  section("3. Start from blank imports it with an empty home page")
  {
    const db = dbWithStorage({ themes: [{ id: STORELIB_DEFAULT_ID }], store_theme_installs: [], store_theme_settings: [], store_theme_pages: [], store_theme_custom_files: [] })
    const made = await createStartWebsite({ supabase: db as never, admin: db as never }, { creatorId: CREATOR, mode: "blank", userId: USER }, { menus: (async () => null) as never, installTemplate: installCodeTemplate })
    const id = made.ok ? made.install.id : ""
    const home = (db.tables.store_theme_pages.find((p) => p.install_id === id && p.page_key === "home")?.sections ?? []) as { type: string; group?: string }[]
    check("a website named New website, from the starter template (Creator Landing)", made.ok && (made.install as { template?: string }).template === "creator" && db.tables.store_theme_installs.find((r) => r.id === id)?.name === "New website", made)
    check("  its home page is the template's frame only", home.length > 0 && home.every((s) => !!s.group) && home.some((s) => s.type === "theme-header") && home.some((s) => s.type === "theme-footer"), home.map((s) => s.type))
    check("  its other pages are the template's", db.tables.store_theme_pages.filter((p) => p.install_id === id && p.page_key === "product").length === 1)
    check("homeChromeOnly leaves every other page alone", JSON.stringify(homeChromeOnly([{ page_key: "home", sections: [{ group: "header" }, {}] }, { page_key: "product", sections: [{}] }])) === JSON.stringify([{ page_key: "home", sections: [{ group: "header" }] }, { page_key: "product", sections: [{}] }]))
  }

  section("4. Product pictures: sharp at twice the density")
  {
    const ri = read("theme-packages/materia/base/snippets/responsive-image.liquid")
    const productWidths = [...ri.matchAll(/if type == 'product'\s*(?:#[^\n]*\n\s*)?assign widths = '([^']+)'/g)].map((m) => m[1])
    check("every product picture is offered up to 1440 wide (a 582 wide gallery picture needs 1164 at 2x)", productWidths.length >= 4 && productWidths.every((w) => w.split(",").map(Number).includes(1440)), productWidths)
    const guard = read("theme-packages/materia/base/assets/layout-guard.css")
    check("a gallery picture in a frame of fixed shape fills it: the weightless height:auto guard no longer wins over the frame's cover rule",
      guard.indexOf(":where(img[width][height]) { height: auto; }") < guard.indexOf(":where([style*='--aspect-ratio'] > img:first-child, [style*='--aspect-ratio'] > img.secondary-image, [style*='--aspect-ratio'] > picture > img, [style*='--aspect-ratio'] motion-element img) { height: 100%; }") &&
        read("theme-packages/materia/base/assets/base.css").includes(":where([style*='--aspect-ratio'] > img:first-child, [style*='--aspect-ratio'] > img.secondary-image, [style*='--aspect-ratio'] > picture > img, [style*='--aspect-ratio'] motion-element img) { height: 100%; }"))
    check("  Materia's product cards still cover their frame", /\.product-item__media--ratio :is\(img, picture, video, motion-element\) \{\s*position: absolute;[\s\S]{0,80}object-fit: cover;/.test(read("theme-packages/materia/base/assets/base.css")))
  }

  section("5. The native gallery: a row of pictures of the picture's own shape has no blank half")
  {
    const media = read("components/website-builder/sections/renderers/product/product-media.tsx")
    check("one picture sets the row's height, the first (the left of each pair in the grid)", /const setsHeight = layout === "stacked_2col" \? pos % 2 === 0 : pos === 0/.test(media))
    /* Changed on purpose (r68): the others cover a frame of that height again (the owner: cover fit), as r63 drew them. */
    check("  the others cover a frame of that height, laid out absolutely", /const COVER = "absolute inset-0 h-full w-full object-cover"/.test(media) && /NATURAL_PHONE = sliderOnPhone \? COVER/.test(media))
    check("  a single column keeps every picture at its own shape", /stacked: \["@\[768px\]:static @\[768px\]:h-auto @\[768px\]:object-contain", "@\[768px\]:static @\[768px\]:h-auto @\[768px\]:object-contain"\]/.test(media))
    /* Changed on purpose (r68): a chosen ratio's frame is covered by its picture. */
    check("  a chosen ratio's frame is covered by its picture", /aspect \? "h-full object-cover" : naturalFit\(pos\)/.test(media))
    check("  nothing measured in script, so nothing moves after the first paint", !/naturalWidth|onLoad=/.test(media))
    check("scripts/check-product-images-r63.mjs measures it in Chromium at 360, 390, 768 and 1280", /for \(const width of \[360, 390, 768, 1280\]\)/.test(read("scripts/check-product-images-r63.mjs")))
  }

  section("6. A free product says Free in the current Storelib Default, as the old theme did")
  {
    const locale = (file: string) => JSON.parse(read(`theme-packages/materia/base/locales/${file}`).replace(/\/\*[\s\S]*?\*\//g, "")) as Record<string, unknown>
    const lookup = (words: Record<string, unknown>) => (key: string) => key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : null), words)
    const priceSrc = read("theme-packages/materia/base/snippets/price.liquid")
    const mapSrc = read("theme-packages/materia/base/snippets/variant-price-map.liquid")
    const env = { snippet: () => null, filter: compatFilter } as never
    const draw = (src: string, settings: Record<string, unknown>, opts: { scope?: string; words?: Record<string, unknown> } = {}) => {
      const product = productObject({ id: "p1", settings: { title: "Skinny to strong", slug: "skinny", kind: "digital", available: true, image: "https://img.test/a.png", ...settings } })
      const ctx = new Ctx({ settings: {} }, env, { scope: { product, scope: opts.scope ?? "item" }, registers: { compat: { moneyFormat: "£{{amount}}", translate: lookup(opts.words ?? locale("en.default.json")) } } })
      return renderString(src, ctx).replace(/\s+/g, " ")
    }
    const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const free = draw(priceSrc, { price: "£0.00" })
    check("a card: Free, not £0.00", /\bFree\b/.test(text(free)) && !/£0\.00/.test(free), text(free))
    check("  the product page too", /\bFree\b/.test(text(draw(priceSrc, { price: "£0.00" }, { scope: "detail" }))) && !/£0\.00/.test(draw(priceSrc, { price: "£0.00" }, { scope: "detail" })))
    check("  in the store's language", /Gratis|Kostenlos/i.test(text(draw(priceSrc, { price: "£0.00" }, { words: locale("de.json") }))), text(draw(priceSrc, { price: "£0.00" }, { words: locale("de.json") })))
    check("a paid product keeps its price", /£8\.99/.test(draw(priceSrc, { price: "£8.99" })) && !/\bFree\b/.test(text(draw(priceSrc, { price: "£8.99" }))))
    const pwyw = draw(priceSrc, { price: "£0.00", pay_what_you_want: true })
    check("pay what you want keeps its amount", /£0\.00/.test(pwyw) && !/\bFree\b/.test(text(pwyw)), text(pwyw))
    const sale = draw(priceSrc, { price: "£0.00", compare_price: "£10.00" })
    check("a free product on sale: Free, and the compare at price struck through, as before", /price--special/.test(sale) && /<s class="price-item compare-price[^"]*">\s*£10\.00/.test(sale) && /\bFree\b/.test(text(sale)), text(sale))
    const map = draw(mapSrc, { price: "£0.00" })
    check("the variant picker's prices say Free too", /"price": "Free"/.test(map), map)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
