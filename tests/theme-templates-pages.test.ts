/**
 * The starter templates, all of them, page by page and section by section (the
 * templates' completeness round). tests/theme-templates.test.ts says each
 * template composes, imports and is its own; this file says each one is a
 * whole website:
 *
 *   every page    home, product, collection, collections, cart (empty and
 *                 with lines), search and its results, 404, a plain page,
 *                 about, contact, FAQ, the password page, the blog, a post
 *                 and the three policies: each drawn for a shop with a
 *                 catalogue and for one with nothing yet, with no template
 *                 code, no old starter content and no fake urgency in it
 *   its own       each of the first seven has its own 404, cart, collections,
 *                 blog, article and password pages, in its voice
 *   no dead link  every link any page carries is answered by the site
 *   forms         every form posts somewhere; the password page takes a
 *                 password
 *   navigation    a new store gets the template's menus and every link in
 *                 them opens a page; a store with menus keeps its own
 *   every section each of the theme's sections, alone on a page with its
 *                 preset, draws whole and leaves the section after it in
 *                 place, or is on KNOWN_ISSUES with its reason
 *   products grid the section that used to swallow the page draws products
 *                 and the engine reads a comment the way a browser does
 *   editable      every section a template uses has its panel; a text, a
 *                 colour, a picture, and a block moved, added and removed
 *                 each draw again as changed
 *
 * No database and no browser (scripts/audit-theme-templates.ts and
 * scripts/audit-theme-sections.ts are the same checks in Chromium).
 *
 *   npx tsx tests/theme-templates-pages.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { templateMenus } from "../lib/themes/template-packages"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { withoutVendorTraces, type StoredBlock, type StoredSection } from "../lib/storelib-theme/compat/page"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { importTemplate, type BuiltSite, type ImportedTemplate } from "../scripts/theme-templates/site"
import { auditCart, auditPaths, auditSite } from "../scripts/theme-templates/fixtures"
import { SAMPLE_SHOPS } from "../scripts/theme-templates/shops"
import { ALONE_ID, SENTINEL_ID, SENTINEL_TEXT, editorSchemaOf, homeWith, sectionAsAdded, sectionMarkup, sectionTypesOf, unbalanced } from "../scripts/theme-templates/sections"
import type { SchemaField } from "../lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 900)}` : ""}`) }
}

/** Every template the code lists. */
const TEMPLATES: readonly string[] = CODE_TEMPLATES.map((t) => t.template)
/** The first seven each carry their own 404, cart, collections, blog, article and password pages; a later one may use the theme's. */
const OWN_PAGES = new Set(["default", "clothing", "merch", "digital", "ebooks", "fitness", "landing"])
const ROOT = join(process.cwd(), "theme-packages", CODE_THEME_PACKAGE)

const visibleText = (html: string) => html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")
/* What the old starter and the theme's first owner left behind, and placeholder copy nobody wrote over. */
const LEFTOVER = /Prime ?Clarity|loudlib|FL Studio vs Ableton|DAW comparisons|tech space|Question goes here|Answer goes here|Oops\.\.\.|Stay tuned for something amazing|Materia Modern|lorem ipsum|translation missing/i
/* Changed on purpose (templates round 19): Sample packs is built around Loudlib, the owner's own store, so its name there is the store's name and not leftover starter content. */
const leftoverFor = (template: string) => (template === "samples" ? new RegExp(LEFTOVER.source.replace("loudlib|", ""), "i") : LEFTOVER)
/* A countdown nobody set and a claim the store never made. */
const URGENCY = /items are reserved for|You've got free shipping|away from free shipping/i
const RAW = /\{\{|\{%|%\}|Liquid error/
const BANNED = /\b(unlock|elevate|seamless|seamlessly|powerful|effortless|effortlessly|supercharge|transform)\b|[—–]/i

const get = (site: SiteData, path: string, cart: ReturnType<typeof auditCart> = []) => {
  const u = new URL(path, "http://x")
  return answer(site, { method: "GET", path: u.pathname, query: u.searchParams, body: null, cart: u.searchParams.has("__cart") ? cart : [] })
}
const mainOf = (html: string) => {
  const from = html.search(/<main\b/i)
  const to = html.search(/id="shopify-section-(?:footer|theme-footer)"/)
  return from >= 0 ? html.slice(from, to > from ? to : undefined) : html
}
const hrefsOf = (html: string) => [...html.replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, "").matchAll(/<a\b[^>]*?\shref=(["'])(.*?)\1/gi)].map((m) => m[2].replace(/&amp;/g, "&"))
const internal = (href: string) => href.startsWith("/") && !href.startsWith("//") && !/^\/(__media|__asset|__product|_next|cdn|api|account|checkout)(\/|$)/.test(href) && !/^\/cart\//.test(href)

async function pagesOf(template: string, imported: ImportedTemplate) {
  for (const empty of [false, true]) {
    const built = auditSite(imported, template, empty)
    const state = empty ? "a shop with nothing yet" : "a shop with a catalogue, a blog and policies"
    const cart = auditCart(built)
    const paths = auditPaths(built)
    const rows: { name: string; path: string; status: number; html: string; text: string; main: string }[] = []
    for (const [name, path] of paths) {
      const out = await get(built.site, path, cart)
      const html = typeof out.body === "string" ? out.body : ""
      rows.push({ name, path, status: out.status, html, text: visibleText(html), main: visibleText(mainOf(html)) })
    }
    const wrong = (test: (r: (typeof rows)[number]) => boolean) => rows.filter((r) => !test(r)).map((r) => r.name)
    check(`${state}: ${rows.length} pages are answered, the missing address as a 404 page`, wrong((r) => r.status === (r.name === "404" ? 404 : 200)).length === 0, rows.filter((r) => r.status !== (r.name === "404" ? 404 : 200)).map((r) => `${r.name} ${r.status}`))
    check("  each is a whole page: its header, its footer and something between them", wrong((r) => r.name === "password" ? r.html.length > 8000 && r.main.trim().length > 20 : /id="shopify-section-(theme-)?header"/.test(r.html) && /id="shopify-section-(theme-)?footer"/.test(r.html) && r.main.trim().length >= 5).length === 0, wrong((r) => r.name === "password" ? r.html.length > 8000 && r.main.trim().length > 20 : /id="shopify-section-(theme-)?header"/.test(r.html) && /id="shopify-section-(theme-)?footer"/.test(r.html) && r.main.trim().length >= 5))
    check("  no template code is left in the text of any", wrong((r) => !RAW.test(r.text)).length === 0, rows.filter((r) => RAW.test(r.text)).map((r) => `${r.name}: ${r.text.match(/.{0,40}(\{\{|\{%|%\}|Liquid error).{0,40}/)?.[0]}`))
    check("  none says Shopify, and none carries the old starter's or a placeholder's words", wrong((r) => !/shopify/i.test(r.text) && !leftoverFor(template).test(r.text)).length === 0, rows.filter((r) => /shopify/i.test(r.text) || leftoverFor(template).test(r.text)).map((r) => `${r.name}: ${r.text.match(new RegExp(`.{0,30}(shopify|${LEFTOVER.source}).{0,30}`, "i"))?.[0]}`))
    check("  no countdown nobody set and no free shipping the store never promised", wrong((r) => !URGENCY.test(r.text)).length === 0, rows.filter((r) => URGENCY.test(r.text)).map((r) => `${r.name}: ${r.text.match(new RegExp(`.{0,30}(${URGENCY.source}).{0,30}`, "i"))?.[0]}`))
    check("  no section fails to draw", wrong((r) => !/data-storelib-section-error|Could not draw this section/i.test(r.html)).length === 0)

    /* Links. */
    const hrefs = new Map<string, string>()
    for (const r of rows) for (const h of hrefsOf(r.html)) if (!hrefs.has(h)) hrefs.set(h, r.name)
    const dead: string[] = []
    for (const [href, on] of hrefs) {
      if (!internal(href)) continue
      const out = await get(built.site, href.split("#")[0] || "/")
      if (out.status >= 400) dead.push(`${out.status} ${href} (on ${on})`)
    }
    check(`  every one of its ${[...hrefs.keys()].filter(internal).length} links to the site opens a page`, dead.length === 0, dead.slice(0, 12))
    const bare = rows.flatMap((r) => [...mainOf(r.html).replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter((m) => /\shref=(["'])(#|)\1/.test(m[1]) && !/role=|aria-controls|aria-haspopup|data-/.test(m[1]) && visibleText(m[2]).trim().length > 0).map((m) => `${r.name}: ${visibleText(m[2]).trim().slice(0, 40)}`))
    check("  no link in a page's content goes nowhere", bare.length === 0, [...new Set(bare)].slice(0, 10))
    const forms = rows.flatMap((r) => [...r.html.matchAll(/<form\b([^>]*)>/gi)].map((m) => ({ page: r.name, action: m[1].match(/\saction=(["'])(.*?)\1/)?.[2] ?? null, script: /\son:?submit=|data-storelib-form=/.test(m[1]) })))
    /* A form the theme's own script sends (the cart's discount code box, `onsubmit="return false"`) has no address of its own and needs none. */
    check("  every form posts or searches somewhere", forms.length > 0 && forms.every((f) => f.script || (f.action !== null && f.action !== "" && f.action !== "#")), forms.filter((f) => !f.script && (!f.action || f.action === "#")).slice(0, 6))

    const page = (name: string) => rows.find((r) => r.name === name)!
    check("  the contact page's form posts to the site's own contact address", /<form\b[^>]*action="\/contact[#"]/.test(page("contact").html) && /name="contact\[email\]"/.test(page("contact").html))
    check("  the password page takes a password, and posts it to the site's password check", /<form\b[^>]*action="\/api\/site-password"/.test(page("password").html) && /<input\b[^>]*name="password"[^>]*type="password"|<input\b[^>]*type="password"[^>]*name="password"/.test(page("password").html))
    check("  the 404 page says so and offers a way back", /<a\b[^>]*href="\/(collections\/all)?"/.test(mainOf(page("404").html)) && page("404").main.trim().length > 30)
    check("  a page with no template of its own draws in the page template, under its title", /Shipping/.test(page("page").main))
    if (!empty) {
      const first = built.site.products[0].settings
      const second = built.site.products[1].settings
      check("  the product page shows the product, its price in the shop's money, its sizes and a form that adds it to the cart", page("product").main.includes(String(first.title)) && page("product").main.includes(String(first.price)) && /* Changed on purpose (templates round 20): the sample product's own first option value (Size XS, Edition PDF ...), where it used to always be Small. */ page("product").main.includes(String((first.variants as { options: string[] }[])[0]?.options?.[0] ?? "")) &&/<form\b[^>]*action="\/cart\/add"/.test(page("product").html), page("product").main.slice(0, 200))
      check("  the collection page lists every product with its price", built.site.products.every((p) => page("collection").main.includes(String(p.settings.title))) && page("collection").main.includes(String(second.price)))
      check("  one collection lists only its own products", page("collection-one").main.includes("New in") && page("collection-one").main.includes(String(first.title)) && !page("collection-one").main.includes(String(built.site.products[built.site.products.length - 1].settings.title)))
      check("  the collections page lists the shop's collections, and not every product as one of them", ["Gifts", "New in", "Best sellers"].every((t) => page("collections").main.includes(t)) && !/href="\/collections\/all"/.test(mainOf(page("collections").html)) && !/Sweaters|Activewear|Handbags/.test(page("collections").main))
      check("  search finds a product by a word of its title", page("search-results").main.includes(String(second.title)))
      check("  the cart with two lines shows both, a subtotal and the way to checkout", page("cart-full").main.includes(String(first.title)) && page("cart-full").main.includes(String(second.title)) && /Subtotal/i.test(page("cart-full").main) && /name="checkout"|href="\/checkout"/.test(page("cart-full").html))
      check("  the blog lists its posts under the blog's own title, and a post shows its words", built.site.blog!.cards.every((c) => page("blog").main.includes(c.title)) && page("blog").main.includes("Journal") && page("article").main.includes(SAMPLE_SHOPS[template]?.posts?.[0]?.html.match(/<h2[^>]*>([^<]+)/)?.[1] ?? "First, the check") /* Changed on purpose (templates round 21): a shop with its own posts (Sample packs) shows its own first heading. */ && page("article").main.includes(built.site.blog!.cards[0].title))
      check("  each policy the store wrote is a page, and the footer links to it", (built.site.shop.policies ?? []).every((p) => page(p.handle).main.includes(p.title) && page(p.handle).main.includes("We") === /We/.test(visibleText(p.body)) && new RegExp(`href="/policies/${p.handle}"`).test(page("home").html)))
    } else {
      check("  the home page still shows where products will go, with sample cards and no empty price", page("home").main.trim().length > 400 && !/\$\s*(?:<|$)|NaN|undefined/.test(page("home").main))
      check("  the collection page says there are no products yet, and does not call it a filter that matched nothing", /No products here yet/.test(page("collection").main) && !/Nothing matches those filters/.test(page("collection").main))
      check("  the collections page says there are none yet and links to every product", /No collections yet/.test(page("collections").main) && /href="\/collections\/all"/.test(mainOf(page("collections").html)))
      check("  the footer links to no policy the store has not written", !/href="\/policies\//.test(page("home").html))
    }
  }
}

/* ── Editing: one section, changed and drawn again ─────────────────────── */
const PATH_OF: Record<string, (b: BuiltSite) => string> = {
  home: () => "/", product: (b) => `/products/${b.site.products[0].settings.slug}`, collection: () => "/collections/all", collections: () => "/collections", cart: () => "/cart?__cart=1", search: () => "/search", "404": () => "/no-such/address",
  page: () => "/pages/shipping", about: () => "/pages/about", contact: () => "/pages/contact", faqs: () => "/pages/faqs", password: () => "/password", blog: () => "/blogs/news", article: (b) => b.site.blog!.cards[0].path,
}
const TEXT_TYPES = new Set(["text", "inline_richtext", "richtext", "textarea"])
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

async function drawWith(built: BuiltSite, key: string, sections: StoredSection[], id: string): Promise<string> {
  const before = built.site.pages[key]
  built.site.pages[key] = sections
  try {
    const out = await get(built.site, PATH_OF[key](built), auditCart(built))
    return sectionMarkup(String(out.body), id) ?? ""
  } finally {
    built.site.pages[key] = before
  }
}

interface EditResult { text: string; colour: string; picture: string; blocks: string }

/** Change a text, a colour, a picture and the blocks of one placed section; each answer is "ok", "none" (it has no such thing) or what went wrong. */
async function editsOf(built: BuiltSite, key: string, at: number): Promise<EditResult> {
  const sections = built.site.pages[key]
  const section = sections[at]
  const { schema } = editorSchemaOf(built.imported, section.type)
  const out: EditResult = { text: "none", colour: "none", picture: "none", blocks: "none" }
  if (!schema) return { text: "no panel", colour: "no panel", picture: "no panel", blocks: "no panel" }
  const base = await drawWith(built, key, sections, section.id)
  const baseText = visibleText(base)
  const blockFields = new Map((schema.blocks ?? []).map((b) => [b.type, b.fields]))
  const withSection = (change: (s: StoredSection) => void) => sections.map((s, i) => { if (i !== at) return s; const c = clone(s); change(c); return c })
  const targets = (want: (f: SchemaField) => boolean): { where: "section" | number; field: SchemaField }[] => [
    ...schema.fields.filter(want).map((field) => ({ where: "section" as const, field })),
    ...(section.blocks ?? []).flatMap((b, i) => (blockFields.get(b.type) ?? []).filter(want).map((field) => ({ where: i, field }))),
  ]
  const valueAt = (t: { where: "section" | number; field: SchemaField }) => (t.where === "section" ? section.settings : section.blocks?.[t.where]?.settings)?.[t.field.id]
  const setAt = (s: StoredSection, t: { where: "section" | number; field: SchemaField }, v: unknown) => {
    if (t.where === "section") s.settings = { ...(s.settings ?? {}), [t.field.id]: v }
    else s.blocks![t.where].settings = { ...(s.blocks![t.where].settings ?? {}), [t.field.id]: v }
  }

  /* A text the page shows now, written over. */
  const MARK = "Zebra crossing 4471"
  const shown = targets((f) => TEXT_TYPES.has(String(f.type))).filter((t) => {
    const v = valueAt(t) ?? t.field.default
    const words = typeof v === "string" ? visibleText(v).trim() : ""
    return words.length > 2 && baseText.includes(words.slice(0, 40))
  })
  /* The first of them that the section draws from (a section may keep an older setting beside the block that replaced it). */
  for (const t of shown.slice(0, 8)) {
    const html = await drawWith(built, key, withSection((s) => setAt(s, t, String(t.field.type) === "richtext" ? `<p>${MARK}</p>` : MARK)), section.id)
    out.text = visibleText(html).includes(MARK) ? "ok" : out.text === "none" ? `"${t.field.id}" was changed and the page did not show it` : out.text
    if (out.text === "ok") break
  }

  /* A colour: a colour field of its own, else its colour scheme. */
  const colours = targets((f) => String(f.type) === "color" || String(f.type) === "color_background")
  const schemes = targets((f) => String(f.type) === "color_scheme")
  let colourDone = false
  for (const t of colours.slice(0, 12)) {
    const html = await drawWith(built, key, withSection((s) => {
      setAt(s, t, "#12ab34")
      /* A section that reads its own colours only when asked to (a "custom style" switch): switched on, as its panel does. */
      for (const f of schema.fields) if (String(f.type) === "checkbox" && /^(enable_)?custom(_style|_colors?)?$|enable_custom_style|use_custom_colors|custom_colors/.test(f.id)) s.settings = { ...(s.settings ?? {}), [f.id]: true }
      if (t.where !== "section") for (const f of blockFields.get(s.blocks![t.where].type) ?? []) if (String(f.type) === "checkbox" && /custom/.test(f.id)) s.blocks![t.where].settings = { ...(s.blocks![t.where].settings ?? {}), [f.id]: true }
    }), section.id)
    if (/#12ab34|18,\s*171,\s*52/i.test(html)) { colourDone = true; break }
  }
  if (!colourDone && schemes.length) {
    const t = schemes[0]
    const now = String(valueAt(t) ?? "")
    const other = Object.keys((built.theme.settingsValues as { color_schemes?: Record<string, unknown> }).color_schemes ?? {}).find((k) => k !== now && k !== "default" && !now.includes(k))
    if (other) {
      const html = await drawWith(built, key, withSection((s) => setAt(s, t, other)), section.id)
      colourDone = html !== base && html.includes(other)
    }
  }
  if (colours.length || schemes.length) out.colour = colourDone ? "ok" : "a colour was changed and the page drew the same"

  /* A picture. */
  const pictures = targets((f) => String(f.type) === "image_picker")
  if (pictures.length) {
    let ok = false
    for (const t of pictures.slice(0, 8)) {
      const html = await drawWith(built, key, withSection((s) => {
        setAt(s, t, "/__media/a-new-picture.webp")
        /* What its panel asks for first: the switch that shows the picture, or the choice of "my own picture" over an icon. */
        const turnOn = (fields: SchemaField[], settings: Record<string, unknown>) => {
          for (const f of fields) {
            if (String(f.type) === "checkbox" && /image|logo|media|background|icon/.test(f.id) && /enable|show|use/.test(f.id)) settings[f.id] = true
            const own = String(f.type) === "select" ? (f.options ?? []).map((o) => String((o as { value: unknown }).value)).find((v) => /^(custom|image|custom_image|custom_logo|custom_icon|upload|picture)$/.test(v)) : undefined
            if (own && /type|source|style|media|kind/.test(f.id)) settings[f.id] = own
          }
        }
        s.settings = { ...(s.settings ?? {}) }
        turnOn(schema.fields, s.settings)
        if (t.where !== "section") { s.blocks![t.where].settings = { ...(s.blocks![t.where].settings ?? {}) }; turnOn(blockFields.get(s.blocks![t.where].type) ?? [], s.blocks![t.where].settings!) }
        setAt(s, t, "/__media/a-new-picture.webp")
      }), section.id)
      if (html.includes("a-new-picture.webp")) { ok = true; break }
    }
    out.picture = ok ? "ok" : "a picture was chosen and the page did not show it"
  }

  /* Blocks: moved, taken away, added. */
  const movable = (section.blocks ?? []).filter((b) => !b.static)
  if (movable.length >= 1 && (schema.blocks?.length ?? 0) > 0) {
    const problems: string[] = []
    const withText = movable.map((b) => {
      const f = (blockFields.get(b.type) ?? []).find((x) => TEXT_TYPES.has(String(x.type)) && typeof b.settings?.[x.id] === "string" && visibleText(String(b.settings[x.id])).trim().length > 2 && baseText.includes(visibleText(String(b.settings[x.id])).trim().slice(0, 40)))
      return f ? { id: b.id, words: visibleText(String(b.settings![f.id])).trim().slice(0, 40), field: f.id } : null
    }).filter((x): x is { id: string; words: string; field: string } => !!x)
    /* Two blocks of one type that both show their words: swapped, their words swap places. */
    const pair = withText.flatMap((a, i) => withText.slice(i + 1).filter((b) => b.words !== a.words && section.blocks!.find((x) => x.id === a.id)!.type === section.blocks!.find((x) => x.id === b.id)!.type).map((b) => [a, b] as const))[0]
    if (pair) {
      const [a, b] = pair
      const html = visibleText(await drawWith(built, key, withSection((s) => {
        const ia = s.blocks!.findIndex((x) => x.id === a.id), ib = s.blocks!.findIndex((x) => x.id === b.id)
        ;[s.blocks![ia], s.blocks![ib]] = [s.blocks![ib], s.blocks![ia]]
      }), section.id))
      /* By where each is said first, or last: a heading above them may say both ("What goes in, and what stays out"), and a marquee says each many times. */
      const was = baseText.indexOf(a.words) < baseText.indexOf(b.words)
      const is = html.indexOf(a.words) < html.indexOf(b.words)
      const wasLast = baseText.lastIndexOf(a.words) < baseText.lastIndexOf(b.words)
      const isLast = html.lastIndexOf(a.words) < html.lastIndexOf(b.words)
      if (html.indexOf(a.words) < 0 || html.indexOf(b.words) < 0 || (was === is && wasLast === isLast)) problems.push("two blocks were swapped and the page kept their order")
    }
    if (withText.length) {
      const gone = withText[withText.length - 1]
      const html = visibleText(await drawWith(built, key, withSection((s) => { s.blocks = s.blocks!.filter((x) => x.id !== gone.id) }), section.id))
      const stillOwn = withText.filter((x) => x.id !== gone.id).some((x) => x.words === gone.words)
      if (!stillOwn && html.includes(gone.words) && !(baseText.split(gone.words).length - 1 > 1)) problems.push("a block was removed and its words stayed")
      const copyOf = section.blocks!.find((x) => x.id === gone.id)!
      const added: StoredBlock = { ...clone(copyOf), id: "a_block_added_now", settings: { ...(copyOf.settings ?? {}), [gone.field]: (blockFields.get(copyOf.type) ?? []).find((f) => f.id === gone.field)?.type === "richtext" ? "<p>Heron 9082 added</p>" : "Heron 9082 added" } }
      const limit = schema.blocks?.find((b) => b.type === copyOf.type)?.limit
      const full = typeof schema.max_blocks === "number" && (section.blocks ?? []).length >= schema.max_blocks
      if (!full && !(typeof limit === "number" && movable.filter((b) => b.type === copyOf.type).length >= limit)) {
        const html2 = visibleText(await drawWith(built, key, withSection((s) => { s.blocks = [...s.blocks!, added] }), section.id))
        if (!html2.includes("Heron 9082 added")) problems.push("a block was added and the page did not show it")
      }
    }
    out.blocks = problems.length ? problems.join("; ") : withText.length ? "ok" : "none"
  }
  return out
}

/*
  Sections of the theme that do not draw cleanly alone, each with what
  happens and why. A section not listed here must draw whole. Nothing is
  listed without having been looked at (scripts/audit-theme-sections.ts
  --browser).
*/
const KNOWN_ISSUES: Record<string, string> = {}

/* Sections that draw nothing by themselves, by design: said here so "drew nothing" is a decision and not an accident. */
const DRAWS_NOTHING_ALONE: Record<string, string> = {
  /* Changed on purpose (templates round 19): Night shop's sky is a fixed layer behind the whole page, drawn by its script; the section itself has no height. */
  "space-starfield": "the night sky is a fixed background behind every page, drawn by its script, and takes no room of its own",
}

async function main() {
  /* ── The engine's two fixes ─────────────────────────────────────────── */
  console.log("\nA comment is read the way a browser reads it\n")
  const inTag = `<div id="shopify-section-a"><a class="x" <!-- Added transition classes -- ><b>one</b></a></div><div id="shopify-section-b"><!-- shopify note --><p>two</p></div><div id="shopify-section-c"><p>three</p><!-- liquid --></div>`
  const cleaned = withoutVendorTraces(inTag)
  check("a <!-- among a tag's attributes is not a comment: the sections after it keep their wrappers", cleaned.includes('id="shopify-section-b"') && cleaned.includes("<p>two</p>") && cleaned.includes('id="shopify-section-c"') && cleaned.includes("<b>one</b>"), cleaned)
  check("a real comment that names the old platform is still taken out, wherever it is", !/shopify note/.test(cleaned) && !/<!-- liquid -->/.test(cleaned))
  check("a comment that names nothing stays, and so does every tag", withoutVendorTraces(`<p title="a > b">x</p><!-- keep --><link rel="stylesheet" href="/a.css">`) === `<p title="a > b">x</p><!-- keep --><link rel="stylesheet" href="/a.css">`)
  check("a connection warmed to the old platform's hosts is still left out", withoutVendorTraces(`<link rel="preconnect" href="https://cdn.shopify.com"><p>liquid</p>`) === "<p>liquid</p>")

  /* ── The base's shared pages ────────────────────────────────────────── */
  console.log("\nThe pages every template shares\n")
  const baseTemplate = (f: string) => readFileSync(join(ROOT, "base", "templates", `${f}.json`), "utf8")
  const SHARED = ["404", "cart", "list-collections", "blog", "article", "password"]
  check("none carries the old store's blog, its collections, a placeholder question or a made up countdown", SHARED.every((f) => !/loudlib|"sweaters"|"handbags"|Question goes here|Answer goes here|countdown_date|Oops/.test(baseTemplate(f))), SHARED.filter((f) => /loudlib|"sweaters"|"handbags"|Question goes here|Answer goes here|countdown_date|Oops/.test(baseTemplate(f))))
  check("the collections page lists the shop's own collections, not twelve picked from another shop", /"type": "all"/.test(baseTemplate("list-collections")) && !/"collection_/.test(baseTemplate("list-collections")))
  const baseSettings = (JSON.parse(readFileSync(join(ROOT, "base", "config", "settings_data.json"), "utf8")) as { current: Record<string, unknown> }).current
  check("no reservation countdown and no free shipping bar until the creator sets one", baseSettings.cart_page_show_duration_on_minicart_cart_page === false && baseSettings.show_duration_on_minicart_cart_page === false && baseSettings.show_on_minicart_cart_page === false && baseSettings.cart_page_show_on_minicart_cart_page === false)
  check("no terms checkbox that links to a page the shop does not have, and no payment badge the shop may not take", baseSettings.enable_cart_terms === false && baseSettings.cd_payments_show_klarna === false)

  const baseAsset = (f: string) => readFileSync(join(ROOT, "base", "assets", f), "utf8")
  check("quiet text and a quoted paragraph take their colours from the colour scheme, so a dark scheme can read them", /:where\(\.dark-grey\) \{\s*color: var\(--dark-grey, color-mix\(in srgb, var\(--color-text/.test(baseAsset("critical.css")) && !/blockquote \{\s*background-color: var\(--grey-color\)/.test(baseAsset("critical.css")))
  check("the cart and wishlist counts are the scheme's background colour on its text colour, not white on a light bubble", !/--count-bubble-color, var\(--color-white\)/.test(baseAsset("critical.css")))
  check("a shop name in the header takes the room its words need on a phone, and ends in an ellipsis before the icons", /\.header__logo:has\(\.header__logo-text\)[\s\S]{0,200}width: auto;[\s\S]{0,60}max-width: min\(46vw, 100%\)/.test(baseAsset("header-layout.css")) && /text-overflow: ellipsis/.test(baseAsset("header-layout.css")))
  const banner = readFileSync(join(ROOT, "base", "sections", "scroll-text-banner.liquid"), "utf8")
  check("the scroll text banner pins mid screen when it is fitted to its text, and its highlighted words are readable once lit", /top: var\(--stw-top, \{\{ sticky_off \}\}px\)/.test(banner) && /root\.dataset\.offset = String\(top\)/.test(banner) && /var\(--stw-top, '\+off\+'px\)/.test(baseAsset("text-section-controls.js")) && /:is\(strong,b\) \.stw__w\.is-on\{color:var\(--stw-hl-tx/.test(baseAsset("text-section-controls.css")))

  /* ── Each template ──────────────────────────────────────────────────── */
  const imports: Record<string, ImportedTemplate> = {}
  const edits: Record<string, EditResult & { on: string }> = {}
  for (const template of TEMPLATES) {
    console.log(`\n${template}\n`)
    const id = `${CODE_THEME_PACKAGE}/${template}`
    const overlay = join(ROOT, "templates", template)
    const imported = (imports[template] = await importTemplate(id))
    const keys = imported.theme.pages.map((p) => p.page_key)
    check("has every page a store needs", ["home", "product", "collection", "collections", "cart", "search", "404", "page", "about", "contact", "faqs", "blog", "article", "password"].every((k) => keys.includes(k)), keys)
    const own = SHARED.filter((f) => existsSync(join(overlay, "templates", `${f}.json`)))
    if (OWN_PAGES.has(template)) check("  its own 404, cart, collections, blog, article and password pages", own.length === SHARED.length, SHARED.filter((f) => !own.includes(f)))
    const ownCopy = own.map((f) => readFileSync(join(overlay, "templates", `${f}.json`), "utf8")).join("\n")
    check("  written in its own words, none of the banned ones, no dash for a comma, no old content", !BANNED.test(ownCopy.replace(/"[a-z_0-9]+":/g, "")) && !leftoverFor(template).test(ownCopy) && !/shopify/i.test(ownCopy.replace(/shopify:\/\/[^\s"]*/g, "")), ownCopy.replace(/"[a-z_0-9]+":/g, "").match(new RegExp(`.{0,40}(${BANNED.source}).{0,40}`, "i"))?.[0])
    if (template !== "default" && OWN_PAGES.has(template)) {
      const defaults = SHARED.map((f) => readFileSync(join(ROOT, "templates", "default", "templates", `${f}.json`), "utf8"))
      check("  and not the default template's 404, cart or password page over again", ["404", "cart", "password"].every((f) => readFileSync(join(overlay, "templates", `${f}.json`), "utf8") !== defaults[SHARED.indexOf(f)]))
    }
    const settings = (JSON.parse(readFileSync(join(overlay, "config", "settings_data.json"), "utf8")) as { current: Record<string, unknown> }).current
    if (["digital", "ebooks", "fitness", "landing"].includes(template)) check("  it sells downloads: no delivery estimate in the cart or its drawer", settings.cart_page_show_estimate_shipping_rates === false && settings.cart_drawer_show_shipping_estimator === false && settings.show_estimate_shipping_rates === false)

    /* Nothing a new store cannot stand behind, and no colour set against its own scheme. */
    const pageJson = ["index", "product", "collection", "page.about", "page.contact", "page.faqs"].filter((f) => existsSync(join(overlay, "templates", `${f}.json`))).map((f) => [f, JSON.parse(readFileSync(join(overlay, "templates", `${f}.json`), "utf8").replace(/^\s*\/\*[\s\S]*?\*\//, "")) /* Changed on purpose (templates round 22): a template file may open with a comment. */ as { sections: Record<string, { type: string; settings?: Record<string, unknown>; blocks?: Record<string, { type: string; settings?: Record<string, unknown> }> }> }] as const)
    const promises: string[] = []
    for (const [f, json] of pageJson) for (const sec of Object.values(json.sections)) {
      /* Changed on purpose (round 24): the owner asked for Materia's countdown sections on a few templates. One that starts again every day, week or month (countdown-timer2's restart_period) counts to a time that comes round again, a weekly live call or a weekly offer, never to a one off date that has passed; a fixed date still fails. */
      const recurring = typeof sec.settings?.restart_period === "string" && sec.settings.restart_period !== "none"
      for (const [k, v] of Object.entries(sec.settings ?? {})) if (/^(end_iso|countdown_date|end_date|deadline)$/.test(k) && typeof v === "string" && v.trim() !== "" && !recurring) promises.push(`${f}: ${sec.type} counts down to ${v}`)
      for (const b of Object.values(sec.blocks ?? {})) {
        if (b.type === "in_stock") promises.push(`${f}: an "In stock, receive it by" line that reads no stock and promises a date`)
        /* Changed on purpose (product page round 23): a Sold counter that reads the product's own count, verified from paid orders (lib/products/sold-counts-server.ts), is real proof; one with a typed number is still made up. */
        if (/^(stock_counter|visitors?|viewers?|sold_count|fake_order|urgency)/.test(b.type) && !(b.type === "sold_counter" && b.settings?.sold_source === "product")) promises.push(`${f}: ${b.type}`)
        for (const [k, v] of Object.entries(b.settings ?? {})) if (/^(end_iso|countdown_date|end_date|deadline)$/.test(k) && typeof v === "string" && v.trim() !== "") promises.push(`${f}: ${sec.type} ${b.type} counts down to ${v}`)
      }
    }
    check("  no countdown to a date nobody set, no stock or delivery promise, no made up proof", promises.length === 0 && !/"type": "fake-order"/.test(pageJson.map(([, j]) => JSON.stringify(j)).join("")), promises)
    const product = pageJson.find(([f]) => f === "product")?.[1]
    const productBlocks = Object.values(product?.sections ?? {}).flatMap((x) => Object.values(x.blocks ?? {}))
    check("  the product page's description takes its colour from the colour scheme, and its size guide is spelled", productBlocks.filter((b) => b.type === "product_description").every((b) => !b.settings?.text_color || OWN_PAGES.has(template) === false) && !/Size guid"/.test(JSON.stringify(product ?? {})), productBlocks.filter((b) => b.type === "product_description").map((b) => b.settings?.text_color))
    const headerJson = readFileSync(join(overlay, "sections", "header-group.json"), "utf8")
    const menulessHeader = /"mega_menu": ""/.test(headerJson)
    /* Changed on purpose (templates round 22): the owner asked for Cutroom's (landing) phone pill to carry its button, compact, beside the hamburger and the name; it fits at 360px with room to spare. */
    const compactPhoneButton = template === "landing" && /"mobile_size": "compact"/.test(headerJson)
    check("  its header button stays off a phone's header, where it crowded the shop's name (a one page website keeps its one button)", menulessHeader || compactPhoneButton || !/"show_on_mobile": true/.test(headerJson))

    await pagesOf(template, imported)

    /* Navigation. */
    const built = auditSite(imported, template, false)
    const seeded = templateMenus(id) as Record<string, { links: { title: string; url: string }[] }>
    const links = Object.values(seeded).flatMap((m) => m.links)
    const answers = await Promise.all(links.map(async (l) => [l, (await get(built.site, l.url)).status] as const))
    check("a new store gets its menus, and every link in them opens a page", links.length >= 4 && answers.every(([, s]) => s === 200), answers.filter(([, s]) => s !== 200).map(([l, s]) => `${s} ${l.url}`))
    check("  no menu sends two links to one page", Object.values(seeded).every((m) => new Set(m.links.map((l) => l.url)).size === m.links.length), seeded)
    const home = String((await get(built.site, "/")).body)
    const headerOf = (html: string) => sectionMarkup(html, "header") ?? sectionMarkup(html, "theme-header") ?? ""
    const footerOf = (html: string) => sectionMarkup(html, "footer") ?? sectionMarkup(html, "theme-footer") ?? ""
    /* A template whose header carries no menu (a one page website) reaches its pages from the footer. */
    const menuless = /"mega_menu": ""/.test(readFileSync(join(overlay, "sections", "header-group.json"), "utf8"))
    if (!menuless) check("  its header draws the main menu's links", seeded["main-menu"].links.every((l) => headerOf(home).includes(`href="${l.url}"`)), seeded["main-menu"].links.filter((l) => !headerOf(home).includes(`href="${l.url}"`)))
    check("  its footer draws the footer menu's links", seeded.footer.links.every((l) => footerOf(home).includes(`href="${l.url}"`)), seeded.footer.links.filter((l) => !footerOf(home).includes(`href="${l.url}"`)))
    /* A store that had menus before it added the template: Storelib's own handles, and its own pages. */
    const theirs = { main: { title: "Main", links: [{ title: "Catalogue", url: "/collections/all" }, { title: "Delivery", url: "/pages/delivery" }, { title: "Our story", url: "/about" }] }, legal: { title: "Legal", links: [{ title: "Returns", url: "/policies/refund-policy" }] } }
    const kept = auditSite(imported, template, false)
    kept.site.menus = compatMenus(theirs as never, Object.keys(kept.site.pages))
    const keptHome = String((await get(kept.site, "/")).body)
    const keptLinks = [...theirs.main.links, ...theirs.legal.links]
    const keptAnswers = await Promise.all(keptLinks.map(async (l) => [l.url, (await get(kept.site, l.url)).status] as const))
    check("a store that already has menus keeps them: its own links in the header or footer, each opening a page", (menuless || /Catalogue/.test(visibleText(headerOf(keptHome)))) && /Catalogue/.test(visibleText(footerOf(keptHome))) && keptAnswers.every(([, s]) => s === 200), { answers: keptAnswers.filter(([, s]) => s !== 200), header: /Catalogue/.test(visibleText(headerOf(keptHome))), footer: /Catalogue/.test(visibleText(footerOf(keptHome))) })
    const none = auditSite(imported, template, false)
    none.site.menus = compatMenus({} as never, Object.keys(none.site.pages))
    check("  a store whose menus are empty still gets links, each opening a page", (await Promise.all(Object.values(none.site.menus).flatMap((m) => m.links).map(async (l) => (await get(none.site, String(l.url))).status))).every((s) => s === 200) && Object.values(none.site.menus).flatMap((m) => m.links).length >= 3)

    /* Editing. */
    const panelless: string[] = []
    const stale: string[] = []
    for (const p of imported.theme.pages) {
      for (const s of p.sections) {
        const { schema } = editorSchemaOf(imported, s.type)
        if (!schema) { panelless.push(`${p.page_key}: ${s.type}`); continue }
        const ids = new Set(schema.fields.map((f) => f.id))
        const blockIds = new Map((schema.blocks ?? []).map((b) => [b.type, new Set(b.fields.map((f) => f.id))]))
        if (p.template && existsSync(join(overlay, "templates", `${p.template}.json`))) {
          for (const k of Object.keys(s.settings ?? {})) if (!ids.has(k)) stale.push(`${p.page_key} ${s.type}.${k}`)
          for (const b of s.blocks ?? []) {
            if (!blockIds.has(b.type)) stale.push(`${p.page_key} ${s.type} block ${b.type}`)
            else for (const k of Object.keys(b.settings ?? {})) if (!blockIds.get(b.type)!.has(k)) stale.push(`${p.page_key} ${s.type} ${b.type}.${k}`)
          }
        }
      }
    }
    check("every section on every page has its settings panel", panelless.length === 0, panelless)
    check("  and every setting and block its pages carry is one the panel shows", stale.length === 0, [...new Set(stale)].slice(0, 12))
    for (const key of Object.keys(PATH_OF)) {
      const sections = built.site.pages[key] ?? []
      for (let at = 0; at < sections.length; at++) {
        const s = sections[at]
        if (s.hidden || edits[s.type]?.text === "ok" && edits[s.type]?.blocks !== "none" && edits[s.type]?.colour !== "none") continue
        const r = await editsOf(built, key, at)
        const had = edits[s.type]
        /* The fullest answer for a type wins: a later page may place it with blocks the first did not. */
        const better = (a: string, b: string | undefined) => (b === undefined || b === "none" || (b !== "ok" && a === "ok") ? a : b)
        edits[s.type] = { on: had?.on ?? `${template}:${key}`, text: better(r.text, had?.text), colour: better(r.colour, had?.colour), picture: better(r.picture, had?.picture), blocks: better(r.blocks, had?.blocks) }
      }
    }
  }

  console.log("\nEdited and drawn again\n")
  const types = Object.keys(edits).sort()
  const failing = (k: keyof EditResult) => types.filter((t) => edits[t][k] !== "ok" && edits[t][k] !== "none").map((t) => `${t} (${edits[t].on}): ${edits[t][k]}`)
  const count = (k: keyof EditResult) => types.filter((t) => edits[t][k] === "ok").length
  check(`${types.length} section types are placed by the ${TEMPLATES.length} templates`, types.length >= 50, types.length)
  check(`a text written over is drawn again as written (${count("text")} sections with text of their own)`, failing("text").length === 0 && count("text") >= 40, failing("text"))
  check(`a colour or colour scheme changed is drawn again (${count("colour")} sections)`, failing("colour").length === 0 && count("colour") >= 40, failing("colour"))
  check(`a picture chosen is drawn again (${count("picture")} sections with a picture)`, failing("picture").length === 0 && count("picture") >= 10, failing("picture"))
  check(`blocks swapped, removed and added are drawn again (${count("blocks")} sections with blocks)`, failing("blocks").length === 0 && count("blocks") >= 20, failing("blocks"))
  console.log(`        no text of their own: ${types.filter((t) => edits[t].text === "none").join(", ")}`)

  /* ── Every section of the theme, alone ──────────────────────────────── */
  console.log("\nEvery section of the theme, alone on a page\n")
  const imported = imports.default
  const all = sectionTypesOf(imported)
  for (const [empty, design] of [[false, true], [false, false], [true, false]] as const) {
    const built = auditSite(imported, "default", empty)
    /* As the builder's canvas draws it, where a section a creator has just added shows its sample content. */
    if (design) built.site.designMode = true
    const home = built.site.pages.home
    const broke: string[] = []
    const fixedNow: string[] = []
    let clean = 0
    let addable = 0
    for (const type of all) {
      const added = sectionAsAdded(imported, type)
      if (added.addable) addable++
      built.site.pages.home = homeWith(built, [added.section])
      const problems: string[] = []
      try {
        const out = await get(built.site, "/")
        const html = String(out.body)
        const ownMarkup = sectionMarkup(html, ALONE_ID)
        const text = ownMarkup ? visibleText(ownMarkup) : ""
        if (out.status !== 200) problems.push(`status ${out.status}`)
        if (!added.schema) problems.push(`no panel: ${added.errors[0]}`)
        if (!ownMarkup) problems.push("not drawn")
        if (RAW.test(text)) problems.push(`template code in its text: ${text.match(/.{0,30}(\{\{|\{%|%\}|Liquid error).{0,30}/)?.[0]}`)
        const open = ownMarkup ? unbalanced(ownMarkup) : []
        if (open.length) problems.push(`left open ${open.join(" ")}`)
        const after = sectionMarkup(html, SENTINEL_ID)
        if (!after || !after.includes(SENTINEL_TEXT)) problems.push("the section after it is gone")
        if (!/id="shopify-section-(theme-)?footer"/.test(html)) problems.push("the footer is gone")
        /* Just added in the builder, a section shows something: words, or a picture, a line, a video. */
        if (design && ownMarkup && added.addable && !DRAWS_NOTHING_ALONE[type] && text.trim().length === 0 && !/<(img|svg|video|iframe|canvas|input|button|hr)\b|class="[^"]*(divider|line|wave)/i.test(ownMarkup)) problems.push("drew nothing")
      } catch (e) {
        problems.push(`threw ${String(e).slice(0, 160)}`)
      }
      if (!problems.length) { clean++; if (KNOWN_ISSUES[type]) fixedNow.push(type) }
      else if (!KNOWN_ISSUES[type]) broke.push(`${type}: ${problems.join("; ")}`)
    }
    built.site.pages.home = home
    const state = design ? "as just added in the builder" : empty ? "on the website of a shop with nothing yet" : "on the website of a shop with a catalogue"
    check(`${all.length} sections ${state}: ${clean} draw whole and leave the next section in place, ${Object.keys(KNOWN_ISSUES).length} are known issues`, broke.length === 0 && all.length > 200, broke.slice(0, 15))
    check("  nothing is listed as a known issue that draws cleanly now", fixedNow.length === 0, fixedNow)
    if (design) check(`  ${addable} of them can be added by hand, each with a panel and something to show the moment it is added`, addable > 150)
  }
  check("every known issue names a section the theme has, and says why", Object.entries(KNOWN_ISSUES).every(([t, why]) => all.includes(t) && why.length > 20))

  /* ── The products grid ──────────────────────────────────────────────── */
  console.log("\nThe products grid\n")
  const source = readFileSync(join(ROOT, "base", "sections", "products-grid.liquid"), "utf8")
  check("its file has no note written inside a tag", !/<[a-zA-Z][^<>]*<!--/.test(source.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "")))
  for (const empty of [false, true]) {
    const built = auditSite(imported, "default", empty)
    const grid = sectionAsAdded(imported, "products-grid")
    const follow = sectionAsAdded(imported, "richtext1", "the_one_after")
    built.site.pages.home = homeWith(built, [grid.section, follow.section])
    const html = String((await get(built.site, "/")).body)
    const own = sectionMarkup(html, ALONE_ID) ?? ""
    const next = sectionMarkup(html, "the_one_after") ?? ""
    const state = empty ? "with no products it shows the theme's sample cards" : "it draws the shop's products, each linked to its page"
    check(`${state}`, grid.addable && (empty ? (own.match(/product-item/g) ?? []).length >= 4 : built.site.products.every((p) => own.includes(`/products/${p.settings.slug}`))), own.length)
    check("  its markup is whole, and what follows it is beside it, not inside it", unbalanced(own).length === 0 && !own.includes('id="shopify-section-the_one_after"') && next.length > 500 && unbalanced(next).length === 0 && (sectionMarkup(html, SENTINEL_ID) ?? "").includes(SENTINEL_TEXT), unbalanced(own))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
