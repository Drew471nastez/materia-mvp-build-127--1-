/**
 * Round P (P4): the chrome kit. Premium headers, menu drawers, carts, search
 * windows, language and currency switches and footers the agent starts from
 * (lib/storelib-ai/library/examples/chrome, lib/storelib-ai/library/chrome-kit.ts).
 *
 *   1. The kit: every role covered (6 headers, 3 menu drawers, 3 carts, 2
 *      search windows, the switches, 6 footers), the generated module current.
 *   2. Each file through the agent's own checks: validateFile (compile, strict
 *      rules, draw, manifest), the render check with a whole page around it
 *      (no error, no render.hook_incomplete), the round O3 anti-slop engine
 *      (no P0), reduced motion, the motion feel variables, settings and
 *      filled preset blocks, 44px targets, flags off by default.
 *   3. The own menu drawer hook (data-storelib-menu-panel): names, hooksIn,
 *      the page record, the render check's warnings, the agent's guide.
 *   4. What the agent is told: the chrome-kit entry, search_knowledge by id,
 *      chromeKitForPrompt in a new site's brief (not an edit's), a fit per
 *      direction.
 *   5. In a real browser (Chromium at /opt/pw-browsers/chromium), six pages
 *      composed from the kit, drawn by the real renderer and mounted with the
 *      real hooks inside the real section boxes: no sideways overflow at 390
 *      and 1440 (shut and with every panel open); the menu drawer, cart and
 *      search window open from the header's buttons, keep the keyboard
 *      inside, shut on Escape and their close buttons, give focus back; live
 *      results; an upsell add opens the kit's cart with the line in it; the
 *      language and currency lists filled; a mega panel opens.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/chrome-kit-p4.test.ts
 * Screenshots of every page, shut and with each panel open, when
 * CHROME_KIT_SHOTS=<directory> is set (for a person to look at; not checked).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  CHROME_KIT,
  CHROME_ROLES,
  chooseChrome,
  chromeExamples,
  chromeKitByRole,
  chromeKitForPrompt,
  exampleById,
  exampleCatalog,
  knowledgeById,
  runSearchKnowledge,
  type VisualConcept,
} from "@/lib/storelib-ai/library"
import { CHROME_SOURCES, EXAMPLE_SOURCES } from "@/lib/storelib-ai/library/examples.generated"
import { slopIssues } from "@/lib/ai-builder/slop"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { renderCheck, esbuildScriptParser, hookProblems } from "@/lib/ai-builder/render-check"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import { STOREFRONT_HOOKS, hooksIn } from "@/lib/website-builder/storefront-hooks"
import { HEADLESS_HOOK_GUIDE, STORELIB_HOOKS } from "@/lib/ai-builder/runtime-contract"
import { claimOwnPanel, closeOwnPanel, openOwnPanel, pageHooks } from "@/components/website-builder/sections/own-panels"
import { briefMessage } from "@/lib/ai-builder/agent/prompts"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)
const root = process.cwd()

const NEUTRAL: VisualConcept = {
  name: "Plain Ledger",
  mood: ["exact", "warm"],
  styles: ["swiss"],
  typeSystem: { display: "Archivo", body: "Work Sans", scaleRatio: 1.25 },
  palette: { mode: "light", background: "#ffffff", text: "#111111", muted: "#555555", accent: "#1d5c4a", accentUse: "the one action" },
  layout: { principles: ["flush left"], density: "balanced", radius: 2 },
  motion: { stance: "subtle", moves: ["reveals"] },
  imagery: { direction: "real photographs", avoid: ["stock"] },
  signatureMoves: ["one big type moment"],
}

const card = (id: string, title: string, price: string, kind: string) => ({
  id,
  type: "product" as const,
  settings: { title, price, compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: `/img/${id}.jpg`, images: [], url: `/products/${id}`, slug: id, kind, available: true, tag: "", checkout_url: `/checkout/${id}`, variants: [] },
})
const PRODUCTS = [card("linen-shirt", "Linen shirt", "$48.00", "physical"), card("canvas-tote", "Canvas tote", "$22.00", "physical"), card("lookbook-pdf", "Lookbook PDF", "$12.00", "digital")]
const MENUS = {
  "main-menu": { title: "Main", links: [
    { title: "Shop", url: "/shop", links: [{ title: "Shirts", url: "/shop", links: [{ title: "Linen", url: "/shop", links: [] }] }, { title: "Bags", url: "/shop", links: [] }, { title: "Prints", url: "/shop", links: [] }] },
    { title: "Journal", url: "/about", links: [] },
    { title: "About", url: "/about", links: [] },
    { title: "Contact", url: "/contact", links: [] },
  ] },
  footer: { title: "Help", links: [{ title: "Contact", url: "/contact", links: [] }, { title: "About", url: "/about", links: [] }] },
}
const THEME = { site_chrome: "home", menus: MENUS } as unknown as ThemeSettingsValues
const DATA = storefrontData({ dynamic: { shop: { name: "Fieldwork Supply" }, creator: {} } as never, catalog: PRODUCTS as never, menus: MENUS as never })
const ROUTES = ["/about", "/shop", "/contact"]

/** The kit's files from disk, as the generator reads them. */
const DIR = join(root, "lib/storelib-ai/library/examples/chrome")
const disk = readdirSync(DIR).filter((f) => f.endsWith(".storelib")).sort().map((file) => ({ file, source: readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n") }))
const sourceOf = (id: string) => disk.find((d) => d.file === `${id}.storelib`)!.source
const schemaOf = (src: string) => JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(src)![1]) as { type: string; kind?: string; settings: { id?: string; type: string; default?: unknown }[]; blocks?: { type: string }[]; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[] }

/** A section instance of a kit file with its preset blocks and, where it takes products, the store's products chosen. */
function instanceOf(id: string): SectionInstance {
  const schema = schemaOf(sourceOf(id))
  const blocks = (schema.presets?.[0]?.blocks ?? []).map((b, i) => ({ id: `${id}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}), ...(b.type === "products" ? { products: ["linen-shirt", "canvas-tote"] } : {}) } }))
  const settings: Record<string, unknown> = {}
  for (const s of schema.settings) if (s.type === "product_list" && s.id) settings[s.id] = PRODUCTS.map((p) => p.id)
  const group = schema.kind === "header" ? "header" : schema.kind === "footer" ? "footer" : undefined
  return { id, type: id, name: id, settings, blocks, ...(group ? { group } : {}) } as unknown as SectionInstance
}

function draw(id: string): { id: string; html: string; css: string } {
  const out = renderStorelibSection(instanceOf(id), THEME, { template: "index" }, { [`sections/${id}.storelib`]: sourceOf(id) }, PRODUCTS as never, DATA)
  if (out.ok === false) throw new Error(`${id} did not draw: ${JSON.stringify(out.errors)}`)
  return { id, html: out.html, css: out.css }
}

/** Six pages composed from the kit: every piece used at least once. */
const PAGES: { name: string; ids: string[] }[] = [
  { name: "overlay", ids: ["ai_chrome_header_overlay", "ai_chrome_menu_fullscreen", "ai_chrome_cart_side", "ai_chrome_search_full", "ai_chrome_footer_wordmark"] },
  { name: "split", ids: ["ai_chrome_header_split", "ai_chrome_menu_sheet", "ai_chrome_cart_minimal", "ai_chrome_search_drop", "ai_chrome_footer_newsletter"] },
  { name: "mega", ids: ["ai_chrome_header_mega", "ai_chrome_menu_bottom", "ai_chrome_cart_card", "ai_chrome_search_full", "ai_chrome_footer_columns"] },
  { name: "minimal", ids: ["ai_chrome_header_minimal", "ai_chrome_cart_side", "ai_chrome_search_drop", "ai_chrome_footer_line"] },
  { name: "announce", ids: ["ai_chrome_header_announce", "ai_chrome_menu_fullscreen", "ai_chrome_cart_card", "ai_chrome_search_drop", "ai_chrome_locale", "ai_chrome_footer_image"] },
  { name: "shop", ids: ["ai_chrome_header_shop", "ai_chrome_menu_sheet", "ai_chrome_cart_side", "ai_chrome_search_full", "ai_chrome_footer_sitemap"] },
]

async function main() {
  section("1. The kit")
  check("examples.generated.ts carries the kit as it is on disk (node scripts/build-ai-knowledge.mjs)", JSON.stringify(disk) === JSON.stringify(CHROME_SOURCES))
  check("the round N examples list is unchanged by the kit (no chrome file in it)", EXAMPLE_SOURCES.every((e) => !e.file.startsWith("ai_chrome_")))
  const count = (role: string) => chromeKitByRole(role as never).length
  check("at least 6 headers, 3 menu drawers, 3 carts, 2 search windows, the switches and 6 footers", count("header") >= 6 && count("menu") >= 3 && count("cart") >= 3 && count("search") >= 2 && count("locale") >= 1 && count("footer") >= 6, CHROME_ROLES.map((r) => `${r}:${count(r)}`))
  check("every kit piece has its file, and every file is in the kit", CHROME_KIT.every((p) => disk.some((d) => d.file === `${p.id}.storelib`)) && disk.every((d) => CHROME_KIT.some((p) => `${p.id}.storelib` === d.file)))
  check("served through the example machinery, marked as the kit", chromeExamples().length === disk.length && chromeExamples().every((e) => e.kit === "chrome" && exampleById(e.id) === e))
  check("the round N catalogue line stays without them (the kit has its own block)", !/ai_chrome_/.test(exampleCatalog()))
  check("every page composition uses every piece at least once", CHROME_KIT.every((p) => PAGES.some((pg) => pg.ids.includes(p.id))))

  section("2. Each file through the agent's checks")
  const parse = await esbuildScriptParser()
  for (const { file, source } of disk) {
    const id = file.replace(/\.storelib$/, "")
    const piece = CHROME_KIT.find((p) => p.id === id)!
    const schema = schemaOf(source)
    const inst = instanceOf(id)
    const path = `sections/${id}.storelib`
    check(`${id}: its schema type is its file name`, schema.type === id)
    const errors = validateFile(path, source, { instances: [inst], theme: THEME as never }).filter((i) => i.severity === "error")
    check(`${id}: passes validateFile`, errors.length === 0, errors)
    const drawn = renderStorelibSection(inst, THEME, { template: "index" }, { [path]: source }, PRODUCTS as never, DATA)
    check(`${id}: draws with its presets and the store's menus`, drawn.ok === true && drawn.html.length > 600, drawn.ok ? drawn.html.length : (drawn as { errors?: unknown }).errors)
    /* On a page: the header that opens it, the drawers it opens. */
    const page = PAGES.find((p) => p.ids.includes(id))!
    const sections = page.ids.map(instanceOf)
    const sources = Object.fromEntries(page.ids.map((x) => [`sections/${x}.storelib`, sourceOf(x)]))
    const r = await renderCheck({ page: "home", sections, sources, theme: THEME, template: "index", data: DATA, products: PRODUCTS as never, parseScript: parse ?? undefined, extraRoutes: ROUTES })
    const mine = r.issues.filter((i) => !i.sectionId || i.sectionId === id)
    check(`${id}: the render check on its page finds no error`, !mine.some((i) => i.severity === "error"), mine.filter((i) => i.severity === "error"))
    check(`${id}: and nothing about the hooks (render.hook_incomplete)`, !mine.some((i) => i.code === "render.hook_incomplete"), mine.filter((i) => i.code === "render.hook_incomplete"))
    check(`${id}: no overflow warning from the render check`, !mine.some((i) => i.code === "render.overflow"), mine.filter((i) => i.code === "render.overflow"))
    const slop = slopIssues({ sources: [{ path, content: source }], brief: "" }, NEUTRAL)
    check(`${id}: no anti-slop P0`, !slop.some((i) => i.severity === "error"), slop.filter((i) => i.severity === "error"))
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? ""
    const moves = /@keyframes|transition\s*:|animation\s*:/.test(style)
    check(`${id}: motion only with prefers-reduced-motion handled`, !moves || /prefers-reduced-motion/.test(style))
    check(`${id}: moving parts read the site's motion feel (--t-motion-*), or are tied to the scroll`, !/@keyframes|animation\s*:/.test(style) || /var\(--t-motion-/.test(style) || /animation-timeline/.test(style))
    check(`${id}: no focus outline removed, a visible focus style, no positive tabindex`, !/outline\s*:\s*(?:none|0)\b/.test(style) && /:focus-visible/.test(style) && !/tabindex="[1-9]/.test(source))
    check(`${id}: 44px targets`, /min-height:\s*(?:4[4-9]|5\d)px|min-width:\s*44px/.test(style))
    check(`${id}: no italic, no tracked uppercase labels, no em dash`, !/font-style\s*:\s*italic/i.test(style) && !/text-transform\s*:\s*uppercase/i.test(style) && !/—/.test(source))
    check(`${id}: colours from the scheme, a colour scheme setting`, /\{\{ scheme\.bg \}\}/.test(source) && schema.settings.some((s) => s.type === "color_scheme"))
    check(`${id}: rich settings (8 or more), with a phone layout of its own`, schema.settings.filter((s) => !["header", "paragraph"].includes(s.type)).length >= 8 && /@media \(min-width|@container \(min-width/.test(style))
    if (schema.blocks?.length) {
      const preset = schema.presets?.[0]?.blocks ?? []
      check(`${id}: every block type has filled preset blocks`, schema.blocks.every((b) => preset.some((p) => p.type === b.type)) && preset.every((p) => Object.values(p.settings ?? {}).some((v) => typeof v === "string" && v.trim().length > 1)), preset)
    }
    if (piece.role === "header" || piece.role === "footer") check(`${id}: bound to the site's menus (link_list, in its settings or its blocks)`, schema.settings.some((s) => s.type === "link_list") || /"type": "link_list"/.test(source))
    if (piece.role === "menu") check(`${id}: its own drawer on the hook, with a close button and the language and currency lists`, /data-storelib-menu-panel/.test(source) && /data-storelib-menu-close/.test(source) && /data-storelib-locale-list/.test(source) && /data-storelib-currency-list/.test(source))
    if (piece.role === "cart") check(`${id}: a full cart panel on the hooks`, ["data-storelib-cart-panel", "data-storelib-cart-lines", "data-storelib-cart-line hidden", "data-line-inc", "data-line-dec", "data-line-remove", "data-storelib-cart-subtotal", "data-storelib-checkout", "data-storelib-cart-close", "data-storelib-cart-empty"].every((h) => source.includes(h)))
    if (piece.role === "search") check(`${id}: a full search window on the hooks`, ["data-storelib-search-panel", "data-storelib-search-input", "data-storelib-search-results", "data-storelib-search-result hidden", "data-result-url", "data-result-title", "data-storelib-search-empty", "data-storelib-search-loading", "data-storelib-search-close"].every((h) => source.includes(h)))
    if (piece.role === "menu" || piece.role === "cart" || piece.role === "search") check(`${id}: can be kept open in the editor to style it`, /page\.in_editor and settings\.editor_open/.test(source))
    if (/show_flags/.test(source)) check(`${id}: flags off by default`, schema.settings.find((s) => s.id === "show_flags")?.default === false)
  }
  check("products come from product pickers in the mega menu, the search window and the cart's upsell", /"type": "product_list"/.test(sourceOf("ai_chrome_header_mega")) && /"type": "product_list"/.test(sourceOf("ai_chrome_search_full")) && /"type": "product_list"/.test(sourceOf("ai_chrome_cart_side")) && /data-storelib-add-to-cart="\{\{ p\.id \}\}"/.test(sourceOf("ai_chrome_cart_side")))
  check("the logo comes from Theme settings in every header", chromeKitByRole("header").every((p) => /theme\.logo\.url/.test(sourceOf(p.id))))

  section("3. The site's own menu drawer (data-storelib-menu-panel)")
  check("the names", STOREFRONT_HOOKS.menuPanel === "data-storelib-menu-panel" && STOREFRONT_HOOKS.menuClose === "data-storelib-menu-close")
  check("hooksIn finds a drawer, and not inside a longer name", hooksIn(`<div data-storelib-menu-panel></div>`).menuPanel && !hooksIn(`<button data-storelib-menu>M</button>`).menuPanel && hooksIn(`<button data-storelib-menu>M</button>`).menu)
  const key = {}
  const release = claimOwnPanel(key, "menu", "drawer")
  const opener = { focus() {} } as unknown as HTMLElement
  check("a Menu button in another section opens the page's drawer, remembering the opener", openOwnPanel(key, "menu", "header", opener) && pageHooks(key).menu === "drawer" && pageHooks(key).opener === opener)
  closeOwnPanel(key, "menu")
  check("shut", pageHooks(key).menu === null)
  openOwnPanel(key, "menu", null)
  release()
  check("a section that goes takes its drawer with it", pageHooks(key).own.menu.length === 0 && pageHooks(key).menu === null)
  check("no drawer of the site's own: nothing to open (the built-in one is used)", !openOwnPanel({}, "menu", "x"))
  check("the render check names a drawer with no close button, and one nothing opens", hookProblems(`<div data-storelib-menu-panel><a href="/">x</a></div>`, `<div data-storelib-menu-panel>`).map((p) => p.severity).join() === "warning,warning")
  check("  and is quiet about a complete one", hookProblems(`<div data-storelib-menu-panel><button data-storelib-menu-close>x</button></div>`, `<button data-storelib-menu>M</button>`).length === 0)
  check("the agent is told (STORELIB_HOOKS and the guide)", (Object.values(STORELIB_HOOKS) as string[]).includes("data-storelib-menu-panel") && HEADLESS_HOOK_GUIDE.includes("data-storelib-menu-panel") && HEADLESS_HOOK_GUIDE.includes("data-storelib-menu-close"))
  const hooksSrc = readFileSync(join(root, "components/website-builder/sections/site-chrome-hooks.tsx"), "utf8")
  check("the page keeps the keyboard in the menu drawer and the own cart panel (useFocusTrap)", /useFocusTrap\(ownMenuOpen, menuPanelRef, !inCanvas\)/.test(hooksSrc) && /useFocusTrap\(panelOpen, cartPanelRef, !inCanvas\)/.test(hooksSrc))
  check("the built-in menu drawer is not drawn while the page has its own", /flags\.menu && !ownMenuOnPage/.test(hooksSrc))

  section("4. What the agent is told")
  const entry = knowledgeById("chrome-kit")
  check("a chrome-kit knowledge entry lists every piece and says adapt, never verbatim", !!entry && CHROME_KIT.every((p) => entry.body.includes(p.id)) && /never ship a kit file unchanged/i.test(entry.body))
  check("search_knowledge hands a kit file over in full by id", (() => { const r = runSearchKnowledge({ query: "ai_chrome_cart_side" }); return r.entries[0]?.id === "ai_chrome_cart_side" && r.entries[0].body.includes("<schema>") })())
  check("search_knowledge finds the kit entry by what it is", runSearchKnowledge({ query: "chrome kit mega menu header cart drawer" }).entries.some((e) => e.id === "chrome-kit"))
  const block = chromeKitForPrompt({ text: "boutique hotel on the coast, cinematic photography" })
  check("chromeKitForPrompt lists every piece by role", CHROME_KIT.every((p) => block.includes(p.id)) && /Headers:/.test(block) && /Footers:/.test(block))
  check("  says adapt, not copy, and how to compose on the hooks", /ADAPT/.test(block) && /Never ship one verbatim/.test(block) && /header group/.test(block) && /product_list/.test(block))
  check("  and fits the brief: a hotel gets the header over the hero and the image footer", /header ai_chrome_header_overlay/.test(block) && /footer ai_chrome_footer_image/.test(block), block.split("\n").pop())
  check("  stays small (under 3,600 characters) and has no em dash", block.length < 3600 && !/—/.test(block), block.length)
  const grocer = chooseChrome({ text: "online grocery marketplace with a large catalog", international: true })
  check("a grocery marketplace gets the shop header and the switches", grocer.header?.id === "ai_chrome_header_shop" && grocer.locale?.id === "ai_chrome_locale", { header: grocer.header?.id, locale: grocer.locale?.id })
  check("one market only: no switches suggested", chooseChrome({ text: "a pottery studio" }).locale === null)
  check("deterministic", JSON.stringify(chooseChrome({ text: "studio portfolio" })) === JSON.stringify(chooseChrome({ text: "studio portfolio" })))
  const job = { jobId: "j", installId: "i", creatorId: "c1", prompt: "A personal trainer in Leeds, strength coaching and booking", mode: "blank", options: { generation: "blank", category: "fitness_coach" } }
  const brief = briefMessage({ job: job as never, caps: null, pages: [{ key: "home", sections: [] }], files: [], knowledge: [] })
  check("a new site's brief carries the chrome kit", brief.includes("CHROME KIT") && brief.includes("ai_chrome_header_overlay"))
  check("  and still ends on the order of work", /render_check on every page, finish\.$/.test(brief))
  const edit = briefMessage({ job: { ...job, edit: { scope: "x" } } as never, caps: null, pages: [{ key: "home", sections: [] }], files: [], knowledge: [] })
  check("an edit's brief does not (the site's own chrome stays)", !edit.includes("CHROME KIT"))

  section("5. In a real browser")
  await inBrowser()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

const ORIGIN = "https://shop.example"
const TOKENS = `:root { --t-motion-duration: 200ms; --t-motion-ease: ease-out; --t-motion-distance: 24px; --t-motion-stagger: 20ms; --t-motion-hover: 120ms; --t-motion-ease-ui: ease; --t-motion-lift: 4px; --t-motion-scale: 1.06; --t-motion-parallax: 6%; --theme-font-heading: Georgia; --theme-font-body: Arial; --theme-padding-x: 16px; } body { margin: 0; font-family: Arial, sans-serif; }`
const HERO = { id: "hero", html: `<section style="min-height:120vh;background:#2a3b33;color:#fff;padding:120px 16px 40px"><h1 style="margin:0;font-size:48px">A page under the header</h1><p><a href="/shop">Shop</a></p></section>`, css: "" }

async function inBrowser() {
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    check("Chromium is here for the browser checks", false, `no browser at ${chrome}; set CHROMIUM_PATH`)
    return
  }
  const stubs = join(root, ".chrome-kit-p4-probe")
  mkdirSync(stubs, { recursive: true })
  try {
    writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
    writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
    const { build } = await import("esbuild")
    await build({
      entryPoints: [join(root, "tests/_headless/chrome-probe.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.chrome-kit-p4-probe/navigation.js", "next/link": "./.chrome-kit-p4-probe/link.jsx" },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, "app.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, "app.js"), "utf8")
    const htmlFor = (ids: string[]) => {
      const [header, ...rest] = ids.map(draw)
      const footer = rest.pop()!
      const probe = { sections: [header, ...rest, HERO, footer] }
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style></head><body><div id="app"></div><script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
    }

    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    try {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const open = async (html: string, width: number) => {
        const p = await browser.newPage()
        await p.setViewport({ width, height: 860 })
        const errors: string[] = []
        p.on("pageerror", (e) => errors.push(String((e as Error).message || e)))
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          const url = r.url()
          if (url.startsWith(`${ORIGIN}/api/website-builder/search`)) {
            const q = new URL(url).searchParams.get("q") ?? ""
            const items = q === "zzz" ? [] : [
              { kind: "product", title: "Linen shirt", price: "$48.00", image: "/img/linen-shirt.jpg", url: "/products/linen-shirt" },
              { kind: "page", title: "About the studio", price: "", image: "", url: "/about" },
            ]
            return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ items, total: items.length }) })
          }
          if (r.isNavigationRequest() && url === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: html })
          if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" })
          if (r.resourceType() === "image") return void r.respond({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="#998"/></svg>` })
          return void r.respond({ status: 204, body: "" })
        })
        await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
        await sleep(300)
        return { p, errors }
      }
      type Page = import("puppeteer-core").Page
      const shots = process.env.CHROME_KIT_SHOTS
      if (shots) mkdirSync(shots, { recursive: true })
      const shot = async (p: Page, name: string) => { if (shots) await p.screenshot({ path: join(shots, `${name}.png`) as `${string}.png` }) }
      /*
        Sideways overflow as a visitor sees it: the page's own scroll width, and any visible element past the window's
        edges that nothing clips. An ancestor that clips sideways counts only up to the nearest fixed element: a fixed
        drawer is not clipped by the section box it sits in, so a sheet wider than a phone is caught.
      */
      const overflow = (p: Page) => p.evaluate(() => {
        const doc = document.documentElement
        const wide = [...document.querySelectorAll<HTMLElement>("[data-probe-section] *")].filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") return false
          if (r.right <= innerWidth + 1 && r.left >= -1) return false
          if (getComputedStyle(el).position === "fixed") return true
          for (let a: HTMLElement | null = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a)
            if (cs.overflowX !== "visible") return false
            if (cs.position === "fixed") break
          }
          return true
        }).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
        return { scroll: doc.scrollWidth, inner: innerWidth, wide }
      })
      /* Anything the page marked hidden (a copied pattern, the empty state of a full cart, a list with one choice) that still shows. */
      const shownHidden = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-probe-section] [hidden]")].filter((el) => el.getClientRects().length > 0).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${el.className}`))
      const state = (p: Page, sel: string) => p.evaluate((s) => {
        const panel = document.querySelector(s)
        const active = document.activeElement
        const cs = panel ? getComputedStyle(panel) : null
        return { open: panel?.getAttribute("data-open"), inert: panel?.hasAttribute("inert") ?? null, visible: cs?.visibility === "visible", focusIn: !!(active && panel?.contains(active)), active: active ? `${active.tagName.toLowerCase()}.${active.className}` : "", modal: panel?.getAttribute("aria-modal") ?? null }
      }, sel)

      for (const pg of PAGES) {
        const html = htmlFor(pg.ids)
        for (const width of [390, 1440]) {
          const { p, errors } = await open(html, width)
          await shot(p, `${pg.name}-${width}`)
          const o = await overflow(p)
          check(`${pg.name} @${width}: no sideways scroll, shut`, o.scroll <= o.inner && o.wide.length === 0, o)
          const has = (sel: string) => p.$(sel).then((h) => !!h)
          const menuBtn = `[data-probe-section="${pg.ids[0]}"] [data-storelib-menu]`
          const tap = async (sel: string) => { await p.$eval(sel, (el) => (el as HTMLElement).scrollIntoView({ block: "nearest" })); await p.click(sel) }
          if (width === 390 && (await has(menuBtn))) {
            /* THE MENU DRAWER: the header's Menu button opens the kit's drawer, never the built-in one. */
            await tap(menuBtn)
            await sleep(450)
            await shot(p, `${pg.name}-${width}-menu`)
            let s = await state(p, "[data-storelib-menu-panel]")
            check(`${pg.name}: MENU opens the site's own drawer as a dialog, visible, focus inside`, s.open === "true" && s.inert === false && s.visible && s.focusIn && s.modal === "true", s)
            check(`${pg.name}:   not the built-in drawer`, !(await p.$('[data-mobile-nav-drawer], [aria-label="Mobile navigation"]')), "built-in drawer drawn")
            const btnExpanded = await p.$eval(menuBtn, (el) => el.getAttribute("aria-expanded"))
            check(`${pg.name}:   the button says it is expanded`, btnExpanded === "true", btnExpanded)
            const o2 = await overflow(p)
            check(`${pg.name} @390: no sideways scroll with the drawer open, nothing past the edges`, o2.scroll <= o2.inner && o2.wide.length === 0, o2)
            check(`${pg.name}:   nothing hidden shows in the drawer`, (await shownHidden(p)).length === 0, await shownHidden(p))
            for (let i = 0; i < 14; i++) await p.keyboard.press("Tab")
            s = await state(p, "[data-storelib-menu-panel]")
            check(`${pg.name}:   Tab goes round inside it`, s.focusIn, s.active)
            await p.keyboard.press("Escape")
            await sleep(450)
            s = await state(p, "[data-storelib-menu-panel]")
            const back = await p.evaluate((sel) => document.activeElement === document.querySelector(sel), menuBtn)
            check(`${pg.name}:   Escape shuts it, out of reach, focus back on the Menu button`, s.open === "false" && s.inert === true && !s.visible && back, { s, back })
            await tap(menuBtn)
            await sleep(350)
            await p.evaluate(() => (document.querySelector("[data-storelib-menu-panel] button[data-storelib-menu-close]:not([tabindex])") as HTMLElement | null)?.click())
            await sleep(450)
            s = await state(p, "[data-storelib-menu-panel]")
            check(`${pg.name}:   its close button shuts it`, s.open === "false", s)
            await tap(menuBtn)
            await sleep(350)
            await p.evaluate(() => { const a = document.querySelector("[data-storelib-menu-panel] nav a[href]") as HTMLAnchorElement | null; a?.addEventListener("click", (e) => e.preventDefault(), { once: true }); a?.click() })
            await sleep(300)
            s = await state(p, "[data-storelib-menu-panel]")
            check(`${pg.name}:   a link inside it shuts it`, s.open === "false", s)
          }
          if (width === 390) {
            /* THE CART: the bag opens the kit's cart panel; Escape and the close button shut it. */
            const bag = `[data-probe-section="${pg.ids[0]}"] [data-storelib-cart]`
            await tap(bag)
            await sleep(450)
            await shot(p, `${pg.name}-${width}-cart`)
            let s = await state(p, "[data-storelib-cart-panel]")
            check(`${pg.name}: BAG opens the site's own cart panel, visible, keyboard inside`, s.open === "true" && s.visible && s.focusIn, s)
            check(`${pg.name}:   its empty state shows`, await p.$eval("[data-storelib-cart-panel] [data-storelib-cart-empty]", (el) => !(el as HTMLElement).hidden && el.getBoundingClientRect().height > 0))
            const o3 = await overflow(p)
            check(`${pg.name} @390: no sideways scroll with the cart open, nothing past the edges`, o3.scroll <= o3.inner && o3.wide.length === 0, o3)
            check(`${pg.name}:   the line pattern and the filled parts stay hidden in an empty cart`, (await shownHidden(p)).length === 0, await shownHidden(p))
            await p.keyboard.press("Escape")
            await sleep(450)
            s = await state(p, "[data-storelib-cart-panel]")
            check(`${pg.name}:   Escape shuts it, focus back on the bag`, s.open === "false" && !s.visible && (await p.evaluate((sel) => document.activeElement === document.querySelector(sel), bag)), s)
            /* THE SEARCH WINDOW: live results copied from the kit's pattern. */
            const find = `[data-probe-section="${pg.ids[0]}"] [data-storelib-search]`
            await tap(find)
            await sleep(450)
            s = await state(p, "[data-storelib-search-panel]")
            const typed = await p.evaluate(() => document.activeElement?.hasAttribute("data-storelib-search-input"))
            check(`${pg.name}: SEARCH opens the site's own window, focus in its input`, s.open === "true" && s.visible && !!typed, { s, typed })
            await p.keyboard.type("linen")
            await sleep(700)
            const hits = await p.$$eval("[data-storelib-search-result-item]", (els) => els.map((el) => ({ t: el.querySelector("[data-result-title]")?.textContent, h: el.querySelector("a[data-result-url]")?.getAttribute("href"), shown: el.getBoundingClientRect().height > 0 })))
            check(`${pg.name}:   live results drawn and visible`, hits.length === 2 && hits[0].t === "Linen shirt" && hits[0].h === "/products/linen-shirt" && hits.every((x) => x.shown), hits)
            await shot(p, `${pg.name}-${width}-search`)
            const o4 = await overflow(p)
            check(`${pg.name} @390: no sideways scroll with results open, nothing past the edges`, o4.scroll <= o4.inner && o4.wide.length === 0, o4)
            check(`${pg.name}:   the result pattern and the idle parts stay hidden`, (await shownHidden(p)).length === 0, await shownHidden(p))
            await p.evaluate(() => (document.querySelector("[data-storelib-search-panel] [data-storelib-search-close]:not([tabindex])") as HTMLElement | null)?.click())
            await sleep(450)
            s = await state(p, "[data-storelib-search-panel]")
            check(`${pg.name}:   its close button shuts it`, s.open === "false" && !s.visible, s)
            /* Languages and currencies wherever the page has lists of its own. */
            const lists = await p.$$eval("[data-storelib-locale-list]", (els) => els.map((el) => el.querySelectorAll("[data-storelib-option-item]").length))
            if (lists.length) check(`${pg.name}: language lists filled with the site's two languages`, lists.every((n) => n === 2), lists)
            const flags = await p.$$eval("[data-storelib-option-item]", (els) => els.some((el) => !!getComputedStyle(el, "::before").content && getComputedStyle(el, "::before").content !== "none" && /\p{Regional_Indicator}/u.test(getComputedStyle(el, "::before").content)))
            check(`${pg.name}: no flags by default`, !flags)
          }
          if (width === 1440) {
            const panelsOpen = await p.evaluate(() => { document.querySelectorAll("[data-storelib-cart-panel],[data-storelib-search-panel],[data-storelib-menu-panel]").forEach((el) => el.setAttribute("data-open", "true")); return true })
            await sleep(400)
            const o5 = await overflow(p)
            check(`${pg.name} @1440: no sideways scroll with every panel drawn open, nothing past the edges`, panelsOpen && o5.scroll <= o5.inner && o5.wide.length === 0, o5)
            await p.evaluate(() => document.querySelectorAll("[data-storelib-cart-panel],[data-storelib-search-panel],[data-storelib-menu-panel]").forEach((el) => el.setAttribute("data-open", "false")))
          }
          check(`${pg.name} @${width}: no script errors`, errors.length === 0, errors)
          await p.close()
        }
      }

      /* An upsell add, the mega panel, and the header over the hero turning solid. */
      {
        const { p } = await open(htmlFor(PAGES[0].ids), 1440)
        await p.click('[data-probe-section="ai_chrome_header_overlay"] [data-storelib-cart]')
        await sleep(400)
        await p.click(".csd__add[data-storelib-add-to-cart]")
        await sleep(400)
        const lines = await p.$$eval("[data-storelib-cart-line-item]", (els) => els.map((el) => el.querySelector("[data-line-title]")?.textContent))
        const count = await p.$eval('[data-probe-section="ai_chrome_header_overlay"] [data-storelib-cart-count]', (el) => el.getAttribute("data-count"))
        check("UPSELL: an add in the cart's row puts the line in the kit's cart and the header's count goes up", lines.length === 1 && lines[0] === "Linen shirt" && count === "1", { lines, count })
        await shot(p, "overlay-1440-cart-filled")
        const filled = await p.$eval(".csd__foot", (el) => !(el as HTMLElement).hidden && el.getBoundingClientRect().height > 0)
        const emptyGone = await p.$eval(".csd__empty", (el) => el.getClientRects().length === 0)
        check("  the subtotal and checkout show once it holds something, the empty line goes", filled && emptyGone, { filled, emptyGone })
        check("  nothing hidden shows (the line pattern)", (await shownHidden(p)).length === 0, await shownHidden(p))
        await p.keyboard.press("Escape")
        await sleep(300)
        const before = await p.$eval(".hov", (el) => getComputedStyle(el).backgroundColor)
        await p.evaluate(() => window.scrollTo(0, 400))
        await sleep(300)
        const after = await p.$eval(".hov", (el) => getComputedStyle(el).backgroundColor)
        const pinned = await p.$eval(".hov", (el) => el.getBoundingClientRect().top)
        check("OVER THE HERO: transparent at the top, solid after scrolling, still at the top of the window", /rgba\(0, 0, 0, 0\)|transparent/.test(before) && !/rgba\(0, 0, 0, 0\)/.test(after) && pinned === 0, { before, after, pinned })
        await p.close()
      }
      {
        const { p } = await open(htmlFor(PAGES[2].ids), 1440)
        await p.click('[data-probe-section="ai_chrome_header_mega"] .hmg__top[popovertarget]')
        await sleep(400)
        await shot(p, "mega-1440-panel")
        const mega = await p.evaluate(() => {
          const el = document.querySelector(".hmg__panel:popover-open")
          return el ? { cols: el.querySelectorAll(".hmg__col").length, cards: el.querySelectorAll(".hmg__card").length, prods: el.querySelectorAll(".hmg__prod").length, w: el.getBoundingClientRect().width } : null
        })
        check("MEGA: the top link opens its panel with link columns, image cards and the chosen products", !!mega && mega.cols === 3 && mega.cards === 2 && mega.prods === 2 && mega.w > 1000, mega)
        await p.keyboard.press("Escape")
        await sleep(200)
        check("  Escape shuts it (popover)", !(await p.$(".hmg__panel:popover-open")))
        await p.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
