/**
 * Round AK: what the owner asked for after round AJ, checked in one place.
 *
 *   SIDEBAR     the app's groups open with their page and close when you leave, a quiet bar that never moves the rows
 *   OPEN APP    the "Open in Storelib" card: not on storelib.com's front doors for a visitor who is not signed in, one slim row
 *   ONBOARDING  becoming a seller over the stores people build, with the Storelib mark
 *   CARRIERS    real logos where the tiles were initials
 *   SPEED       the Performance page in plain words, wider on a big screen
 *   BUILDER     Add section without the bump, App embeds beside the search and working, Edit in the open scheme list,
 *               going into a section reads as going in, the sidebar's bar fades with the pointer
 *   AI          "a new FAQ" beside an existing FAQ is a new section, first on the page; a section written into an
 *               imported theme gets its schemes, type and width
 *
 * Run with:  npm run test:push
 */
import { readFileSync, existsSync, statSync } from "node:fs"
import { groupForRoute } from "@/components/app/sidebar-desktop-nav"
import { handoffCard, isFrontDoor } from "@/lib/platform/open-in-app"
import { routeByRules } from "@/lib/website-builder/agent/router"
import { writingAnchor, placeWrittenSection } from "@/lib/website-builder/ai-placement"
import { nativeThemeFromShopifySchemes } from "@/lib/storelib-theme/compat/native-schemes"
import { resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { importedThemeNote } from "@/lib/website-builder/agent/write-section"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const src = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const INSTAGRAM_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone14,5; iOS 17_4; en_US; en; scale=3.00; 1170x2532; 600000000)"

async function main() {
  console.log("\nThe app's sidebar")
  {
    const items = [
      { href: "/app" },
      { href: "/app/products", children: [{ href: "/app/products/collections" }, { href: "/app/coupons" }, { href: "/app/files" }] },
      { href: "/app/analytics" },
      { href: "/app/integrations", children: [{ href: "/app/integrations?integration=klaviyo" }] },
    ]
    check("Products opens on its own page", groupForRoute(items, "/app/products") === "/app/products")
    check("and on one of its rows (Coupons), after a refresh too", groupForRoute(items, "/app/coupons") === "/app/products")
    check("Analytics has no group: every group folds", groupForRoute(items, "/app/analytics") === null)
    check("an integration's page opens Integrations", groupForRoute(items, "/app/integrations", "integration=klaviyo") === "/app/integrations")
    const shell = code("components/app/sidebar.tsx")
    check("the open group follows the page shown, set while rendering (no frame with the old one open)", /groupForRoute\(navItems, shownPath, shownSearch\)/.test(shell) && /if \(groupFor !== routeGroup\)/.test(shell))
    const nav = code("components/app/sidebar-desktop-nav.tsx")
    check("a folded list is out of the Tab order", /inert=\{!open\}/.test(nav) && /inert=\{!open\}/.test(code("components/app/sidebar-mobile-nav.tsx")))
    /* Round Z7: the platform's bar is hidden and a thumb is drawn over the edge, so there is no column to keep and opening a group cannot narrow the rows. */
    check("the nav's bar takes no width, so opening a group never narrows the rows", /\.sidebar-nav \{[\s\S]*?scrollbar-width: none/.test(src("app/globals.css")) && /pl-\[7px\] pr-\[7px\]/.test(nav) && /<SidebarScrollThumb target=\{navRef\} \/>/.test(nav))
    check("the bar fades in and out with the pointer", /\[data-nav-scroll-frame\]:hover > \[data-nav-thumb\]\[data-scrollable\]/.test(src("app/globals.css")) && /transition: opacity 420ms/.test(src("app/globals.css")))
  }

  console.log("\nThe Open in Storelib card")
  {
    check("storelib.com's front doors", isFrontDoor("/") && isFrontDoor("/explore") && isFrontDoor("/explore/music") && !isFrontDoor("/@andrew") && !isFrontDoor("/p/sample-pack"))
    check("not asked of a visitor who is not signed in, on the home page", handoffCard({ ua: INSTAGRAM_IOS, path: "/", signedIn: false }) === null)
    check("nor on Explore", handoffCard({ ua: INSTAGRAM_IOS, path: "/explore", signedIn: false }) === null)
    check("the route reads only whether a sign in is there", /signedIn: carriesSignIn\(jar\.getAll\(\)\.map\(\(c\) => c\.name\)\)/.test(code("app/api/app-links/in-app-browser/route.ts")))
    const card = code("components/platform/open-in-app-card.tsx")
    check("one slim row: the mark, the words, Open and a close", /max-w-\[360px\]/.test(card) && /StorelibLogo size=\{32\}/.test(card) && /aria-label="Keep reading here"/.test(card) && !/h-11 flex-1/.test(card))
  }

  console.log("\nBecoming a seller")
  {
    const ob = code("components/app/creator-onboarding-modal.tsx")
    check("the stores people build, across the window, under a vignette", /url\(\/images\/onboarding\/seller-ground\.webp\)/.test(ob) && /radial-gradient\(ellipse_at_50%_50%/.test(ob) && existsSync("public/images/onboarding/seller-ground.webp"))
    check("the Storelib mark at the top left", /data-onboarding-ground-mark=""/.test(ob) && /fixed left-7 top-6/.test(ob) && /<GroundMark open=\{open\} \/>/.test(ob))
  }

  console.log("\nCarriers")
  {
    const real = ["blue-dart", "bpost", "ceska-posta", "correios", "elta", "estafeta", "magyar-posta", "singpost", "sendle", "seur", "sf-express"]
    check("eleven more carriers drawn by their own logo, not their initials", real.every((id) => existsSync(`public/carriers/${id}.webp`) && statSync(`public/carriers/${id}.webp`).size > 700))
  }

  console.log("\nPerformance")
  {
    const p = code("components/website-builder/website-settings/performance.tsx")
    check("Loading, Responsiveness, Visual stability, Google's names small beside", /tt\("Loading"\)/.test(p) && /tt\("Responsiveness"\)/.test(p) && /tt\("Visual stability"\)/.test(p) && /\{plainName\(metric\)\}/.test(p))
    check("one sentence for the page", /overallLine\(overall\)/.test(p) && /tt\("Fast for most visitors"\)/.test(p))
    check("the smaller measures fold under More measures", /data-perf-more=""/.test(p) && /\{more && \(/.test(p))
    check("wider on a big screen", /section === "performance" && "xl:max-w-\[1040px\]"/.test(code("components/website-builder/project-settings.tsx")))
  }

  console.log("\nThe builder")
  {
    const lib = code("components/website-builder/editor/section-library.tsx")
    check("App embeds is a button beside the search, on a phone above it at the right", /\{embedsButton\}\s*<div className="w-\[260px\]/.test(lib) && /<h2 className="min-w-0 flex-1 truncate[^>]*>\{tt\("Add a section"\)\}<\/h2>\s*\{embedsButton\}/.test(lib))
    check("and finds Storelib Reviews' sections in an imported theme too", /own_ && !schema\.imported \? undefined : appForSection\(type\)\?\.app/.test(lib))
    check("its apps as words, no icons", /data-app-embeds=""/.test(lib) && !/ICON_MAP\[app\.icon\][\s\S]{0,400}data-app-embed=\{app\.id\}/.test(lib))
    check("opening asks nothing heavy of the entrance", /startTransition\(\(\) => setBuilt\(true\)\)/.test(lib) && /OPEN_SETTLE_MS/.test(lib))
    const scheme = code("components/website-builder/editor/controls/color-scheme-control.tsx")
    check("the closed scheme field is a plain selector, Edit only in the open list", /<ChevronDown className=\{cn\("h-3\.5 w-3\.5 shrink-0/.test(scheme) && /onEdit\(s\.id\)/.test(scheme) && !/absolute right-1\.5 top-1\/2/.test(scheme))
    check("going into a section on a computer reads as going in", /className="h-full wb-desk-panel"/.test(code("app/website-builder/editor/[installId]/page.tsx")) && /@keyframes wb-desk-in/.test(src("app/globals.css")))
    const rail = code("components/website-builder/editor/slim-scroll-rail.tsx")
    check("the sidebar's bar stays while the pointer is in it and glides out after", /let inside = false/.test(rail) && /fadeLater\(OUT_MS\)/.test(rail) && /w-\[4px\]/.test(rail))
  }

  console.log("\nStorelib AI")
  {
    const faq = { type: "faq", name: "FAQ" }
    const base = { images: 0, selection: null, scoped: false, bodySections: 3, addable: [faq] }
    const fresh = routeByRules({ ...base, prompt: "create me a new faq section, something completely different", onPage: [faq] })
    check("a new FAQ beside the page's FAQ is a new section (it rewrote the old one)", fresh.agent === "writer" && fresh.target === "section", fresh)
    const different = routeByRules({ ...base, prompt: "add a faq section with a different design", onPage: [] })
    check("so is one asked to look different", different.agent === "writer", different)
    const plain = routeByRules({ ...base, prompt: "add a faq section", onPage: [] })
    check("a FAQ the page does not have yet is still the theme's own", plain.agent === "page", plain)
    const page = [{ id: "header", type: "header", settings: {} }, { id: "hero", type: "hero", settings: {} }, { id: "faq", type: "faq", settings: {} }, { id: "footer", type: "footer", settings: {} }] as never
    const ids = (list: { id: string }[]) => list.map((s) => s.id).join(",")
    const s = (id: string) => ({ id, type: "x", settings: {} }) as never
    check("a section the AI writes goes first on the page", ids(placeWrittenSection(page, writingAnchor(page, { selectedId: "hero" }), s("new"))) === "header,new,hero,faq,footer")
    check("unless it was asked to go under the open one", ids(placeWrittenSection(page, writingAnchor(page, { selectedId: "hero", prompt: "add a section below this" }), s("new"))) === "header,hero,new,faq,footer")
    check("or at the end", ids(placeWrittenSection(page, writingAnchor(page, { prompt: "add it at the end of the page" }), s("new"))) === "header,hero,faq,new,footer")
    check("the decision is told what is on the page", /onPage: body\.sections\.filter/.test(code("app/api/website-builder/themes/[installId]/agent/decide/route.ts")))

    const shopify = { "scheme-1": { settings: { background: "#FFFFFF", text: "#121212", button: "#1A1A2E", button_label: "#FFFFFF" } }, "scheme-2": { settings: { background: "#111111", foreground: "#FAFAFA", primary_button_background: "#E11D48", primary_button_text: "#FFFFFF" } } }
    const theme = nativeThemeFromShopifySchemes(shopify)
    const two = resolveSectionColors(theme, { color_scheme: "scheme-2" })
    check("an imported theme's scheme is the scheme a Storelib section draws", two.key === "scheme-2" && two.scheme.background.toLowerCase() === "#111111" && two.scheme.text.toLowerCase() === "#fafafa" && two.scheme.primary_button_background.toLowerCase() === "#e11d48", two.scheme)
    const one = resolveSectionColors(theme, { color_scheme: "scheme-1" })
    check("Dawn's names too (text, button, button_label)", one.scheme.text.toLowerCase() === "#121212" && one.scheme.primary_button_background.toLowerCase() === "#1a1a2e")
    check("a section with no scheme takes the theme's first", resolveSectionColors(theme, {}).key === "scheme-1")
    check("and the theme drawn is the theme's (not an empty one)", /theme: this\.nativeTheme\(\)/.test(code("lib/storelib-theme/compat/theme.ts")) && !/theme: \{\},/.test(code("lib/storelib-theme/compat/theme.ts")))
    check("with the theme's fonts and width", /--font-heading-family/.test(code("lib/storelib-theme/compat/theme.ts")) && /"--theme-page-width": "var\(--page-width/.test(code("lib/storelib-theme/compat/theme.ts")))
    const note = importedThemeNote({ color_schemes: shopify, type_header_font: "assistant_n4", page_width: 1200, spacing_sections: 36, buttons_radius: 6 })
    check("the writer is told the schemes by the ids the sidebar saves", /- scheme-1: background #FFFFFF/.test(note) && /"default": "scheme-1"/.test(note) && /var\(--scheme-background\)/.test(note))
    check("and the type, the width and the buttons", /the theme's assistant/.test(note) && /\(1200px\)/.test(note) && /corners of 6px/.test(note))
    check("for an imported theme, that is what it reads", /opts\.importedTheme \? importedThemeNote\(/.test(code("lib/website-builder/agent/write-section.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
