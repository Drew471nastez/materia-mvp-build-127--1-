/**
 * Round Q (Q1): the chrome platform. What Andrew saw on an AI built site,
 * fixed where every site (AI built or hand built) gets it:
 *
 *   1. Currency labels: "All (BRL R$)" (a market's name in a currency's
 *      label), a currency twice, languages in English; and a compact
 *      dropdown switch with no script of the section's own.
 *   2. Sticky headers: a header section's own `position: sticky` had
 *      nowhere to stick (its box is as tall as it is); the box sticks now
 *      when the header asks (data-storelib-sticky), and the page writes the
 *      scroll's state on it (data-scrolled, data-scroll-dir, data-over-hero).
 *   3. The menu drawer: opened on nothing but its currency buttons when the
 *      site's menu was missing; the page behind it scrolled with it.
 *   4. Buttons: the stray light blue was the inverse band's accent tint used
 *      as a button fill (and its hover); a free site fell back to indigo.
 *   5. Icons by name (data-storelib-icon), drawn by the server.
 *   6. Every field has a label and a placeholder (validateFile).
 *
 * The browser checks run in real Chromium (/opt/pw-browsers/chromium) on a
 * page drawn by the real renderer and theme stylesheet and mounted with the
 * real hooks (tests/_headless/chrome-platform-probe.tsx).
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/chrome-platform-q1.test.ts
 * Screenshots (for a person to look at; not checked) when CHROME_Q1_SHOTS=<directory>.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { languageChoiceOf } from "@/lib/markets/choice"
import { currencyOptions, currencyWords, localeOptions, menuLinksFor, menuDrawerItems, STOREFRONT_HOOKS } from "@/lib/website-builder/storefront-hooks"
import { STORELIB_ICONS, iconSvg, withStorelibIcons, iconName } from "@/lib/website-builder/storelib-icons"
import { themeStylesheet, themeVars, chromePlatformCss } from "@/lib/website-builder/theme-css"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import { resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { tokensToThemeSettings as agentTokens } from "@/lib/ai-builder/agent/tokens"
import { tokensToThemeSettings as siteTokens, contrastOf, inverseButton } from "@/lib/ai-builder/tokens"
import { fieldProblems } from "@/lib/ai-builder/agent/form-fields"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { hookProblems } from "@/lib/ai-builder/render-check"
import { HEADLESS_HOOK_GUIDE } from "@/lib/ai-builder/runtime-contract"
import { nextScrollState, asksForScroll } from "@/components/website-builder/sections/header-scroll"
import { CHROME_SOURCES, EXAMPLE_SOURCES } from "@/lib/storelib-ai/library/examples.generated"
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
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* The market setup Andrew's site had: the store in euros, a market called "All" in reais, and two markets in euros. */
const MARKETS = [
  { id: "all", name: "All", currency: "BRL", countries: ["BR"] },
  { id: "eu", name: "Europe", currency: "EUR", countries: ["FR", "DE"] },
  { id: "ro", name: "Romania", currency: "RON", countries: ["RO"] },
]
const CHOICE = languageChoiceOf({ defaultLanguage: "en", others: ["ro"], locale: null, markets: MARKETS, fresh: true, pricing: null, base: "EUR", charge: "EUR" })

/* A header written as a site's own section, the way the agent writes one: a sticky setting, icons, a compact currency switch, the menu button. */
const HEADER = (sticky: string, over = false) => `<template>
<header class="qh" data-storelib-sticky="${sticky}"${over ? ' data-storelib-over="hero"' : ""} style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }};">
  <a class="qh__logo" href="{{ routes.root_url }}">{{ shop.name }}</a>
  <div class="qh__tools">
    <div class="qh__cur" data-storelib-currency-list data-storelib-dropdown="code" aria-label="Currency"><button type="button" data-storelib-currency-option hidden><span data-option-label></span></button></div>
    <a class="qh__tool" href="{{ routes.search_url }}" data-storelib-search aria-label="Search"><span data-storelib-icon="search" aria-hidden="true"></span></a>
    <a class="qh__tool" href="{{ routes.cart_url }}" data-storelib-cart aria-label="Bag"><span data-storelib-icon="bag" aria-hidden="true"></span></a>
    <button class="qh__tool" type="button" data-storelib-menu="{{ settings.menu.handle }}" aria-label="Menu"><span data-storelib-icon="menu" aria-hidden="true"></span></button>
  </div>
</header>
</template>
<style scoped>
.qh { display: flex; align-items: center; justify-content: space-between; height: 64px; padding: 0 16px; background: var(--s-bg); color: var(--s-text); }
.qh[data-over-hero="true"][data-scrolled="false"] { background: transparent; color: #fff; }
.qh[data-scrolled="true"] { height: 52px; }
.qh__tools { display: flex; align-items: center; gap: 4px; }
.qh__tool { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; color: inherit; }
</style>
<schema>
{ "schema_version": 1, "type": "ai_q1_header", "name": "Q1 header", "kind": "header", "enabled_on": { "groups": ["header"] },
  "settings": [ { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" }, { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" } ] }
</schema>`

const HERO = { id: "hero", html: `<section style="min-height:110vh;background:#2a3b33;color:#fff;padding:120px 16px 40px"><h1 style="margin:0">A page under the header</h1></section>`, css: "" }
const STORY = { id: "story", html: `<section id="story" style="min-height:120vh;padding:24px 16px"><h2 style="margin:0">The story</h2><p style="height:1600px">Long.</p></section>`, css: "" }

function sourceOfKit(id: string): string {
  return readFileSync(join(root, "lib/storelib-ai/library/examples/chrome", `${id}.storelib`), "utf8")
}
const schemaOf = (src: string) => JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(src)![1]) as { settings: { id?: string; type: string; default?: unknown }[]; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[] }

function drawSource(id: string, source: string, theme: ThemeSettingsValues, menus: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  const schema = schemaOf(source)
  const blocks = (schema.presets?.[0]?.blocks ?? []).map((b, i) => ({ id: `${id}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  const inst = { id, type: id, name: id, settings, blocks } as unknown as SectionInstance
  const data = storefrontData({ dynamic: { shop: { name: "Fieldwork" }, creator: {} } as never, catalog: [] as never, menus: menus as never })
  const out = renderStorelibSection(inst, theme, { template: "index" }, { [`sections/${id}.storelib`]: source }, [] as never, data)
  if (out.ok === false) throw new Error(`${id} did not draw: ${JSON.stringify(out.errors)}`)
  return { id, html: out.html, css: out.css }
}

async function main() {
  /* ── 1 ─────────────────────────────────────────────────────────────── */
  section("1. Currency and language labels (pure)")
  const offered = CHOICE.currency?.options ?? []
  check("ROOT CAUSE: lib/markets/choice.ts labelled a market's currency `${market name} (${currency})`; now never a market's name", offered.every((o) => !/All|Europe|Romania|\(/.test(o.label)), offered.map((o) => o.label))
  check("  one option per currency: EUR (the store's and Europe's) once, BRL, RON", offered.map((o) => o.label).join("|") === "EUR €|BRL R$|RON lei", offered.map((o) => o.label))
  const priced = languageChoiceOf({ defaultLanguage: "en", others: [], locale: null, markets: MARKETS, fresh: true, pricing: { market: { id: "eu" }, currency: "EUR" } as never, base: "EUR", charge: "EUR" })
  check("  priced in a market that shares the store's currency: that market stands for the currency, and is current", priced.currency?.options.map((o) => o.id).join("|") === "eu|all|ro" && priced.currency?.current === "eu", priced.currency)
  const opts = currencyOptions(CHOICE)
  check("currencyOptions: EUR €, BRL R$, RON lei, the current marked, ISO, mark and name", opts.map((o) => `${o.label}:${o.current}:${o.iso}:${o.symbol}`).join("|") === "EUR €:true:EUR:€|BRL R$:false:BRL:R$|RON lei:false:RON:lei" && opts[0].name === "Euro", opts)
  const stale = { code: "en", languages: [{ code: "en", name: "English" }], currency: { options: [{ id: "home", label: "EUR €" }, { id: "all", label: "All (BRL R$)" }, { id: "de", label: "Germany (EUR €)" }], current: "home" } }
  check("  an old label from any producer is cleaned: All (BRL R$) reads BRL R$, and the second EUR goes", currencyOptions(stale).map((o) => o.label).join("|") === "EUR €|BRL R$", currencyOptions(stale))
  check("  currencyWords", JSON.stringify(currencyWords("All (BRL R$)")) === JSON.stringify({ label: "BRL R$", iso: "BRL", symbol: "R$" }))
  const langs = localeOptions({ code: "en", languages: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }, { code: "fr", name: "French" }] })
  check("localeOptions: each language in its own words (Română, Français), the page's current", langs.map((l) => `${l.label}:${l.current}`).join("|") === "English:true|Română:false|Français:false", langs)
  check("the hooks' names for the new pieces", STOREFRONT_HOOKS.dropdown === "data-storelib-dropdown" && STOREFRONT_HOOKS.menuLinks === "data-storelib-menu-links" && STOREFRONT_HOOKS.sticky === "data-storelib-sticky" && STOREFRONT_HOOKS.icon === "data-storelib-icon")

  section("2. Sticky headers and scroll state (pure)")
  const css = chromePlatformCss("[data-storelib-theme]")
  check("the box of a Header group section that asks is what sticks (:has), never the header inside it", /\[data-section-box\]\[data-chrome\]:has\(\[data-storelib-sticky="always"\]\)[^{]*\{position:sticky;top:0;z-index:40;\}/.test(css))
  check("  over the hero: the box takes no height", /:has\(\[data-storelib-over="hero"\]\)\{height:0;\}/.test(css))
  check("  'up' goes on the way down, not while focus is inside, still for reduced motion", /\[data-scrolled="true"\]\[data-scroll-dir="down"\]:not\(:focus-within\)\{translate:0 -100%;\}/.test(css) && /prefers-reduced-motion:reduce\)\{[^}]*transition:none/.test(css))
  check("  in every theme stylesheet", themeStylesheet({} as ThemeSettingsValues).includes(css))
  check("SectionRenderer marks a Header or Footer group box as chrome (no section gap, what sticks)", /props\.section\.group === "header" \|\| props\.section\.group === "footer"/.test(read("components/website-builder/sections/SectionRenderer.tsx")))
  check("StorelibSection mounts the scroll state for Header group sections", /useHeaderScroll\(scriptRoot, \{ inCanvas: [^}]*header: section\.group === "header"/.test(read("components/website-builder/sections/StorelibSection.tsx")))
  let st = { scrolled: false, dir: "up" as "up" | "down" }
  st = nextScrollState(st, 0, 40, 64)
  check("nextScrollState: within the header's height it is always up", st.scrolled && st.dir === "up")
  st = nextScrollState(st, 40, 300, 64)
  check("  past it, going down is down", st.dir === "down")
  check("  a tremor changes nothing", nextScrollState(st, 300, 297, 64).dir === "down")
  check("  back up is up, and the top is not scrolled", nextScrollState(st, 300, 200, 64).dir === "up" && !nextScrollState(st, 300, 0, 64).scrolled)
  check("asksForScroll", asksForScroll('<div data-storelib-sticky="up">') && asksForScroll("<div data-storelib-scroll>") && !asksForScroll("<div data-storelib-stickyx>"))

  section("3. The menu drawer's links (pure)")
  const nested = { title: "Main", links: [{ title: "Shop", url: "/shop", links: [{ title: "Shirts", url: "/shirts", links: [{ title: "Linen", url: "/linen", links: [] }] }] }, { title: "About", url: "/about", links: [] }] }
  const items = menuDrawerItems(nested as never, "main-menu")
  check("menuDrawerItems: every level, three deep (it stopped at two)", items[0].children?.[0].children?.[0].label === "Linen", items)
  check("menuLinksFor: the menu named", menuLinksFor({ "main-menu": nested as never }, "main-menu").length === 2)
  check("  a missing menu: the main menu", menuLinksFor({ "main-menu": nested as never }, "nope").length === 2)
  check("  no menu at all: Home and the site's pages, never a template, an account page or a policy", menuLinksFor({}, "main-menu", ["home", "about", "coaching", "contact", "privacy-policy", "product", "account", "404"]).map((i) => i.href).join(" ") === "/ /about /coaching /contact", menuLinksFor({}, "main-menu", ["home", "about", "coaching", "contact", "privacy-policy", "product", "account", "404"]))

  section("4. Buttons in the site's own colours (pure)")
  const concrete = { background: "#ededea", surface: "#e0e0db", text: "#141414", muted: "#4e4e4a", accent: "#1f4fd1", accentText: "#ffffff", border: "#c9c9c3", inverse: { background: "#141414", text: "#ededea", accent: "#8fb0ff" } }
  const agent = agentTokens({ colors: concrete } as never, {}).settings as Record<string, unknown>
  const inv = (agent.color_schemes as Record<string, Record<string, string>>).site_inverse
  check("ROOT CAUSE: the inverse band's button was its accent tint #8fb0ff (hover #7e9be0, the stray light blue); now the site's paper or accent", inv.primary_button_background !== "#8fb0ff" && inv.primary_button_hover_background !== "#7e9be0" && [concrete.accent, concrete.inverse.text].includes(inv.primary_button_background), inv)
  check("  its label reads on it (4.5:1) and the button stands out from the band (3:1)", contrastOf(inv.primary_button_text, inv.primary_button_background) >= 4.5 && contrastOf(inv.primary_button_background, inv.background) >= 3, inv)
  check("  the tint stays the band's accent and link", inv.accent === "#8fb0ff")
  const noInverse = agentTokens({ colors: { ...concrete, inverse: undefined } } as never, {}).settings as Record<string, unknown>
  check("a palette with no band still gets site_inverse, ink and paper, so a dark section is never a scheme of somebody else's", !!(noInverse.color_schemes as Record<string, Record<string, string>>).site_inverse && (noInverse.color_schemes as Record<string, Record<string, string>>).site_inverse.background === "#141414")
  check("inverseButton: a bright accent on a dark band stays the accent", inverseButton("#ff5a1f", "#000000", { background: "#111111", text: "#ffffff" }).background === "#ff5a1f")
  const site = siteTokens({ colors: concrete, fonts: { heading: "A", body: "B" }, radius: { small: 2, medium: 4, large: 8 }, spacing: { scale: 1, sectionY: 96, pageWidth: 1280, gutter: 24 }, motion: { level: "subtle" } } as never, { default_color_scheme: "site", color_schemes: { site: {} } })
  const siteInv = (site.color_schemes as Record<string, Record<string, string>>).site_inverse
  check("lib/ai-builder/tokens.ts does the same", siteInv.primary_button_background !== "#8fb0ff" && contrastOf(siteInv.primary_button_background, siteInv.background) >= 3, siteInv)
  const resolved = resolveSectionColors({ ...agent }, { color_scheme: "site_inverse" }).scheme
  check("  and the scheme a section on the band paints with agrees", resolved.primary_button_background === inv.primary_button_background)
  const freeVars = themeVars({ site_chrome: "home", text_color: "#141414" } as ThemeSettingsValues)
  check("ROOT CAUSE: a free site with no primary colour fell back to the platform's indigo (#6366f1); now its ink", freeVars["--theme-primary"] === "#141414" && freeVars["--theme-link"] === "#141414" && freeVars["--theme-secondary"] === "#141414" && freeVars["--theme-accent"] === "#141414", freeVars)
  check("  a site on the default theme keeps its fallbacks as they were", themeVars({} as ThemeSettingsValues)["--theme-primary"] === "#6366f1")

  section("5. Icons by name (pure)")
  const drawnIcons = withStorelibIcons('<button aria-label="Bag" data-storelib-cart><span data-storelib-icon="bag" aria-hidden="true"></span></button><span data-storelib-icon="account"><svg viewBox="0 0 24 24"><path d="M0 0"/></svg></span><i data-storelib-icon="nope"></i>')
  check("an element marked data-storelib-icon gets a stroked currentColor SVG, hidden from screen readers", /<span data-storelib-icon="bag" aria-hidden="true"><svg class="sl-icon" data-icon="bag"[^>]*stroke="currentColor" stroke-width="1.6"[^>]*aria-hidden="true"/.test(drawnIcons), drawnIcons)
  check("  an alias (account) is the user icon, and an SVG drawn there by hand is replaced so the family is one", /data-storelib-icon="account"><svg class="sl-icon" data-icon="user"/.test(drawnIcons) && !/M0 0/.test(drawnIcons))
  check("  an unknown name draws nothing; drawing twice changes nothing", /<i data-storelib-icon="nope"><\/i>/.test(drawnIcons) && withStorelibIcons(drawnIcons) === drawnIcons)
  check("  the set a header needs and more", ["bag", "search", "user", "menu", "close", "globe", "heart", "arrow-right", "arrow-up", "plus", "minus", "play", "pause", "chevron-down", "check"].every((n) => !!STORELIB_ICONS[n]) && iconName("Region") === "globe")
  check("  every icon's markup is paths and shapes only", Object.values(STORELIB_ICONS).every((v) => /^(?:<(?:path d="[^"<>]*"|circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+"|rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+")\/>)+$/.test(v)) && iconSvg("<script>") === "")
  const drawnHeader = drawSource("ai_q1_header", HEADER("up"), { site_chrome: "home" } as ThemeSettingsValues, {})
  check("  drawn by the real renderer, on the server (first paint)", /data-storelib-icon="search" aria-hidden="true"><svg class="sl-icon"/.test(drawnHeader.html))
  check("  the render check warns about an icon name that does not exist", hookProblems('<span data-storelib-icon="spaceship"></span>', "").some((p) => /spaceship/.test(p.message)))
  check("  the agent is told (runtime contract): icons, the dropdown, sticky, menu links, fields", /data-storelib-icon="NAME"/.test(HEADLESS_HOOK_GUIDE) && /bag, cart/.test(HEADLESS_HOOK_GUIDE) && /data-storelib-dropdown/.test(HEADLESS_HOOK_GUIDE) && /data-storelib-sticky="always"/.test(HEADLESS_HOOK_GUIDE) && /data-storelib-menu-links/.test(HEADLESS_HOOK_GUIDE) && /placeholder and a label/.test(HEADLESS_HOOK_GUIDE))

  section("6. Every field has a label and a placeholder (pure)")
  check("a field with neither is two problems", fieldProblems('<template><input name="email" type="email"></template>').map((p) => p.kind).join(",") === "label,placeholder")
  check("  a <label> around it, <label for>, aria-label all count; a setting is a placeholder", fieldProblems('<template><label>Email <input type="email" placeholder="{{ settings.ph }}"></label><label for="m">M</label><textarea id="m" placeholder="x"></textarea><input aria-label="Q" placeholder="q"></template>').length === 0)
  check("  a checkbox needs its label only; hidden and submit need nothing", fieldProblems('<template><label><input type="checkbox"> Yes</label><input type="hidden" name="a"><input type="submit"></template>').length === 0)
  const v = validateFile("sections/ai_q1_form.storelib", `<template><form data-storelib-form="subscribe"><h2>{{ settings.heading }}</h2><input name="email" type="email"><button type="submit">Join</button></form></template>\n<style scoped>form { display: grid; }</style>\n<schema>{ "schema_version": 1, "type": "ai_q1_form", "name": "Q1 form", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Letters" } ], "presets": [ { "name": "Q1 form" } ] }</schema>`)
  check("validateFile refuses it (form.label, form.placeholder)", v.some((i) => i.code === "form.label" && i.severity === "error") && v.some((i) => i.code === "form.placeholder" && i.severity === "error"), v.map((i) => i.code))
  const kit = [...CHROME_SOURCES, ...EXAMPLE_SOURCES].flatMap((e) => fieldProblems(e.source).map((p) => `${e.file}: ${p.kind} ${p.tag}`))
  check("every chrome kit piece and example the agent starts from passes", kit.length === 0, kit)
  const tdir = join(root, "lib/storelib-ai/templates")
  const tfiles: string[] = []
  const walk = (d: string) => { for (const f of readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(join(d, f.name)); else if (f.name.endsWith(".ts")) tfiles.push(join(d, f.name)) } }
  walk(tdir)
  const tmiss = tfiles.flatMap((f) => fieldProblems(readFileSync(f, "utf8")).filter((p) => p.kind === "placeholder").map((p) => `${f.slice(root.length + 1)}: ${p.tag}`))
  check("every site template's fields have placeholders", tmiss.length === 0, tmiss)

  await inBrowser(drawnHeader)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

const ORIGIN = "https://shop.example"
const TOKENS = `:root { --t-motion-duration: 200ms; --t-motion-ease: ease-out; --t-motion-distance: 24px; --t-motion-stagger: 20ms; --t-motion-hover: 120ms; --t-motion-ease-ui: ease; --t-motion-lift: 4px; --t-motion-scale: 1.06; --t-motion-parallax: 6%; } body { margin: 0; font-family: Arial, sans-serif; }`

async function inBrowser(_header: { id: string; html: string; css: string }) {
  section("Browser (Chromium, the real hooks, the real stylesheet)")
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    check("Chromium is here for the browser checks", false, `no browser at ${chrome}; set CHROMIUM_PATH`)
    return
  }
  const stubs = join(root, ".chrome-platform-q1-probe")
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
      entryPoints: [join(root, "tests/_headless/chrome-platform-probe.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.chrome-platform-q1-probe/navigation.js", "next/link": "./.chrome-platform-q1-probe/link.jsx" },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, "app.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, "app.js"), "utf8")

    /* The site: free, no menus at all (the setup that drew the empty drawer), the agent's Concrete palette. */
    const tokens = agentTokens({ colors: { background: "#ededea", surface: "#e0e0db", text: "#141414", muted: "#4e4e4a", accent: "#1f4fd1", accentText: "#ffffff", border: "#c9c9c3", inverse: { background: "#141414", text: "#ededea", accent: "#8fb0ff" } } } as never, {}).settings
    const theme = { site_chrome: "home", menus: {}, ...tokens } as unknown as ThemeSettingsValues
    const storefront = { creatorId: "11111111-1111-4111-8111-111111111111", pages: ["home", "about", "coaching", "contact", "privacy-policy"], language: CHOICE }
    const footer = { ...drawSource("ai_chrome_locale", sourceOfKit("ai_chrome_locale"), theme, {}, { style: "pills", show_language: true, show_currency: true, language_label: "Language", currency_label: "Currency", align: "start", padding_y: 12, color_scheme: "site" }), group: "footer" as const }
    const drawer = drawSource("ai_chrome_menu_sheet", sourceOfKit("ai_chrome_menu_sheet"), theme, {}, { edge: "left", width: 360, dim: 0.4, panel_label: "Menu", close_label: "Close", nav_label: "Main", back_label: "Back", all_label: "All", language_label: "Language", currency_label: "Currency", motion: "site", motion_strength: 100, color_scheme: "site" })
    /* A dark band with a button, painted from its scheme as the kit paints buttons. */
    const bandVars = Object.entries(resolveSectionColors(theme as never, { color_scheme: "site_inverse" }).vars).map(([k, v]) => `${k}:${v}`).join(";")
    const band = { id: "band", html: `<section style="${bandVars};padding:40px 16px;background:var(--scheme-background);color:var(--scheme-text)"><a class="band-btn" href="/book" style="display:inline-block;padding:12px 20px">Book</a> <button class="theme-btn" style="background:var(--theme-primary);color:#fff;padding:12px">Primary</button></section>`, css: ".band-btn{background:var(--scheme-button-primary);color:var(--scheme-button-primary-text)}" }
    const pageFor = (sticky: string, over: boolean) => {
      const header = { ...drawSource("ai_q1_header", HEADER(sticky, over), theme, {}), group: "header" as const }
      const probe = { sections: [header, drawer, HERO, STORY, band, footer], css: themeStylesheet(theme), vars: themeVars(theme), theme, storefront }
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style></head><body><div id="app"></div><script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
    }

    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    type Page = import("puppeteer-core").Page
    const shots = process.env.CHROME_Q1_SHOTS
    if (shots) mkdirSync(shots, { recursive: true })
    const shot = async (p: Page, name: string) => { if (shots) await p.screenshot({ path: join(shots, `${name}.png`) as `${string}.png` }) }
    const open = async (html: string, width: number, hash = ""): Promise<{ p: Page; errors: string[] }> => {
      const p = await browser.newPage()
      await p.setViewport({ width, height: 800 })
      const errors: string[] = []
      p.on("pageerror", (e) => errors.push(String((e as Error).message || e)))
      await p.setRequestInterception(true)
      p.on("request", (r) => {
        if (r.isNavigationRequest() && r.url().startsWith(`${ORIGIN}/`) && r.url().replace(/#.*/, "") === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: html })
        if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" })
        return void r.respond({ status: 204, body: "" })
      })
      await p.goto(`${ORIGIN}/${hash}`, { waitUntil: "load" })
      await sleep(350)
      return { p, errors }
    }
    const scrollTo = async (p: Page, y: number, canvas = false) => {
      await p.evaluate((yy, c) => { if (c) document.getElementById("wb-preview-root")!.scrollTop = yy; else window.scrollTo(0, yy) }, y, canvas)
      await sleep(250)
    }
    const head = (p: Page) => p.evaluate(() => {
      const h = document.querySelector<HTMLElement>(".qh")!
      const box = h.closest<HTMLElement>("[data-section-box]")!
      const r = h.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), scrolled: h.getAttribute("data-scrolled"), dir: h.getAttribute("data-scroll-dir"), over: h.getAttribute("data-over-hero"), boxScrolled: box.getAttribute("data-scrolled"), boxPos: getComputedStyle(box).position, bg: getComputedStyle(h).backgroundColor, heroTop: Math.round(document.querySelector('[data-probe-section="hero"]')!.getBoundingClientRect().top), boxes: [...document.querySelectorAll<HTMLElement>("[data-section-box]")].map((b) => `${b.dataset.sectionType}:${b.offsetHeight}:${Math.round(b.getBoundingClientRect().top)}`).join(" ") }
    })
    try {
      /* ── 2. STICKY ── */
      for (const canvas of [false, true]) {
        const where = canvas ? "canvas" : "live"
        const { p, errors } = await open(pageFor("always", false), 1280, canvas ? "#canvas" : "")
        let s = await head(p)
        check(`STICKY (${where}): the box sticks; at the top the scroll state reads not scrolled, over the hero`, s.boxPos === "sticky" && s.top === 0 && s.scrolled === "false" && s.boxScrolled === "false" && s.dir === "up" && s.over === "true", s)
        check(`  (${where}) nothing under it moved: the hero starts at its bottom`, s.heroTop === s.bottom, s)
        await scrollTo(p, 1400, canvas)
        s = await head(p)
        check(`  (${where}) after scrolling: still at the top of the window, data-scrolled="true", down, past the hero`, s.top === 0 && s.scrolled === "true" && s.dir === "down" && s.over === "false", s)
        await scrollTo(p, 1100, canvas)
        s = await head(p)
        check(`  (${where}) scrolling back: up`, s.dir === "up" && s.top === 0, s)
        check(`  (${where}) no script errors`, errors.length === 0, errors)
        await p.close()
      }
      {
        const { p } = await open(pageFor("up", false), 1280)
        await scrollTo(p, 300)
        await scrollTo(p, 900)
        let s = await head(p)
        check('STICKY "up": gone on the way down (above the window)', s.bottom <= 0 && s.dir === "down", s)
        await scrollTo(p, 700)
        await sleep(400)
        s = await head(p)
        check('  back on the way up, at the top of the window', s.top === 0 && s.dir === "up", s)
        /* Anchors land under the header: the published offset is its height, read by scroll-margin-top. */
        const anchor = await p.evaluate(() => {
          const rootEl = document.querySelector<HTMLElement>("[data-storelib-theme]")!
          const story = document.getElementById("story")!
          return { offset: rootEl.style.getPropertyValue("--sl-anchor-offset"), margin: getComputedStyle(story.closest("[data-section-box]")!).scrollMarginTop }
        })
        check("  a link to a section lands under the header (--sl-anchor-offset is the header's height)", anchor.offset === "64px" && anchor.margin === "64px", anchor)
        await p.close()
      }
      {
        const { p } = await open(pageFor("always", true), 1280)
        let s = await head(p)
        await shot(p, "desktop-over-hero")
        check('OVER THE HERO: the header lies over the first section (the hero starts at 0) and is transparent there', s.heroTop === 0 && s.top === 0 && /rgba\(0, 0, 0, 0\)/.test(s.bg) && s.over === "true", s)
        await scrollTo(p, 1200)
        s = await head(p)
        check("  scrolled past it: solid, still on screen", s.top === 0 && !/rgba\(0, 0, 0, 0\)/.test(s.bg) && s.over === "false", s)
        await p.close()
      }

      /* ── 1, 3, 4, 5 on a phone ── */
      const { p, errors } = await open(pageFor("always", false), 390)
      await shot(p, "phone-top")
      /* 5. ICONS */
      const icons = await p.$$eval(".qh [data-storelib-icon]", (els) => els.map((el) => { const svg = el.querySelector("svg"); const r = svg?.getBoundingClientRect(); return { name: el.getAttribute("data-storelib-icon"), w: Math.round(r?.width ?? 0), stroke: svg ? getComputedStyle(svg).stroke : "", text: (el.textContent ?? "").trim() } }))
      check("ICONS: search, bag and menu are drawn as icons (1.25em, no words), in the header's colour", icons.length === 3 && icons.every((i) => i.w >= 16 && i.w <= 22 && i.text === "" && /rgb/.test(i.stroke)), icons)
      /* 1. CURRENCY in the footer and the header's compact switch */
      const footerOpts = await p.$$eval('[data-probe-section="ai_chrome_locale"] [data-storelib-currency-list] [data-storelib-option-item]', (els) => els.map((el) => ({ t: (el.textContent ?? "").trim(), cur: el.getAttribute("aria-current") })))
      check('CURRENCY: the footer lists "EUR €", "BRL R$", "RON lei" (no "All (BRL R$)"), EUR current', footerOpts.map((o) => o.t).join("|") === "EUR €|BRL R$|RON lei" && footerOpts[0].cur === "true", footerOpts)
      const langOpts = await p.$$eval('[data-probe-section="ai_chrome_locale"] [data-storelib-locale-list] [data-storelib-option-item] [data-option-label]', (els) => els.map((el) => el.textContent))
      check("  languages in their own words: English, Română", langOpts.join("|") === "English|Română", langOpts)
      const dd = await p.evaluate(() => {
        const list = document.querySelector<HTMLElement>(".qh [data-storelib-dropdown]")!
        const toggle = list.querySelector<HTMLElement>("[data-storelib-dropdown-toggle]")
        const menu = list.querySelector<HTMLElement>("[data-storelib-dropdown-menu]")
        return { toggle: toggle?.textContent?.trim(), expanded: toggle?.getAttribute("aria-expanded"), menuShown: !!menu && menu.getClientRects().length > 0, items: menu?.querySelectorAll("[data-storelib-option-item]").length, h: Math.round(list.getBoundingClientRect().height) }
      })
      check('DROPDOWN: the header\'s switch is one button reading "EUR" (code mode), its menu shut, three options in it', dd.toggle === "EUR" && dd.expanded === "false" && !dd.menuShown && dd.items === 3 && dd.h <= 48, dd)
      await p.click(".qh [data-storelib-dropdown-toggle]")
      await sleep(150)
      const ddOpen = await p.evaluate(() => { const m = document.querySelector<HTMLElement>(".qh [data-storelib-dropdown-menu]")!; const r = m.getBoundingClientRect(); return { shown: m.getClientRects().length > 0, right: r.right, w: innerWidth, expanded: document.querySelector(".qh [data-storelib-dropdown-toggle]")!.getAttribute("aria-expanded") } })
      await shot(p, "phone-dropdown")
      check("  a press opens it, aria-expanded true", ddOpen.shown && ddOpen.expanded === "true", ddOpen)
      await p.keyboard.press("Escape")
      await sleep(100)
      check("  Escape shuts it", await p.$eval(".qh [data-storelib-dropdown-toggle]", (el) => el.getAttribute("aria-expanded") === "false"))
      await p.click(".qh [data-storelib-dropdown-toggle]")
      await sleep(100)
      await p.mouse.click(200, 500)
      await sleep(100)
      check("  a press elsewhere shuts it", await p.$eval(".qh [data-storelib-dropdown-toggle]", (el) => el.getAttribute("aria-expanded") === "false"))

      /* 3. THE MENU DRAWER */
      await p.click('.qh [data-storelib-menu]')
      await sleep(450)
      await shot(p, "phone-drawer")
      const drawerState = await p.evaluate(() => {
        const panel = document.querySelector<HTMLElement>("[data-storelib-menu-panel]")!
        const links = [...panel.querySelectorAll<HTMLAnchorElement>("nav a[href]")].filter((a) => a.getClientRects().length > 0)
        const scrollers = [panel, ...panel.querySelectorAll<HTMLElement>("*")].filter((el) => { const o = getComputedStyle(el).overflowY; return (o === "auto" || o === "scroll") && el.getClientRects().length > 0 })
        return { open: panel.getAttribute("data-open"), links: links.map((a) => `${a.textContent?.trim()} ${a.getAttribute("href")}`), scrollers: scrollers.length, locked: getComputedStyle(document.documentElement).overflow }
      })
      check("MENU DRAWER (site with no menu, the kit's nav drew nothing): its nav gets the site's pages, never only currency buttons over an empty panel", drawerState.open === "true" && drawerState.links.join(", ") === "Home /, About /about, Coaching /coaching, Contact /contact", drawerState)
      check("  one scroll container in the drawer", drawerState.scrollers === 1, drawerState)
      check("  the page behind it is locked (no scroll inside scroll)", drawerState.locked === "hidden", drawerState)
      const yBefore = await p.evaluate(() => window.scrollY)
      await p.mouse.move(380, 700)
      await p.mouse.wheel({ deltaY: 900 })
      await sleep(300)
      check("  a wheel over the open drawer does not move the page", (await p.evaluate(() => window.scrollY)) === yBefore)
      await p.evaluate(() => { const a = [...document.querySelectorAll<HTMLAnchorElement>("[data-storelib-menu-panel] a[href]")].find((x) => x.textContent === "About")!; a.click() })
      await sleep(400)
      const after = await p.evaluate(() => ({ open: document.querySelector("[data-storelib-menu-panel]")!.getAttribute("data-open"), locked: getComputedStyle(document.documentElement).overflow }))
      check("  a link press shuts it and gives the page its scroll back", after.open === "false" && after.locked !== "hidden", after)

      await p.evaluate(() => document.querySelector(".band-btn")!.scrollIntoView({ block: "center" }))
      await sleep(300)
      await shot(p, "phone-band")
      /* 4. BUTTONS */
      const btn = await p.evaluate(() => {
        const a = document.querySelector<HTMLElement>(".band-btn")!
        const sec = a.closest("section")!
        return { theme: getComputedStyle(document.querySelector(".theme-btn")!).backgroundColor, band: getComputedStyle(a).backgroundColor, label: getComputedStyle(a).color, behind: getComputedStyle(sec).backgroundColor }
      })
      check("BUTTONS: the dark band's button is the site's paper on its ink, never the light blue tint (rgb(143, 176, 255))", btn.band === "rgb(237, 237, 234)" && btn.label === "rgb(20, 20, 20)" && btn.behind === "rgb(20, 20, 20)", btn)
      check("BUTTONS: --theme-primary is the site's own accent (#1f4fd1), never the platform's indigo", btn.theme === "rgb(31, 79, 209)", btn)
      check("  no script errors", errors.length === 0, errors)
      await p.close()

      /* 3 in the canvas: the card is what is locked, and the drawer still fills. */
      {
        const { p: c, errors: ce } = await open(pageFor("always", false), 390, "#canvas")
        await c.click('.qh [data-storelib-menu]')
        await sleep(450)
        const cs = await c.evaluate(() => ({ links: document.querySelectorAll("[data-storelib-menu-panel] [data-storelib-menu-links-list] a").length, card: getComputedStyle(document.getElementById("wb-preview-root")!).overflowY }))
        check("MENU DRAWER (canvas): filled, and the canvas card is locked while it is open", cs.links === 4 && cs.card === "hidden", cs)
        await c.keyboard.press("Escape")
        await sleep(400)
        check("  shut: the card scrolls again", (await c.evaluate(() => getComputedStyle(document.getElementById("wb-preview-root")!).overflowY)) === "auto")
        check("  no script errors", ce.length === 0, ce)
        await c.close()
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
