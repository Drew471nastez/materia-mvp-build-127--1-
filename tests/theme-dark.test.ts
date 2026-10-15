/**
 * ===========================================================================
 *  ROUND 27: LIGHT AND DARK, THE PERSON'S, ON STORELIB'S OWN PAGES
 * ===========================================================================
 * The owner: the switch is next to the bell in a community's bar on a
 * computer and a row of the account menu everywhere, it is kept for the
 * account, it applies to Explore, the account, its library and settings and
 * every community, never to the dashboard; and the dark look is premium
 * charcoal with no white hovers, pills or borders anywhere.
 *
 * What is measured in a browser is in scripts/check-community-round27.mjs and
 * scripts/check-dark-pages.mjs. Here: where it applies, how it is kept, and
 * that the generated stylesheet is current with the sources it was written from.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

async function main() {
  const site = await import("../lib/appearance/site-appearance")

  section("Where the look applies")
  for (const p of ["/explore", "/explore/search", "/account", "/account/library", "/account/settings", "/community/clay-studio", "/community/clay-studio/members", "/u/maria", "/wishlist"]) check(`${p} follows the person's look`, site.themedPath(p))
  for (const p of ["/", "/app", "/app/community/clay-studio/feed", "/app/settings", "/checkout/site", "/@maria", "/maria", "/accounting", "/communityx", "/sell", "/login"]) check(`${p} never does`, !site.themedPath(p))
  /* Changed on purpose (round 30): the owner, "in dark mode I open a product from Explore and it is light". The product
     page follows the look: /p/<slug>, and /<handle>/<slug>, the address Explore's cards hand out (lib/url-helpers). A
     creator's own scheme on it keeps its look (data-own-look, checked below). */
  for (const p of ["/p/glaze-notes", "/maria/glaze-notes"]) check(`round 30: the product page ${p} follows the person's look`, site.themedPath(p))
  for (const p of ["/maria/links", "/app/products", "/checkout/site", "/blog/a-post", "/sitemap/products.xml", "/@maria/x", "/maria/glaze-notes/reviews", "/legal/terms"]) check(`round 30: ${p} is not a product and never does`, !site.themedPath(p))

  section("The first paint")
  const boot = site.APPEARANCE_BOOT
  check("the boot reads this browser's choice, and round 26's key once", boot.includes(JSON.stringify(site.APPEARANCE_KEY)) && boot.includes(JSON.stringify(site.LEGACY_APPEARANCE_KEY)))
  check("it puts the dark attribute and the dark colour scheme on <html>", boot.includes(JSON.stringify(site.DARK_ATTR)) && boot.includes('colorScheme="dark"'))
  check("it carries the same list of pages as themedPath", boot.includes(JSON.stringify(site.THEMED_PREFIXES)))
  /* The boot run against a stand in document, for one page that follows the look and one that does not. */
  const run = (path: string, stored: string | null) => {
    const attrs = new Map<string, string>()
    const style: Record<string, string> = {}
    const g = globalThis as unknown as Record<string, unknown>
    const before = { localStorage: g.localStorage, location: g.location, document: g.document }
    g.localStorage = { getItem: (k: string) => (k === site.APPEARANCE_KEY ? stored : null) }
    g.location = { pathname: path }
    g.document = { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), style } }
    try {
      new Function(boot)()
    } finally {
      Object.assign(g, before)
    }
    return { dark: attrs.has(site.DARK_ATTR), scheme: style.colorScheme }
  }
  check("dark chosen, on Explore: dark before the first paint", run("/explore", "dark").dark && run("/explore", "dark").scheme === "dark")
  check("dark chosen, in the dashboard: light", !run("/app/orders", "dark").dark)
  check("round 30: dark chosen, on a product: dark before the first paint; on a platform page of two segments: light", run("/maria/glaze-notes", "dark").dark && run("/p/glaze-notes", "dark").dark && !run("/blog/a-post", "dark").dark && !run("/maria/links", "dark").dark)
  check("round 30: the boot carries the same platform words as productAddress", boot.includes(JSON.stringify(site.PLATFORM_FIRST_SEGMENTS)))
  check("light chosen, or nothing chosen: light", !run("/account", "light").dark && !run("/account", null).dark)

  section("Kept for the account")
  const route = read("app/api/account/appearance/route.ts")
  check("the account keeps it in the person's own metadata, written with their own session", /supabase\.auth\.updateUser\(\{ data: \{ storelib_appearance: body\.appearance \} \}\)/.test(route) && !/createAdminClient/.test(route))
  check("only light or dark is accepted", /if \(!isAppearance\(body\.appearance\)\)/.test(route))
  const client = read("lib/appearance/client.ts")
  check("a choice is this browser's at once, the account's behind it", /swap\(\(\) => store\(next\)\)\s*void fetch\("\/api\/account\/appearance", \{\s*method: "PUT"/.test(client))
  const root = read("components/platform/site-appearance.tsx")
  check("once per tab, the account's choice is read and taken when it differs", /sessionStorage\.getItem\(SYNCED\)/.test(root) && /adoptAccountAppearance\(d\?\.appearance\)/.test(root))
  check("the look is put on <html> in a layout effect on every move, so the dashboard is light on its first frame", /useLayoutEffect\(\(\) => paintAppearance\(pathname, choice, pageDefault\), \[pathname, choice, pageDefault\]\)/.test(root))
  const layout = read("app/layout.tsx")
  check("the root prints the boot in <head> and mounts the painter", /<script dangerouslySetInnerHTML=\{\{ __html: APPEARANCE_BOOT \}\} \/>/.test(layout) && /<SiteAppearance \/>/.test(layout) && /import "\.\/theme-dark\.css"/.test(layout))

  section("Where the switch is")
  const menu = read("components/platform/platform-header-client.tsx")
  check("a row of the account menu on a computer and of the account sheet on a phone", (menu.match(/<AppearanceMenuRow /g) || []).length === 2)
  check("the name at the top of the menu opens the profile", /<Link \{\.\.\.go\("\/account"\)\} role="menuitem"[^>]*data-account-who="">/.test(menu))
  const bar = read("components/community/member/top-bar.tsx")
  check("in a community's bar, the sun and moon sits just before the bell, on a computer", /<AppearanceButton className="hidden md:grid" \/>\s*\{me \? <NotificationBell/.test(bar))
  const cMenu = read("components/community/member/account-menu.tsx")
  check("the community's menu opens from the person's picture, not a \"...\"", /avatarSize=\{36\}/.test(cMenu) && !/trigger="more"/.test(cMenu) && !/MoreHorizontal/.test(cMenu))

  section("The dark look")
  let current = true
  try {
    execFileSync(process.execPath, ["scripts/gen-theme-dark.mjs", "--check"], { stdio: "pipe" })
  } catch {
    current = false
  }
  check("app/theme-dark.css is current with the sources (node scripts/gen-theme-dark.mjs)", current)
  const css = readFileSync(join(process.cwd(), "app/theme-dark.css"), "utf8")
  check("charcoal steps, never pure black", /--sl-page: #111113/.test(css) && !/background-color: #000(000)?;/.test(css))
  check("every rule is scoped to the dark look (html[data-sl-dark] or a dark community frame)", css.split("\n").filter((l) => /^\s*[.:[a-z].*\{/.test(l) && !/^\s*(@media|to \{)/.test(l)).every((l) => /data-sl-dark|data-community-theme="dark"|data-theme-swap/.test(l)))
  check("a hover in the account menu becomes a dark step, not white", /\.hover\\:bg-\\\[\\#f4f5f7\\\]:hover \{ background-color: #25252a; \}/.test(css))
  check("a chosen near black pill becomes graphite, its words stay light", /\.bg-\\\[\\#1a1a2e\\\] \{ background-color: #2d2d33; \}/.test(css) && !/\.text-white \{/.test(css))
  check("hairlines become faint light lines, not white borders", /\.border-\\\[\\#e5e7eb\\\]\\\/60 \{ border-color: rgba\(255,255,255,0\.0\d+\); \}/.test(css))
  check("hovers only for a mouse, as the app's own hover variant", /@media \(hover: hover\) and \(pointer: fine\) \{/.test(css))
  /* Changed on purpose (round 28): the owner found the switch laggy. It no longer starts a transition on every
     element (html.sl-theme-switching *); one still of the old page fades over the new one. */
  check("the switch is one still fading away, never a transition on every element", !/sl-theme-switching/.test(css) && /html\[data-theme-swap\]::view-transition-old\(root\) \{[^}]*animation: sl-theme-out 220ms/.test(css))
  check("the status bar band is the dark header's surface and the bounce the dark page", /--native-band: #18181b/.test(css) && /--bounce-ground: #111113/.test(css))
  check("a member's profile page is dark too", /\[data-member-profile\]/.test(css))
  const swapSrc = read("lib/appearance/client.ts")
  check("the look is on <html> and every reader rendered inside the same still", /paintAppearance\(window\.location\.pathname, next, pageDefault\)\s*flushSync\(/.test(swapSrc) && /startViewTransition\(/.test(swapSrc) && /prefers-reduced-motion: reduce/.test(swapSrc))
  check("the still lasts as long as the stylesheet's fade", /SWITCH_MS = 220/.test(swapSrc))
  const chrome = read("components/platform/native-chrome.tsx")
  check("the native status bar re-reads its colour when the look changes", /"data-sl-dark"/.test(chrome))
  for (const [f, re] of [
    ["components/nav/buyer-tab-bar.tsx", /var\(--sl-tab-on, #1a1a2e\)/],
    ["components/search/search-screen.tsx", /var\(--sl-ink-strong, #1a1a2e\)/],
    ["components/community/member/arrive.ts", /var\(--sl-arrive, #fdf8ec\)/],
  ] as const) check(`${f}: an inline colour keeps its light value and has a dark one`, re.test(read(f)))
  const product = read("app/(marketing)/p/[slug]/page.tsx")
  check("round 30: a product page with the creator's own look keeps it, the platform's default page follows the person's", /data-own-look=\{ownLook \? "" : undefined\}/.test(product) && /data-product-look=\{ownLook \? undefined : "site"\}/.test(product) && /productPageTone\(productPageConfig, \{ site: !ownLook \}\)/.test(product) && (product.match(/__html: OWN_LOOK_BOOT/g) || []).length === 2)
  const tone = await import("../lib/store-builder/product-page-tone")
  check("round 30: no config, or the default scheme with nothing of the creator's, is Storelib's look", !tone.productHasOwnLook(null) && !tone.productHasOwnLook({ globalSettings: { themePreset: "default" }, globalColors: { backgroundColor: "#ffffff" }, headerSettings: {} }))
  check("round 30: a scheme, a page colour, colours of their own or an arranged page are the creator's look", tone.productHasOwnLook({ globalSettings: { themePreset: "sage" } }) && tone.productHasOwnLook({ globalColors: { backgroundColor: "#f4efe6" } }) && tone.productHasOwnLook({ headerSettings: { buyButtonColor: "#111111" } }) && tone.productHasOwnLook({}, true))
  check("round 30: Storelib's look on a product page has no scheme colours of its own, so the design system's tokens draw it", tone.productPageTone(null, { site: true }).themeConfig === undefined && tone.productPageTone(null).themeConfig !== undefined)

  section("Into the dashboard from the dark look (round 30)")
  check("the tab remembers the look it painted last", /window\.sessionStorage\.setItem\(LOOK_NOW_KEY, dark \? "dark" : "light"\)/.test(client))
  check("an /app document after a dark page opens under the veil, from <head>", site.APP_FROM_DARK_BOOT.includes(JSON.stringify(site.LOOK_NOW_KEY)) && site.APP_FROM_DARK_BOOT.includes(JSON.stringify(site.APP_FROM_DARK_CLASS)) && /<script dangerouslySetInnerHTML=\{\{ __html: APP_FROM_DARK_BOOT \}\} \/>/.test(layout))
  check("the veil fades off once the shell is on the screen", /classList\.remove\("app-arriving"\)\s*revealAppFromDark\(\)/.test(read("components/app/app-layout-wrapper.tsx")))
  const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
  check("the veil is the header's colour and fades on opacity alone, the time the script waits", /html\.app-from-dark::after \{[^}]*background-color: #111111;[^}]*transition: opacity 240ms/.test(globals) && /html\.app-from-dark\.app-from-dark-out::after \{\s*opacity: 0;/.test(globals) && site.APP_FROM_DARK_MS === 240)
  const veil = (path: string, look: string | null) => {
    const classes = new Set<string>()
    const g = globalThis as unknown as Record<string, unknown>
    const before = { sessionStorage: g.sessionStorage, location: g.location, document: g.document, setTimeout: g.setTimeout }
    g.sessionStorage = { getItem: () => look }
    g.location = { pathname: path }
    g.document = { documentElement: { classList: { add: (...c: string[]) => c.forEach((x) => classes.add(x)), remove: () => {}, contains: (c: string) => classes.has(c) } } }
    g.setTimeout = () => 0
    try {
      new Function(site.APP_FROM_DARK_BOOT)()
    } finally {
      Object.assign(g, before)
    }
    return classes.has(site.APP_FROM_DARK_CLASS)
  }
  check("only on /app, and only after a dark page in this tab", veil("/app", "dark") && veil("/app/orders", "dark") && !veil("/app", "light") && !veil("/app", null) && !veil("/explore", "dark"))

  check("a creator's page under /u/ keeps its own look", /data-own-look=""/.test(read("app/(marketing)/u/[username]/page.tsx")) && site.themedPath("/member/maya"))
  const sw = read("components/platform/appearance-switch.tsx")
  check("pressed, the button and the knob give a little", /active:scale-\[0\.9\]/.test(sw) && /group-active\/appearance:scale-\[0\.85\]/.test(sw))

  /*
    Changed on purpose (round 31): a library row's Download was "too light, washed grey, especially in dark". Its calm
    secondary and the composer's Leave carry their colours as variables, and the dark look sets its own for them here
    (measured in scripts/check-library-round31.mjs: words 12.3:1, ground 1.22:1 and edge 1.47:1 on the dark card).
  */
  section("A row's calm secondary and a quiet Leave (round 31)")
  const ui = read("components/library/library-ui.ts")
  check("the row's button reads its colours from --sl-btn2-*, white on a real hairline in the light look", /bg-\[var\(--sl-btn2,#ffffff\)\]/.test(ui) && /border-\[color:var\(--sl-btn2-line,#cfd4dc\)\]/.test(ui) && /text-\[color:var\(--sl-btn2-ink,#1a1a2e\)\]/.test(ui))
  check("the dark look gives it a graphite surface above the card, a hairline that reads, and its own hover and press", /--sl-btn2: #29292e;/.test(css) && /--sl-btn2-hover: #313137;/.test(css) && /--sl-btn2-press: #222226;/.test(css) && /--sl-btn2-line: rgba\(255,255,255,0\.13\);/.test(css) && /--sl-btn2-ink: #ececee;/.test(css))
  check("and Leave a faint red ground, a red hairline and light red words", /--sl-danger-soft: rgba\(240,68,56,0\.14\);/.test(css) && /--sl-danger-ink: #ffa198;/.test(css) && /bg-\[var\(--sl-danger-soft,#fef3f2\)\]/.test(read("components/community/member/composer.tsx")))
  check("the leave dialog's scrim is an rgba the dark look leaves alone, not a hex it turns into a grey haze", /bg-\[rgba\(15,17,21,0\.4\)\]/.test(read("components/community/member/composer.tsx")) && !/bg-\[#0f1115\]\/40/.test(read("components/community/member/composer.tsx")))
  check("the app's download bar is ink on its track in both looks", /bg-\[var\(--sl-course-ink,#1a1a2e\)\]/.test(read("components/downloads/download-tray.tsx")) && /bg-\[var\(--sl-course-track,#eef0f3\)\]/.test(read("components/downloads/download-tray.tsx")))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
