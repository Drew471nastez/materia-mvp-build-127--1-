/**
 * The twelve templates that ship with Storelib's code (templates rounds 16
 * to 18): one theme's files once (theme-packages/materia/base) and a small
 * overlay per template. What must stay true:
 *
 *   listed     builtinListings() answers the twelve, the default first, and
 *              the native Storelib Default is not among them
 *   composes   base + overlay is a zip the marketplace's own rules accept,
 *              within the import's limits
 *   imports    the converter Add uses takes it with nothing skipped, no
 *              section left off and no picture missing
 *   draws      home, product, collection, about, contact, FAQ and every
 *              other page a template has (a lookbook, a licence, tour dates)
 *              come out as pages, with a shop's products and with none
 *   links      every link a template's pages and menus carry opens a page
 *   its own    only sections the theme has, only pictures the template
 *              carries, each credited (a photograph with its source, or a
 *              drawing made for the template); nothing of the theme's old
 *              starter content; every template a different page
 *   no vendor  the word "Shopify" is nowhere a creator reads: schema labels,
 *              locale strings, settings, template copy, the drawn page
 *   private    the theme's files are not under public/, and the build
 *              carries them with the route that reads them
 *
 * No database and no browser: the files, the converter and the engine.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE, DEFAULT_LISTING_SLUG, THEME_CATEGORIES, builtinListings, installedListingSlugs, mergeListings } from "../lib/themes/marketplace-shared"
import { composeTemplateFiles, composeTemplateZip, isCodePackageId, mergeSettingsData, templateDirs, templateMenus } from "../lib/themes/template-packages"
import { checkThemeZipEntries, checkThemeZipSize } from "../lib/themes/zip-rules"
import { convertShopifyTheme, type ConversionReport, type ImportedTheme } from "../lib/storelib-theme/shopify/convert"
import { ASSET_MAP_PATH, compatOf } from "../lib/storelib-theme/compat/install"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { cleanMenus } from "../lib/storelib-theme/values"
import { LIMITS } from "../lib/storelib-theme/types"
import { SAMPLE_SHOPS } from "../scripts/theme-templates/shops"
import { STORELIB_DEFAULT_ID } from "../lib/website-builder/theme-registry"
// @ts-expect-error a plain ES module script, without types
import { buildBaseCss } from "../scripts/build-materia-base-css.mjs"

/* Changed on purpose (templates round 22): a template file may open with a comment, as the theme's own generated files do (the import reads past it). */
const parseJson = (text: string) => JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\//, ""))

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 700)}` : ""}`) }
}

const ROOT = join(process.cwd(), "theme-packages", CODE_THEME_PACKAGE)
const BASE = join(ROOT, "base")
const read = (p: string) => readFileSync(p, "utf8")
const walk = (dir: string, prefix = ""): string[] =>
  existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), `${prefix}${n}/`) : [`${prefix}${n}`])) : []

/** Engine identifiers a theme's code keeps: objects, events, class names, ids, internal values. Not words anybody reads. */
const IDENTIFIERS = /shopify:\/\/[^\s"'<]*|#?shopify-section[\w-]*|shopify-(?:design-mode|payment-button[\w-]*|model-viewer[\w-]*|challenge[\w-]*|product-reviews[\w-]*)|data-shopify[\w-]*|shopify:(?:section|block):\w+|shopify_attributes|(?:window\.)?Shopify(?=[.?)]|\s*(?:&&|\|\||=|;))|[A-Za-z]+Shopify\b|\w*_shopify\w*|shopify_\w+|\bshopify\/[\w./-]+/g
const vendorIn = (text: string) => /shopify/i.test(text.replace(IDENTIFIERS, ""))

function strings(node: unknown, key = "", out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") out.push([key, node])
  else if (Array.isArray(node)) for (const v of node) strings(v, key, out)
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) strings(v, k, out)
  return out
}
const schemaOf = (liquid: string): unknown => {
  const m = liquid.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/)
  return m ? JSON.parse(m[1]) : null
}
/** What a page shows: its markup with scripts, styles, comments and tags taken out. */
const visibleText = (html: string) => html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

const OLD_STARTER = /Prime ?Clarity|Prime1|focus your day|Fuel your focus|LUNEA|L-Citrulline|Beta Alanine|FDA Approved|materiathemes|storelib-[0-9a-f]{8}-/i

/** The pages every template has, and the ones the theme's own files draw: what is left is a template's own (page.<handle>.json). */
const THEME_PAGES = new Set(["home", "product", "collection", "about", "contact", "faqs", "cart", "search", "404", "collections", "list-collections", "blog", "article", "password", "page", "wishlist"])

interface Imported { theme: ImportedTheme; report: ConversionReport; files: Record<string, string> }

async function importOf(id: string): Promise<Imported | null> {
  const zip = await JSZip.loadAsync(await composeTemplateZip(id))
  const r = await convertShopifyTheme(zip, { fallbackName: id })
  if (r.ok === false) return null
  const addresses = Object.fromEntries(r.theme.binaries.map((b) => [b.name, `/media/${b.name}`]))
  return { theme: r.theme, report: r.report, files: { ...r.theme.files, [ASSET_MAP_PATH]: JSON.stringify(addresses) } }
}

function siteOf(id: string, imported: Imported, withProducts: boolean): SiteData {
  const media = JSON.parse(imported.files[ASSET_MAP_PATH]) as Record<string, string>
  const theme = themeOfInstall(imported.files, imported.theme.settings, {
    assetUrl: (n) => media[n] ?? `/asset/${n}`,
    assetText: (n) => imported.files[`shopify/assets/${n}`] ?? null,
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : media[v.match(/^shopify:\/\/shop_images\/([^?#]+)/)?.[1] ?? ""] ?? ""),
  })
  const pages = Object.fromEntries(imported.theme.pages.map((p) => [p.page_key, p.sections])) as unknown as SiteData["pages"]
  const products = withProducts
    ? ["First product", "Second product"].map((title, i) => {
        const slug = title.toLowerCase().replace(/\W+/g, "-")
        return { id: `00000000-0000-4000-8000-00000000000${i + 1}`, settings: { title, slug, url: `/products/${slug}`, price: `$${20 + i}.00`, compare_price: "", currency: "USD", free: false, image: "", images: [], kind: "physical", available: true, tag: "", checkout_url: "", description: "", variants: [], options: [] } }
      })
    : []
  /* Changed on purpose (templates round 24): a template whose menus open collections of its own (Strata's Outerwear, Accessories ...) is asked with those collections made, as its sample shop has them (scripts/theme-templates/shops.ts); every other template still has none. */
  const own = withProducts ? (SAMPLE_SHOPS[id.split("/").pop() ?? ""]?.collections ?? []).map((c) => ({ id: c.handle, title: c.title, handle: c.handle, description: c.description, image: "", url: `/collections/${c.handle}`, products, products_count: products.length })) : []
  return {
    creatorId: "c", theme, pages, products: products as never, collections: own as never,
    menus: compatMenus(templateMenus(id) as never, Object.keys(pages)),
    shop: { name: "Sample store", currency: "USD", moneyFormat: "${{amount}}" }, host: "example.test",
  }
}

async function main() {
  /* ── Listed ─────────────────────────────────────────────────────────── */
  console.log("\nListed from code\n")
  const listings = builtinListings()
  /* Changed on purpose (templates round 18): Skincare was removed and Creator Landing was added, twelve are listed. */
  /* Changed on purpose (templates round 19): Art books added after Digital products; with Night shop and Poster shop at the end, fifteen are listed. */
  /* Changed on purpose (templates round 20): Tour merch was removed, fourteen are listed. */
  /* Changed on purpose (templates round 20): Coach and Video sales letter were added at the end, sixteen are listed. */
  /* Changed on purpose (templates round 20): Online course and Course landing were added at the end, eighteen are listed. */
  /* Changed on purpose (templates round 20): Retro desktop was added at the end, nineteen are listed. */
  /* Changed on purpose (templates round 21): Author and Content creator were added at the end, with Coach creator, Digital Renaissance and XP shop after them; twenty four are listed. */
  /* Changed on purpose (templates round 22): Caps and tees and Print on demand were added at the end; twenty six are listed. */
  check("twenty six templates are listed, with no table and nothing uploaded", listings.length === 26 + 5 + 1 /* Changed on purpose (round 25): Notion creator added. */ + 1 /* Changed on purpose (round 25): Sound packs added. */ && CODE_TEMPLATES.length === 26 + 5 + 1 /* Changed on purpose (round 25): Notion creator added. */ + 1 /* Changed on purpose (round 25): Sound packs added. */ /* Changed on purpose (round 25): Personal trainer added. */ /* Changed on purpose (templates round 23): VSL funnel added. Changed on purpose (templates round 23): Outerwear label added. Changed on purpose (templates round 23): Notion sales page added. Changed on purpose (templates round 24): Boutique rail added. */, listings.map((l) => l.slug))
  check("Storelib Default is first, at the default address", listings[0]?.slug === DEFAULT_LISTING_SLUG && listings[0]?.name === "Storelib Default" && mergeListings([])[0]?.slug === DEFAULT_LISTING_SLUG)
  /* Changed on purpose (templates round 18): Landing page is now called Course (same slug, landing-page). */
  /* Changed on purpose (templates round 19): Art books sits right after Digital products. */
  /* Changed on purpose (templates round 22): Ebooks is now a cookbook shop called Cookbook (same slug, ebooks). */
  check("then Clothing, Merch, Digital products, Art books, Cookbook, Fitness and Course", listings.slice(0, 8).map((l) => l.name).join("|") === "Storelib Default|Clothing|Merch|Digital products|Art books|Cookbook|Fitness|Course")
  /* Changed on purpose (templates round 18): Skincare was removed and Templates shop is now called Notion templates. */
  /* Changed on purpose (templates round 18): Streetwear drop is now the Lifestyle label template (same slug). */
  /* Changed on purpose (templates round 18): Creator Landing sits right after Landing page. */
  check("then Creator Landing, right after Landing page", listings[8]?.slug === "creator-landing" && listings[8]?.name === "Creator Landing") /* Changed on purpose (templates round 19): one place later, after Art books. */
  /* Changed on purpose (templates round 20): Tour merch was removed, three narrower ones remain. */
  check("then the three narrower ones: Lifestyle label, Sample packs and Notion templates", listings.slice(9, 12).map((l) => l.name).join("|") === "Lifestyle label|Sample packs|Notion templates") /* Changed on purpose (templates round 19): one place later, after Art books; round 19 templates follow them. */
  check("no two share an address or an overlay folder", new Set(listings.map((l) => l.slug)).size === listings.length && new Set(CODE_TEMPLATES.map((t) => t.template)).size === CODE_TEMPLATES.length)
  check("the native Storelib Default is not offered: no listing names a registry theme", listings.every((l) => l.builtinThemeId === null) && !mergeListings([]).some((l) => l.builtinThemeId === STORELIB_DEFAULT_ID))
  check("each is free, by Storelib, and adds a package the code ships", listings.every((l) => l.tier === "free" && l.author === "Storelib" && l.hasPackage && l.packageKind === null && isCodePackageId(l.codePackage)))
  check("each is filed under a category the filter has", listings.every((l) => THEME_CATEGORIES.some((c) => c.key === l.category)), listings.map((l) => l.category))
  /* Two clothing stores and two merch stores now: a category may hold two templates, never three, and the filter has more than a handful of rows. */
  const perCategory = listings.reduce<Record<string, number>>((n, l) => ({ ...n, [l.category]: (n[l.category] ?? 0) + 1 }), {})
  /* Changed on purpose (templates round 19): Night shop is a third fashion store, so a category may hold three. */
  /* Changed on purpose (templates round 20): Online course and Course landing join Course, Creator Landing and Video sales letter, so courses holds five; every other category still holds at most three. */
  check("  no category holds more than three (courses seven, creators four), and both kinds of product are covered", Object.entries(perCategory).every(([c, n]) => n <= (c === "courses" ? 7 /* Changed on purpose (templates round 23): VSL funnel, a light video sales letter, makes seven courses. */ : c === "creators" ? 4 : c === "fashion" ? 7 : c === "digital" ? 4 /* Changed on purpose (round 25): Notion creator makes a third digital template (and a fourth with Sound packs). */ : 3) /* Changed on purpose (templates round 23): Outerwear label makes six fashion templates. */ /* Changed on purpose (templates round 24): Boutique rail makes seven fashion templates. */) /* Changed on purpose (templates round 22): Caps and tees and Print on demand make five fashion templates. */ /* Changed on purpose (templates round 21): Digital Renaissance makes six courses, Content creator and XP shop make four creator templates; every other category still holds at most three. */ && Object.keys(perCategory).length >= 9 && ["fashion", "creators", "music", "design", "digital"].every((c) => perCategory[c]), perCategory) /* Changed on purpose (templates round 18): no "beauty" since Skincare was removed. */
  check("each has its cover and its phone screenshot in public/themes", listings.every((l) => !!l.cover && existsSync(join("public", l.cover)) && l.screenshots.length === 2 && l.screenshots.every((s) => existsSync(join("public", s)))), listings.filter((l) => !l.cover || !existsSync(join("public", l.cover))).map((l) => l.cover))
  check("no listing name says where the theme came from", listings.every((l) => !/shopify|materia/i.test(`${l.name} ${l.author} ${l.slug}`)))
  check("a website remembers the listing it was added from, in its settings", [...installedListingSlugs([{ settings: { compat: { kind: "shopify", listing: "clothing" } } }, { settings: { marketplace_listing: "merch" } }, { settings: { compat: { listing: "Not A Slug" } } }, { settings: null }])].join() === "clothing,merch" && compatOf({ compat: { kind: "shopify", version: 1, theme: "x", listing: "fitness" } })?.listing === "fitness")

  /* ── The base ───────────────────────────────────────────────────────── */
  console.log("\nThe theme's files, once\n")
  const baseFiles = walk(BASE)
  const sectionTypes = new Set(baseFiles.filter((f) => /^sections\/[^/]+\.liquid$/.test(f)).map((f) => f.slice(9, -7)))
  check("the base is the theme: its layout, sections, blocks, snippets, assets and locales", existsSync(join(BASE, "layout/theme.liquid")) && sectionTypes.size > 200 && baseFiles.some((f) => f.startsWith("blocks/")) && baseFiles.some((f) => f.startsWith("snippets/")) && baseFiles.some((f) => f.startsWith("locales/")))
  check("it carries no home, product or collection page and no header or footer content of its own", !["templates/index.json", "templates/product.json", "templates/collection.json", "sections/header-group.json", "sections/footer-group.json"].some((f) => baseFiles.includes(f)))
  check("none of the old starter pictures, and no licence gate", !baseFiles.some((f) => /^assets\/storelib-/.test(f) || /materia-guard/.test(f)))
  const baseText = baseFiles.filter((f) => /\.(liquid|json|js|css|svg)$/.test(f)).map((f) => [f, read(join(BASE, f))] as const)
  check("nothing of the old starter content is left in it", !baseText.some(([, t]) => OLD_STARTER.test(t)), baseText.filter(([, t]) => OLD_STARTER.test(t)).map(([f]) => f).slice(0, 8))
  check("no address at the old platform anywhere in it", !baseText.some(([, t]) => /shopify\.com|shopifycdn|myshopify/i.test(t)), baseText.filter(([, t]) => /shopify\.com|shopifycdn|myshopify/i.test(t)).map(([f]) => f).slice(0, 8))
  /* Round 26 (Materia 1.3.2): the live store links one combined stylesheet, built from the sources the builder links one by one; a source edited without rebuilding it would differ between the two. */
  check("assets/base.css is built from its sources (node scripts/build-materia-base-css.mjs)", read(join(BASE, "assets/base.css")) === buildBaseCss(join(BASE, "assets")))

  console.log("\nNever the word Shopify where a creator reads\n")
  const said: string[] = []
  for (const [f, t] of baseText) {
    if (/^(sections|blocks)\/.*\.liquid$/.test(f)) {
      for (const [k, v] of strings(schemaOf(t))) if (!["id", "type", "visible_if", "value"].includes(k) && vendorIn(v)) said.push(`${f} schema ${k}: ${v.slice(0, 60)}`)
    } else if (/^locales\/.*\.json$/.test(f) || /^config\/.*\.json$/.test(f) || /^templates\/.*\.json$/.test(f) || /^sections\/.*\.json$/.test(f)) {
      const json = JSON.parse(t.replace(/^\s*\/\*[\s\S]*?\*\//, "")) as unknown
      for (const [k, v] of strings(json)) if (k !== "value" && vendorIn(v)) said.push(`${f} ${k}: ${v.slice(0, 60)}`)
    }
    if (/\.liquid$/.test(f)) {
      /* The words a section prints: its markup with Liquid, scripts, styles and comments taken out. */
      const body = t.replace(/\{%-?\s*schema[\s\S]*?endschema\s*-?%\}/g, "").replace(/\{%-?\s*(comment|javascript|stylesheet|style)\b[\s\S]*?\{%-?\s*end\1\s*-?%\}/g, " ").replace(/\{%-?[\s\S]*?-?%\}|\{\{[\s\S]*?\}\}/g, " ")
      if (/shopify/i.test(visibleText(body).replace(IDENTIFIERS, ""))) said.push(`${f} markup`)
    }
    /* Prose in any file, comments included: the capitalised name as a word of its own. */
    const prose = t.replace(IDENTIFIERS, "").match(/.{0,30}\bShopify\b.{0,30}/)
    if (prose) said.push(`${f} prose: ${prose[0]}`)
  }
  check("schema names, labels and help, locale strings, settings and section markup never say it", said.length === 0, said.slice(0, 10))
  check("  the check itself reads a label that does", vendorIn("Powered by Shopify") && vendorIn("Open Shopify admin") && !vendorIn("shopify://collections/all") && !vendorIn("#shopify-section-header") && !vendorIn("window.Shopify.designMode"))

  /* ── Each template ──────────────────────────────────────────────────── */
  const homes: Record<string, string> = {}
  const looks: Record<string, string> = {}
  const credits = read(join(ROOT, "templates", "CREDITS.md"))
  for (const t of CODE_TEMPLATES) {
    const id = `${CODE_THEME_PACKAGE}/${t.template}`
    console.log(`\n${t.name}\n`)
    const { overlay } = templateDirs(id)
    const own = walk(overlay)
    const composed = composeTemplateFiles(id)
    check("composes: the base with its overlay over it", composed.size >= baseFiles.length && composed.has("templates/index.json") && composed.has("layout/theme.liquid") && !composed.has("menus.json"))
    check("  its overlay is small: pages, groups, settings and pictures only", own.every((f) => /^(templates\/[\w.-]+\.json|sections\/(header|footer|overlay)-group\.json|config\/settings_data\.json|assets\/[\w-]+\.webp|menus\.json)$/.test(f) || (t.template === "samples" && /^assets\/samples-demo-[\w-]+\.mp4$/.test(f)) || (t.template === "soundpacks" && /^assets\/soundpacks-(demo|shot)-[\w-]+\.mp4$/.test(f)) /* Changed on purpose (round 25): Sound packs carries the short demo loops and one shots its players play, synthesised for it, as audio-only .mp4. */) /* Changed on purpose (templates round 19): Sample packs carries short demo loops for its audio players, as audio-only .mp4 (the converter keeps mp4, not mp3). Changed on purpose (templates round 21): eight CC0 house loops from freesound.org now, credited in CREDITS.md. */ && own.reduce((n, f) => n + statSync(join(overlay, f)).size, 0) < 1.5 * 1024 * 1024, own.filter((f) => !/^(templates|sections|config|assets)\/|^menus\.json$/.test(f)))
    const zipBytes = await composeTemplateZip(id)
    const zip = await JSZip.loadAsync(zipBytes)
    const rules = checkThemeZipEntries(Object.values(zip.files).map((f) => ({ name: f.name, dir: f.dir, unixPermissions: typeof f.unixPermissions === "number" ? f.unixPermissions : null })))
    check("  the zip passes the marketplace's own rules and the import's size limit", rules.ok === true && checkThemeZipSize(zipBytes.byteLength) === null && zipBytes.byteLength < LIMITS.packageBytes, { rules, bytes: zipBytes.byteLength })
    check("  within the limits: files in a package, bytes in a source file", composed.size <= LIMITS.filesPerPackage && [...composed].every(([f, b]) => !/\.(liquid|json|css|js)$/.test(f) || b.byteLength <= LIMITS.sourceBytes), { files: composed.size })

    const imported = await importOf(id)
    check("imports with the converter Add uses", imported !== null)
    if (!imported) continue
    const { report, theme } = imported
    check("  nothing skipped", report.skipped.length === 0, report.skipped.slice(0, 5))
    const bad = report.notes.filter((n) => /names sections the theme does not have|picture from the old store|could not be read|not a JSON template/i.test(n.message))
    check("  no section left off, no picture missing", bad.length === 0, bad.slice(0, 5))
    const keys = theme.pages.map((p) => p.page_key)
    check("  home, product, collection, about, contact and FAQ pages", ["home", "product", "collection", "about", "contact", "faqs"].every((k) => keys.includes(k)), keys)
    check("  the install is marked as the compatible profile, named by the theme and not by a platform", compatOf(theme.settings)?.kind === "shopify" && !/shopify/i.test(theme.name))

    /* Its own content. */
    const pageFiles = own.filter((f) => /^(templates|sections)\/.*\.json$/.test(f))
    const used = new Set<string>()
    const pictures = new Set<string>()
    const copy: string[] = []
    for (const f of pageFiles) {
      const json = parseJson(read(join(overlay, f))) as { sections?: Record<string, { type?: string }> }
      for (const s of Object.values(json.sections ?? {})) if (s.type) used.add(s.type)
      for (const [k, v] of strings(json)) {
        const m = v.match(/^shopify:\/\/shop_images\/(.+)$/)
        if (m) pictures.add(m[1])
        else if (!["type", "color_scheme", "menu", "mega_menu"].includes(k)) copy.push(v)
      }
    }
    check("  uses only sections the theme has", [...used].every((s) => sectionTypes.has(s)), [...used].filter((s) => !sectionTypes.has(s)))
    /* Changed on purpose (templates round 19): a picture the theme settings name (Night shop's logo) is used too. */
    if (own.includes("config/settings_data.json")) for (const [, v] of strings(parseJson(read(join(overlay, "config/settings_data.json"))))) { const m = v.match(/^shopify:\/\/shop_images\/(.+)$/); if (m) pictures.add(m[1]) }
    const assets = own.filter((f) => f.startsWith("assets/")).map((f) => f.slice(7))
    check("  names only pictures it carries, and carries none it does not use", [...pictures].every((p) => assets.includes(p)) && assets.every((a) => pictures.has(a)), { missing: [...pictures].filter((p) => !assets.includes(p)), unused: assets.filter((a) => !pictures.has(a)) })
    check("  every picture is credited: a photograph with its source and licence, or a drawing made for the template", assets.every((a) => new RegExp(`\\| ${t.template} \\| assets/${a} \\| (https://images\\.unsplash\\.com/photo-[\\w-]+ \\| Unsplash License|Drawn for this template \\| Storelib${t.template === "soundpacks" ? "|Synthesised for this template[^|]* \\| Storelib" /* Changed on purpose (round 25): Sound packs' previews are synthesised for it. */ : ""}${t.template === "samples" ? "|Loudlib's own (pack box|logo)[^|]* \\| Loudlib \\(the owner\\)|Synthesised for this template[^|]* \\| Storelib|https://freesound\\.org/people/[^|]+/sounds/\\d+/[^|]* \\| CC0 1\\.0 \\(public domain\\)" : ""}) \\|`).test(credits)) /* Changed on purpose (templates round 19): Sample packs uses Loudlib's own pack art, the owner's store, and demo loops synthesised for it. */ /* Changed on purpose (templates round 20): and Loudlib's own logo. */ /* Changed on purpose (templates round 21): and CC0 loops from freesound.org, each with its address. */, assets.filter((a) => !credits.includes(`assets/${a}`)))
    const all = copy.join("\n")
    check("  none of the theme's old starter content", !OLD_STARTER.test(all) && !OLD_STARTER.test(read(join(overlay, "config/settings_data.json"))))
    check("  its copy never says Shopify, has no placeholder Latin and no dash standing in for a comma", !vendorIn(all) && !/lorem ipsum/i.test(all) && !/[—–]/.test(all), all.match(/.{0,30}(shopify|lorem ipsum|[—–]).{0,30}/i)?.[0])
    check("  and none of the words Storelib does not write", !/\b(unlock|elevate|seamless|seamlessly|powerful|effortless|effortlessly|supercharge|transform)\b/i.test(all), all.match(/.{0,30}\b(unlock|elevate|seamless|powerful|effortless\w*|supercharge|transform)\b.{0,30}/i)?.[0])
    const menus = cleanMenus(templateMenus(id))
    check("  its navigation for a store with none yet reads as menus", (menus["main-menu"]?.links.length ?? 0) >= 2 && (menus.footer?.links.length ?? 0) >= 1)

    /* Drawn. */
    for (const withProducts of [true, false]) {
      const site = siteOf(id, imported, withProducts)
      /* A template's further pages (a lookbook, a licence, tour dates) are pages of the website like the six every template has. */
      const further = keys.filter((k) => !THEME_PAGES.has(k)).map((k) => `/pages/${k}`)
      const paths = withProducts ? ["/", "/products/first-product", "/collections/all", "/pages/about", "/pages/contact", "/pages/faqs", ...further] : ["/", "/collections/all", ...further]
      const drawn: { path: string; status: number; length: number; sections: number; vendor: boolean; old: boolean; stray: boolean }[] = []
      for (const path of paths) {
        const out = await answer(site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })
        const html = typeof out.body === "string" ? out.body : ""
        const text = visibleText(html)
        drawn.push({ path, status: out.status, length: html.length, sections: (html.match(/id="shopify-section-/g) ?? []).length, vendor: /shopify/i.test(text), old: OLD_STARTER.test(text), stray: /\{\{|\{%|Liquid error/.test(text) })
        if (path === "/" && withProducts) homes[t.template] = [...html.matchAll(/id="shopify-section-[^"]*?__?([a-z0-9_]+?)_\d+"/g)].map((m) => m[1]).join(",") || [...used].join(",")
      }
      check(`  draws ${withProducts ? `home, product, collection, about, contact and FAQ${further.length ? ` and ${further.map((f) => f.slice(7)).join(", ")}` : ""} with a shop's products` : "home and collection for a store with no products yet"}`, drawn.every((d) => d.status === 200 && d.length > 20000 && d.sections >= 3), drawn.filter((d) => !(d.status === 200 && d.length > 20000 && d.sections >= 3)))
      check("    and no page shows Shopify, old starter content or unrendered template code", drawn.every((d) => !d.vendor && !d.old && !d.stray), drawn.filter((d) => d.vendor || d.old || d.stray))
    }
    /* Every link the template's pages, groups and menus carry is a page of the website. */
    const links = new Set<string>()
    for (const f of pageFiles) for (const [, v] of strings(parseJson(read(join(overlay, f))))) {
      if (/^\/[\w/-]*$/.test(v)) links.add(v)
      for (const m of v.matchAll(/href="(\/[^"#?]*)"/g)) links.add(m[1])
    }
    for (const menu of Object.values(menus)) for (const l of menu.links) if (l.url.startsWith("/")) links.add(l.url)
    const linked = siteOf(id, imported, true)
    const dead: string[] = []
    for (const path of links) {
      /* Changed on purpose (templates round 19): a menu link with a search in it (/search?q=prints) is asked as the address and its query, as a browser asks it. */
      /* Changed on purpose (templates round 20): a menu link to a place on a page (/#curriculum) is asked without its #, as a browser asks it. */
      const [bare, search = ""] = path.split("#")[0].split("?")
      const out = await answer(linked, { method: "GET", path: bare, query: new URLSearchParams(search), body: null, cart: [] })
      if (out.status !== 200) dead.push(`${path} ${out.status}`)
    }
    check(`  every link it carries opens a page (${links.size})`, links.size >= 4 && dead.length === 0, dead)
    const home = parseJson(read(join(overlay, "templates/index.json"))) as { sections: Record<string, { type: string }>; order: string[] }
    homes[t.template] = home.order.map((k) => home.sections[k].type).join(",")
    const current = (parseJson(read(join(overlay, "config/settings_data.json"))) as { current: Record<string, unknown> }).current
    const scheme = ((current.color_schemes as Record<string, { settings: Record<string, string> }>).default ?? { settings: {} }).settings
    looks[t.template] = [current.font_heading_google_family, current.font_body_google_family, scheme.background, scheme.btn_primary_background].join("|")
  }

  console.log("\nEleven different websites\n")
  const order = Object.values(homes)
  check("no two home pages are the same sections in the same order", new Set(order).size === CODE_TEMPLATES.length, homes)
  check("no two open with the same first two sections", new Set(order.map((o) => o.split(",").slice(0, 2).join(","))).size === CODE_TEMPLATES.length, order.map((o) => o.split(",").slice(0, 2).join(",")))
  check("no two share a typeface pairing and palette", new Set(Object.values(looks)).size === CODE_TEMPLATES.length, looks)
  /* The second clothing, merch and digital templates are not the first ones again: no section in the same place for the first two, another typeface and another ground. */
  const apart = (a: string, b: string) => homes[a].split(",").slice(0, 2).every((s, i) => s !== homes[b].split(",")[i]) && looks[a].split("|").every((v, i) => v !== looks[b].split("|")[i])
  check("the second template of a kind opens differently from the first, in another typeface and colour", apart("streetwear", "clothing") /* Changed on purpose (templates round 20): Tour merch was removed, so there is no second merch template. */ && apart("samples", "digital") && apart("workspace", "digital") && apart("workspace", "landing"), { homes, looks }) /* Changed on purpose (templates round 18): Skincare was removed. */
  /* Changed on purpose (templates round 18): Skincare was removed, four narrower templates remain. */
  /* Changed on purpose (templates round 20): Tour merch was removed, three narrower templates remain. */
  check("the three narrower templates each use sections none of the first seven's home pages do", ["streetwear", "samples", "workspace"].every((n) => homes[n].split(",").filter((s) => !["default", "clothing", "merch", "digital", "ebooks", "fitness", "landing"].some((o) => homes[o].split(",").includes(s))).length >= 4), homes)
  /* Changed on purpose (templates round 18): the landing template is now a course school, a flagship course over a grid of smaller ones, with a few links, one button and no cart, account or search in its header. */
  check("the course template opens on its flagship course over a grid of the others, and its header has one button and no cart, account or search", homes.landing.split(",").length >= 8 && homes.landing.startsWith("hero-product3,") && homes.landing.includes("products-listing") && ((h) => /"show_shopping_cart": false/.test(h) && /"show_account_icon": false/.test(h) && /"show_search": false/.test(h) && /"type": "header_button"/.test(h))(read(join(ROOT, "templates/landing/sections/header-group.json"))))

  /* ── Kept private, and carried by the build ─────────────────────────── */
  console.log("\nNot public\n")
  check("the theme's files are outside public/", !existsSync(join("public", "theme-packages")) && !walk(join("public", "themes")).some((f) => /\.(liquid|json|js|css|zip)$/.test(f)))
  const config = read("next.config.mjs")
  check("the build carries theme-packages/ with the route that reads it, folded or not", /'\/api\/themes\/\*\*': \['\.\/theme-packages\/\*\*\/\*'\]/.test(config))
  const add = read("app/api/themes/marketplace/add/route.ts")
  check("Add composes a code template on the server and hands it to the import as an upload", /composeTemplateZip\(listing\.codePackage!?\)/.test(add) /* Changed on purpose (templates round 20): a published release's zip is used first (lib/themes/releases-server.ts), the code template otherwise. */ && /form\.set\("file"/.test(add) && /importThemePackage\(new Request\(/.test(add))
  check("  it never adds the native theme, and it notes the listing on the new website", !/addRegistryTheme|website-builder\/themes\/add\/route/.test(add) && /listing: listing\.slug/.test(add))
  check("  a store with no menus yet is given the template's; a store with menus keeps its own", /readStoreMenus\(.*\.kind === "none"\) await writeStoreMenus/.test(add))
  check("settings are laid over the base's key by key", JSON.parse(mergeSettingsData('{"current":{"a":1,"b":2}}', '{"current":{"b":3}}')).current.a === 1 && JSON.parse(mergeSettingsData('{"current":{"a":1,"b":2}}', '{"current":{"b":3}}')).current.b === 3)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
