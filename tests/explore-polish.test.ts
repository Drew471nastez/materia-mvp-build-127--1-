/**
 * ===========================================================================
 *  EXPLORE AND THE PUBLIC PAGES: THE POLISH ROUND
 * ===========================================================================
 * Seven asks, each held here:
 *
 *   1. the header has a little depth on a computer, none added on a phone
 *   2. Explore's footer on a computer is as wide as the header
 *   3. the photo beside Dashboard has a hairline ring and a soft shadow
 *   4. a product opened from Explore has its back above the pictures on a
 *      computer too, and with nothing behind it goes to Explore
 *   5. Explore can never be left blank: the hide that waits for the scroll
 *      to be put back always ends, and a Back is seen for what it is
 *   6. Back to Explore comes to the same place: the scroll per page, the
 *      price, the order and the page of the list in the address, the
 *      communities paged with Show more kept
 *   7. a community opened from Discover lands as an /app page does
 *
 * Item 5 is run for real against a stand-in window (the module under test
 * and the boot script both), the rest are read from the source.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/* Code only: the comments explain what the code used to do. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ── A stand-in browser, enough for lib/explore/use-explore-scroll and the boot script ── */
type Listener = (e: { persisted?: boolean; type: string }) => void
function makeBrowser(opts: { path: string; navType: string; store?: Record<string, string> }) {
  const listeners = new Map<string, Listener[]>()
  const classes = new Set<string>()
  const store = new Map(Object.entries(opts.store ?? {}))
  const timers: { fn: () => void; ms: number }[] = []
  const location = { pathname: opts.path, origin: "https://storelib.com", href: `https://storelib.com${opts.path}` }
  const window = {
    location,
    addEventListener: (t: string, f: Listener) => listeners.set(t, [...(listeners.get(t) ?? []), f]),
    removeEventListener: () => {},
    setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length },
    clearTimeout: () => {},
    scrollTo: () => {},
    scrollY: 0,
    innerHeight: 800,
  }
  const document = {
    documentElement: {
      classList: {
        add: (c: string) => void classes.add(c),
        remove: (c: string) => void classes.delete(c),
        contains: (c: string) => classes.has(c),
        toggle: (c: string, on?: boolean) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); return classes.has(c) },
      },
      scrollHeight: 10000,
    },
  }
  const sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  }
  const performance = {
    getEntriesByType: (t: string) => (t === "navigation" ? [{ type: opts.navType, name: `https://storelib.com${opts.path}` }] : []),
  }
  const history = {
    pushState: (_d: unknown, _u: string, url?: string) => { if (url) location.pathname = url.split("?")[0] },
    replaceState: (_d: unknown, _u: string, _url?: string) => {},
    scrollRestoration: "auto",
  }
  const fire = (type: string, extra: { persisted?: boolean } = {}) => (listeners.get(type) ?? []).forEach((f) => f({ type, ...extra }))
  return { window, document, sessionStorage, performance, history, location, classes, store, timers, fire }
}

const HOLD = "explore-scroll-restoring"
const PLACES = "explore-scroll-position"
const PENDING = "explore-scroll-restore-pending"

async function main() {
  console.log("\n5. Explore is never left blank")
  {
    const scroll = code("lib/explore/use-explore-scroll.ts")
    check("the return is read while rendering, where a Back is still known", /const \[cameBack\] = useState\(\(\) => typeof window !== "undefined" && backTraversal\)/.test(scroll))
    check("and decided in the layout effect from what the render saw", /decideExploreRestore\(cameBack\)/.test(scroll))
    check("nothing is held from a render (a render can be thrown away)", !/if \(typeof window !== "undefined" && !primed\.current\)/.test(scroll) && !/primeExploreScrollRestore\(\)\s*\n/.test(scroll))
    check("every path out of the layout effect that does not restore lets go of the hold", /if \(target == null\) \{\s*setExploreHold\(false\)\s*return/.test(scroll))
    check("every hold carries its own end, independent of React", /if \(on\) holdTimer = window\.setTimeout\(\(\) => document\.documentElement\.classList\.remove\(HOLD_CLASS\), EXPLORE_HOLD_MAX_MS \+ 100\)/.test(scroll))
    check("a page left mid restore stops scrolling and lets go", /const cancel = restoreScrollPosition\(target,/.test(scroll) && /return cancel\n/.test(scroll))
    check("the skeleton flag follows the hold itself after the restore has decided", /setActive\(document\.documentElement\.classList\.contains\(HOLD_CLASS\)\)/.test(scroll))

    /* The module, run against a browser that came back to /explore by a Back that loaded the document. */
    const b = makeBrowser({ path: "/explore", navType: "back_forward", store: { [PLACES]: JSON.stringify({ "/explore": 1200, "/explore/design": 300 }), [PENDING]: "1" } })
    const g = globalThis as Record<string, unknown>
    g.window = b.window
    g.document = b.document
    g.sessionStorage = b.sessionStorage
    g.history = b.history
    Object.defineProperty(globalThis, "performance", { value: b.performance, configurable: true, writable: true })
    const mod = await import("../lib/explore/use-explore-scroll")

    check("a document loaded by Back with a place left on purpose is a return", mod.exploreScrollRestoreActive() === true)
    check("and puts that page's own place back", mod.decideExploreRestore(false) === 1200)
    check("the marker is spent on it", !b.store.has(PENDING))

    /* A product opened (the marker again), then Explore reached by a link: a new visit, at the top. */
    b.store.set(PENDING, "1")
    b.history.pushState({}, "", "/p/a-product")
    b.history.pushState({}, "", "/explore")
    check("a visit by a link is not a return, whatever marker was left", mod.exploreScrollRestoreActive() === false && mod.decideExploreRestore(false) === null)

    /* THE BLANK PAGE, AS IT HAPPENED: a Back, then the router's own history write before any layout effect. */
    b.fire("popstate")
    const seenWhileRendering = mod.exploreScrollRestoreActive()
    b.history.replaceState({ __NA: true }, "", "/explore")
    const seenInTheEffect = mod.exploreScrollRestoreActive()
    check("a Back is seen while rendering", seenWhileRendering === true)
    check("and is gone by the layout effect (why the old effect held Explore hidden and never let go)", seenInTheEffect === false)
    check("so the render's reading decides, and the place is put back", mod.decideExploreRestore(true) === 1200)

    b.location.pathname = "/explore/design"
    check("each page under Explore has its own place", mod.decideExploreRestore(true) === 300)
    b.location.pathname = "/explore/ai"
    check("a page with no place kept starts at its top", mod.decideExploreRestore(true) === null)

    b.classes.add(HOLD)
    b.fire("pageshow", { persisted: true })
    check("a page brought back whole from the browser's cache is never left held", !b.classes.has(HOLD))
  }

  console.log("\n5. The boot script holds only a return, and never for ever")
  {
    const { EXPLORE_SCROLL_BOOT_SCRIPT, EXPLORE_BOOT_HOLD_MAX_MS } = await import("../lib/explore/explore-scroll-boot")
    const boot = (path: string, navType: string, store: Record<string, string>) => {
      const b = makeBrowser({ path, navType, store })
      new Function("location", "performance", "sessionStorage", "document", "window", "setTimeout", EXPLORE_SCROLL_BOOT_SCRIPT)(
        b.location, b.performance, b.sessionStorage, b.document, b.window, b.window.setTimeout,
      )
      return b
    }
    const kept = { [PLACES]: JSON.stringify({ "/explore": 900 }), [PENDING]: "1" }
    check("an address typed or followed is not held", !boot("/explore", "navigate", kept).classes.has(HOLD))
    const back = boot("/explore", "back_forward", kept)
    check("a Back that loads the page is held", back.classes.has(HOLD))
    check("with an end of its own", back.timers.some((t) => t.ms === EXPLORE_BOOT_HOLD_MAX_MS) && EXPLORE_BOOT_HOLD_MAX_MS <= 1500)
    back.timers.forEach((t) => t.fn())
    check("that end lets go", !back.classes.has(HOLD))
    check("a reload is held too", boot("/explore", "reload", kept).classes.has(HOLD))
    check("the search screen under /explore, which never restores, is never held", !boot("/explore/search", "back_forward", { ...kept, [PLACES]: JSON.stringify({ "/explore/search": 900 }) }).classes.has(HOLD))
    check("a page with no place of its own is not held", !boot("/explore/design", "back_forward", kept).classes.has(HOLD))
    const cached = boot("/explore", "back_forward", kept)
    cached.fire("pageshow", { persisted: true })
    check("a page from the browser's cache lets go at once", !cached.classes.has(HOLD))
  }

  console.log("\n1. The header's depth on a computer")
  {
    const css = read("app/globals.css")
    check("the light bar takes the shared depth from 768px", /@media \(min-width: 768px\) \{\s*\.platform-header-light \{\s*box-shadow: var\(--bar-depth\);\s*\}\s*\}/.test(css))
    check("and a phone keeps no shadow on the light bar", !/^\.platform-header-light \{/m.test(css))
    check("the dark bar keeps the one shared token", /\.platform-header-depth \{\s*\n\s*box-shadow: var\(--bar-depth-dark\);/.test(css) && !/\.platform-header-depth \{[^}]*rgba\(/.test(css))
    check("the bar's classes name it", /root: "platform-header-light /.test(read("lib/platform/header-chrome.ts")))
  }

  console.log("\n2. Explore's footer as wide as the header")
  {
    const footer = code("components/storefront/seller-footer.tsx")
    check("the footer can take the header's container", /headerWidth \? "max-w-\[1400px\] lg:px-8" : "max-w-6xl"/.test(footer))
    check("the header's container is that one", /mx-auto max-w-\[1400px\] px-4 sm:px-6 lg:px-8/.test(read("components/platform/platform-header-client.tsx")))
    check("Explore on a computer asks for it, and only Explore", /data-explore-desktop-footer="">\s*(\{\}\s*)?<SellerFooter headerWidth \/>/.test(code("components/marketing/conditional-footer.tsx")) && !/headerWidth/.test(read("app/(marketing)/p/[slug]/page.tsx")))
  }

  console.log("\n3. The photo beside Dashboard")
  {
    const header = code("components/platform/platform-header-client.tsx")
    check("a hairline ring and a soft shadow on the light bar", /ring-1 ring-\[rgba\(16,18,27,0\.1\)\] shadow-\[0_1px_2px_rgba\(16,18,27,0\.08\),0_4px_10px_-4px_rgba\(16,18,27,0\.18\)\]/.test(header))
    check("their dark counterparts on the dark bar", /ring-1 ring-white\/15 shadow-\[0_1px_2px_rgba\(0,0,0,0\.35\),0_4px_10px_-4px_rgba\(0,0,0,0\.5\)\]/.test(header))
    const trigger = header.slice(header.indexOf('data-header-avatar=""'), header.indexOf("</button>", header.indexOf('data-header-avatar=""')))
    check("the ring is outside the picture: the inner border is gone from the computer's photo", trigger.includes("<AppAvatar") && !/border border-gray-200/.test(trigger))
    check("the phone's sheet is as it was", /size=\{42\} className="border border-gray-200"/.test(header))
  }

  console.log("\n4. The back above the pictures on a computer")
  {
    const css = read("app/globals.css")
    const crumb = code("components/product/discover-back-breadcrumb.tsx")
    check("shown from Explore at every width", /\[data-discover-breadcrumb="web"\] \{\s*display: flex !important;\s*\}/.test(css) && !/@media \(min-width: 768px\) \{\s*\[data-discover-breadcrumb="web"\]/.test(css))
    check("the script no longer hides it from a computer", !/isDesktop/.test(crumb) && /if \(isNative \|\| showOnWeb\) \{/.test(crumb))
    check("a computer with nothing behind goes to Explore, a phone still to the creator", /const target = \(\) => \(desktopFromExplore\(\) \? EXPLORE_HREF : href\)/.test(crumb) && /EXPLORE_HREF = "\/explore"/.test(crumb) && /goBackOr\(target\(\)/.test(crumb))
    check("and says so", /if \(desktopFromExplore\(\)\) setBackLabel\("Explore"\)/.test(crumb))
    check("decided by the header's own breakpoint, outside the app", /DESKTOP_QUERY = "\(min-width: 768px\)"/.test(crumb) && /!document\.documentElement\.classList\.contains\("capacitor"\)/.test(crumb))
    check("a pointer gets a hover ground and a keyboard a ring", /hover:bg-\[#1a1a2e\]\/\[0\.04\]/.test(crumb) && /focus-visible:ring-2/.test(crumb))
  }

  console.log("\n6. Back to Explore comes to the same place")
  {
    const client = code("components/explore/explore-page-client.tsx")
    check("the price is in the address and read back", /if \(price && price !== "all"\) params\.set\("price", price\)/.test(client) && /const price = searchParams\.get\("price"\)/.test(client))
    check("the page of the list is in the address and read back", /href \+= `&pg=\$\{change\.page\}`/.test(client) && /parseInt\(searchParams\.get\("pg"\) \|\| "", 10\)/.test(client))
    check("arriving does not reset the page the address names", /if \(!pageResetArmed\.current\) \{\s*pageResetArmed\.current = true\s*return/.test(client))
    check("the Filters panel writes what it chose", /setSortBy=\{chooseSort\}/.test(client) && /setPriceFilter=\{choosePrice\}/.test(client))
    check("an address still waiting is written before any link is followed", /document\.addEventListener\("click", onPress, true\)/.test(client) && /closest\?\.\("a\[href\]"\)\) flush\(\)/.test(client) && /window\.addEventListener\("pagehide", flush\)/.test(client))
    check("every change goes through the one scheduler", !/categoryChangeTimeoutRef\.current = setTimeout\(\(\) => \{\s*(let|replaceAddress)/.test(client) && (client.match(/scheduleAddress\(/g) ?? []).length >= 7)
    const cache = code("lib/explore/communities-cache.ts")
    const results = code("components/explore/explore-communities-results.tsx")
    check("communities read with Show more are kept for the way back", /export function keepMoreCommunities/.test(cache) && /keepMoreCommunities\(query, \{ items: \[\.\.\.shown\.items/.test(results))
    check("and an older answer is not swapped for a first page under the visitor", /if \(!hit\.stale \|\| hasMoreThanFirstPage\(hit\)\) return/.test(results))
    /* Round 25: that one fade now belongs to the reveal after a hold (html.explore-scroll-revealing); a return put back before its first frame has none (tests/explore25). */
    check("Explore comes in with round 11's one settle fade, not a second fade of this round's on top", /html\.explore-scroll-revealing:not\(\.explore-scroll-restoring\) \.explore-ground \{\s*animation: explore-return/.test(read("app/globals.css")) && !/html:not\(\.explore-scroll-restoring\) \.explore-ground/.test(read("app/globals.css")))
    check("the checkout still leaves through history, never into a loop", /canReturnInApp\(\)/.test(code("app/checkout/checkout-client.tsx")) && /backThen\(\(\) => \(path \? router\.replace\(path\)/.test(code("app/checkout/checkout-client.tsx")))
  }

  console.log("\n7. A community opened from Discover lands softly")
  {
    const css = read("app/globals.css")
    const landing = code("components/community/member/landing.ts")
    check("the app's landing: opacity and a 2px rise, 180ms, its curve", /@keyframes community-land \{\s*from \{ opacity: 0; top: 2px; \}\s*to\s+\{ opacity: 1; top: 0; \}/.test(css) && /animation: community-land 180ms cubic-bezier\(0\.2, 0, 0, 1\) backwards;/.test(css))
    check("the rise is not a transform (the join bar fixed to a phone's foot stays put)", !/@keyframes community-land \{[^}]*transform/.test(css) && /\.community-land \{\s*position: relative;/.test(css))
    check("no spinner while it lands unless the wait is the app's long one", /\[data-community-landing\] \[data-place-spinner="page"\] \{\s*animation-delay: 500ms !important;/.test(css) && /animation-delay: 1000ms !important;/.test(css))
    check("only an arrival: not a page loaded as a document, not a move inside", /!document\.querySelector\(FRAME\)/.test(landing) && /typeof document !== "undefined"/.test(landing))
    const publicFrame = code("components/community/public/public-frame.tsx")
    const memberFrame = code("components/community/member/shell-frame.tsx")
    check("the public frame (the sales page Discover opens) lands whole", /useCommunityLanding\(\)/.test(publicFrame) && /landing \? " community-land" : ""/.test(publicFrame))
    check("the member frame takes the spinner's wait only: its columns have round 11's landing, never a second fade", /useCommunityLanding\(\)/.test(memberFrame) && /data-community-landing=\{landing \? "" : undefined\}/.test(memberFrame) && !/community-land"/.test(memberFrame) && /const LAND = /.test(memberFrame))
    check("a community about to be opened from Discover is asked for whole", /router\.prefetch\(href, \{ kind: "full" \} as never\)/.test(code("components/explore/explore-communities-results.tsx")) && /onPointerDown=\{warm\}/.test(code("components/explore/explore-communities-results.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
