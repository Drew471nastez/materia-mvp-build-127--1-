/**
 * ===========================================================================
 *  ROUND 11: EXPLORE, THE PRODUCT PAGE AND EVERY BACK
 * ===========================================================================
 * The owner's asks 7 to 13, held from their inputs where they are pure (the
 * push hold of a back, run against a stand in window) and by regex where the
 * thing is a line of a component:
 *
 *   ITEM 7    the categories icon is a plain three row list (a dot and a
 *             line each), at the search glyph's stroke (2), no rect, no
 *             circle, no sliders (Explore's filter button is sliders).
 *   ITEM 8    a product opens at its top: the product page says so
 *             (useLandAtTop in the bar every product page draws), Back and
 *             Forward are left alone, and Explore's restore stops the moment
 *             the address is not Explore's (it went on scrolling the
 *             product), and never scrolls during render.
 *   ITEM 9    no back control changes size or moves on a press: a tint on
 *             the frame the finger lands; a back that is a push is held
 *             until the page has gone, so a late second tap is not a
 *             second push.
 *   ITEM 10   back to Explore: anchoring off while it settles (the 16px
 *             jump), a short fade from 0.55, reduced motion honoured, and a
 *             page from the browser's cache is never left held hidden.
 *   ITEM 11   the community mark has a hairline and a 1px shadow; the price
 *             is 16px.
 *   ITEM 12   the phone header's photo is 34px with the light depth, on
 *             either bar.
 *   ITEM 13   /explore/search: the field's block sits above the rows' pane,
 *             so its shadow is never cut.
 *
 * Measured in a browser by scripts/check-explore-round11.mjs (filmstrips at
 * 4x CPU, scrollY on every frame, the shadow's pixels).
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const code = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

async function main() {
  console.log("\nItem 7: the categories icon")
  {
    const icon = code("components/explore/categories-icon.tsx")
    const button = code("components/explore/search-categories-button.tsx")
    const svg = icon.slice(icon.indexOf("<svg"), icon.indexOf("</svg>"))
    check("three lines, one under the other, 6px apart", /<path d="M9 6h11M9 12h11M9 18h11" \/>/.test(svg))
    check("and a dot at the start of each (zero length strokes, round)", /<path d="M4 6h\.01M4 12h\.01M4 18h\.01" \/>/.test(svg) && /strokeLinecap="round"/.test(svg))
    check("nothing else: no rect, no circle, outline only", !/<rect|<circle/.test(svg) && /fill="none"/.test(svg) && (svg.match(/<path /g) ?? []).length === 2)
    check("drawn at the search glyph's stroke (lucide's Search is 2), by default and from the button", /strokeWidth = 2/.test(icon) && /strokeWidth=\{2\} \/>/.test(button))
    check("not sliders (the filter button under the field is) and not a grid", !/Sliders|LayoutGrid|Grid2X2/.test(svg + button.slice(button.indexOf("export function"))))
  }

  console.log("\nItem 8: a product opens at its top")
  {
    const land = code("lib/navigation/land-at-top.ts")
    const wrapper = code("components/store-builder/discover-sticky-wrapper.tsx")
    const product = code("app/(storelib)/(marketing)/p/[slug]/page.tsx")
    check("every product page draws the bar that asks for it (both layouts)", (product.match(/<DiscoverStickyWrapper>/g) ?? []).length >= 2 && /useLandAtTop\(\)/.test(wrapper))
    check("put at 0 before the first paint", /useLayoutEffect\(\(\) => \{[\s\S]*if \(window\.scrollY !== 0\) window\.scrollTo\(0, 0\)/.test(land))
    check("Back and Forward, a #, a reload are left to the browser", /if \(window\.location\.hash\) return/.test(land) && /if \(traversal\) return/.test(land) && /nav\?\.type === "reload" \|\| nav\?\.type === "back_forward"/.test(land))
    check("a push is told from a traversal by the push itself", /history\.pushState = function/.test(land) && /traversal = false/.test(land) && /addEventListener\("popstate", \(\) => \{\s*traversal = true/.test(land))
    check("a stray scroll is put back for a second from the first frame, and the person's own input ends that at once", /LAND_GUARD_MS = 1000/.test(land) && /\["touchstart", "wheel", "keydown", "pointerdown"\]/.test(land) && /if \(until === Infinity\) until = performance\.now\(\) \+ LAND_GUARD_MS/.test(land))
    const explore = code("lib/explore/use-explore-scroll.ts")
    check("Explore's restore stops when the address is not Explore's any more", /if \(window\.location\.pathname !== path\) return finish\(false\)/.test(explore))
    check("and when a finger, a wheel or a key moves the page, and when Explore unmounts", /\["touchstart", "wheel", "keydown"\] as const/.test(explore) && /return \(\) => finish\(false\)/.test(explore) && /const cancel = restoreScrollPosition\(/.test(explore) && /return cancel/.test(explore))
    const hook = explore.slice(explore.indexOf("export function useExploreScrollRestore"), explore.indexOf("useLayoutEffect(() => {", explore.indexOf("export function useExploreScrollRestore")))
    check("nothing scrolls during Explore's render (it scrolled the product still on screen)", !/primeExploreScrollRestore|scrollTo/.test(hook), hook.slice(0, 120))
    check("the browser side imports no server code", ![land, explore, wrapper].some((s) => /server-only|next\/headers|lib\/supabase\/(server|admin)/.test(s)))
  }

  console.log("\nItem 9: every back, no bump, one navigation")
  {
    const backControl = code("components/navigation/back-control.tsx")
    const crumb = code("components/product/discover-back-breadcrumb.tsx")
    const profile = code("components/profile/profile-top-bar.tsx")
    const bar = code("components/store-builder/product-creator-bar.tsx")
    const barBack = bar.slice(bar.indexOf("function BackControl("), bar.indexOf("</a>", bar.indexOf("function BackControl(")))
    const chevron = profile.slice(profile.indexOf("export function BackChevron"), profile.indexOf("export function TopBarBack"))
    const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    for (const [name, src] of [["BackControl", backControl], ["the product's \"< Explore\"", crumb], ["the profile bar's chevron", chevron], ["the creator bar's arrow", barBack]] as const) {
      check(`${name}: no scale on a press`, !/scale-\[|scale\(|bar-control-pressed|transition-\[[^\]]*scale/.test(noComments(src)))
    }
    check("BackControl: a darker ground and hairline on the frame the finger lands, eased back on the lift", /data-\[pressed\]:border-\[#dcdfe4\] data-\[pressed\]:bg-\[#eceef1\] data-\[pressed\]:duration-0/.test(backControl) && /transition-\[background-color,border-color\] duration-200 ease-out/.test(backControl))
    check("\"< Explore\": a tint and the ink darkening", /data-\[pressed\]:bg-\[#1a1a2e\]\/\[0\.07\] data-\[pressed\]:text-\[#1a1a2e\] data-\[pressed\]:duration-0/.test(crumb))
    check("the creator bar's arrow: its disc at full size, 16% on the press, no keyframe", /pressed\s*\?\s*"opacity-\[0\.16\] duration-0"/.test(barBack) && !/bar-control-disc/.test(barBack))
    check("press feedback still writes the DOM, not state", /setAttribute\("data-pressed", ""\)/.test(code("lib/navigation/press-feedback.ts")))
    check("BackControl's pushed fallback goes through the one hold", /pushBackOnce\(fallback, \(to\) => router\.push\(to\)\)/.test(backControl))

    /* The hold itself, run: a stand in window whose page has not gone yet. */
    const w = {
      location: { pathname: "/p/product-1" },
      addEventListener() {},
      removeEventListener() {},
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number,
      clearTimeout: (id: number) => clearTimeout(id),
    }
    ;(globalThis as unknown as { window: unknown }).window = w
    const go = await import("@/lib/navigation/go-back")
    go.resetBackHold()
    const pushed: string[] = []
    const t0 = Date.now()
    check("the first press pushes", go.pushBackOnce("/maker1", (h) => pushed.push(h)) && pushed.length === 1)
    check("a second press 600ms later, the page still here, does not", !go.backInFlight(t0 - 10_000) || go.backInFlight(t0 + 600))
    check("so a late second tap is not a second push", !go.pushBackOnce("/maker1", (h) => pushed.push(h)) && pushed.length === 1, pushed)
    w.location.pathname = "/maker1"
    check("once the page has gone, the hold lets go (past the 400ms of a double tap)", !go.backInFlight(t0 + go.BACK_HOLD_MS + 1))
    w.location.pathname = "/p/product-1"
    go.resetBackHold()
    go.pushBackOnce("/maker1", () => {})
    check("and a push that never lands lets go after PUSH_HOLD_MS", go.PUSH_HOLD_MS === 3000 && go.backInFlight(Date.now() + 1000) && !go.backInFlight(Date.now() + go.PUSH_HOLD_MS + 1))
    go.resetBackHold()
  }

  console.log("\nItem 10: back to Explore, still and then a gentle fade")
  {
    const css = code("app/globals.css")
    const explore = code("lib/explore/use-explore-scroll.ts")
    const boot = code("lib/explore/explore-scroll-boot.ts")
    check("no scroll anchoring while Explore settles (it nudged the page 16px, then the restore pulled it back)", /html\.explore-scroll-settling \{\s*overflow-anchor: none;/.test(css) && /html\.explore-scroll-settling body \{\s*overflow-anchor: none;/.test(css))
    check("a short fade from 0.55, never from nothing", /@keyframes explore-return \{\s*from \{ opacity: 0\.55; \}\s*to \{ opacity: 1; \}/.test(css) && /animation: explore-return 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both;/.test(css))
    /* Round 25: the fade is the reveal's alone (html.explore-scroll-revealing), for a return that was seen hidden; tests/explore25. */
    check("reduced motion: no fade", /@media \(prefers-reduced-motion: reduce\) \{\s*html\.explore-scroll-revealing \.explore-ground \{\s*animation: none;/.test(css))
    check("held hidden only while the page is too short to stand at the place", /if \(scrollToSaved\(target\)\) return true\s*\n\s*setExploreHold\(true\)/.test(explore) && /html\.explore-scroll-restoring \.explore-ground \{[^}]*animation: none;/.test(css))
    check("the fade starts as the page shows, also after a hold", /root\.classList\.remove\(REVEAL_CLASS\)\s*\n\s*void root\.offsetWidth/.test(explore))
    check("the settle ends by itself", /EXPLORE_SETTLE_MS = 420/.test(explore))
    const script = boot.match(/= `([\s\S]*)`/)?.[1] ?? ""
    let parses = true
    try {
      new Function(script)
    } catch {
      parses = false
    }
    check("a page from the browser's cache only has any hold taken off (it stayed hidden)", parses && /if\(!e\.persisted\)return;document\.documentElement\.classList\.remove\(H\)/.test(script) && !/e\.persisted\|\|/.test(script))
  }

  console.log("\nItem 11: the community card")
  {
    const card = code("components/explore/community-card.tsx")
    check("the mark: a 1px hairline ring and a 1px soft shadow", /const MARK_DEPTH = "shadow-\[0_0_0_1px_rgba\(16,24,40,0\.07\),0_1px_2px_rgba\(16,24,40,0\.1\)\]"/.test(card) && /const MARK_CLASS = `h-12 w-12 rounded-\[12px\] \$\{MARK_DEPTH\}`/.test(card))
    check("and the empty cover's big mark the same", /className=\{`h-\[72px\] w-\[72px\] rounded-\[16px\] \$\{MARK_DEPTH\}`\}/.test(card))
    check("the price (or Free) is 16px", /text-\[16px\] font-semibold leading-\[22px\] text-foreground" data-community-price=""/.test(card))
  }

  console.log("\nItem 12: the phone header's photo")
  {
    const header = code("components/platform/platform-header-client.tsx")
    const block = header.slice(header.indexOf('data-phone-header-avatar=""'), header.indexOf('data-phone-header-avatar=""') + 600)
    check("34px (it was 32)", /size=\{34\}/.test(block))
    check("a hairline ring and a 1px soft shadow on the light bar, and its own on the dark one", /buyerHeaderLight\s*\?\s*"shadow-\[0_0_0_1px_rgba\(16,24,40,0\.08\),0_1px_2px_rgba\(16,24,40,0\.14\)\]"\s*:\s*"shadow-\[0_0_0_1px_rgba\(255,255,255,0\.16\),0_1px_2px_rgba\(0,0,0,0\.5\)\]"/.test(block))
    check("no border taking a pixel off the photo", !/border border-gray-200/.test(block))
  }

  console.log("\nItem 13: /explore/search, the field's shadow")
  {
    const screen = code("components/search/search-screen.tsx")
    check("the field's block sits above the rows' pane", /className="relative z-\[1\] shrink-0 px-4 sm:px-6"/.test(screen))
    check("the rows' pane has no z-index of its own to beat it", /className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-2\.5 sm:px-4"/.test(screen))
  }

  console.log("\nHouse rules")
  {
    const mine = [
      "components/explore/categories-icon.tsx", "components/explore/search-categories-button.tsx", "components/explore/community-card.tsx",
      "lib/navigation/land-at-top.ts", "lib/navigation/go-back.ts", "lib/explore/use-explore-scroll.ts", "lib/explore/explore-scroll-boot.ts",
      "components/navigation/back-control.tsx", "components/product/discover-back-breadcrumb.tsx", "components/store-builder/discover-sticky-wrapper.tsx",
      "components/search/search-screen.tsx", "scripts/check-explore-round11.mjs", "scripts/render-explore-round11.tsx",
    ]
    const offenders = mine.filter((f) => /—/.test(code(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(code(f).replace(/transition-transform|cs\.transform\b/g, "")))
    check("no em dash and no banned word", offenders.length === 0, offenders)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
