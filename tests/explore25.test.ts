/**
 * ===========================================================================
 *  ROUND 25: BACK TO EXPLORE IS EXACTLY WHERE YOU WERE; A COMMUNITY OPENS
 *  ON A COMPUTER WITHOUT SLIDING
 * ===========================================================================
 * The owner:
 *
 *   1. "In Explore, scroll down, open a product, go Back: it must return
 *      exactly where I was, smoothly, not jump to the top or glitch (also
 *      for creators, communities, categories, search results, infinite
 *      lists: keep the loaded pages and the scroll ...)."
 *   2. "On desktop, in Explore > Discover communities, opening a community
 *      slides in from left/right: replace with something regular, smooth,
 *      clean and simple. Check phones too and keep their native feel."
 *
 * The scroll module and the boot script are run for real against a stand
 * in window (with and without the Navigation API); the rest is read from the
 * source. scripts/check-explore25.mjs films the same journeys in a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A stand in browser: enough of window, history, storage and the Navigation API for the modules under test ── */
type Listener = (e: { persisted?: boolean; type: string }) => void
function makeBrowser(opts: { path: string; navType: string; navigationApi: boolean }) {
  const listeners = new Map<string, Listener[]>()
  const classes = new Set<string>()
  const store = new Map<string, string>()
  const [p0, q0 = ""] = opts.path.split("?")
  const location = { pathname: p0, search: q0 ? `?${q0}` : "", origin: "https://storelib.com", get href() { return `https://storelib.com${this.pathname}${this.search}` } }
  /* The session history: one entry per push, kept by a replace, its key never shared. */
  let nextKey = 1
  const entries: { key: string; url: string }[] = [{ key: `k${nextKey++}`, url: opts.path }]
  let at = 0
  const go = (url: string) => {
    const [p, q = ""] = url.split("?")
    location.pathname = p
    location.search = q ? `?${q}` : ""
  }
  const navigation = { get currentEntry() { return { key: entries[at].key } } }
  const window: Record<string, unknown> = {
    location,
    addEventListener: (t: string, f: Listener) => listeners.set(t, [...(listeners.get(t) ?? []), f]),
    removeEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollTo: () => {},
    scrollY: 0,
    innerHeight: 800,
  }
  if (opts.navigationApi) window.navigation = navigation
  const document = {
    documentElement: {
      classList: {
        add: (c: string) => void classes.add(c),
        remove: (c: string) => void classes.delete(c),
        contains: (c: string) => classes.has(c),
        toggle: (c: string, on?: boolean) => {
          if (on ?? !classes.has(c)) classes.add(c)
          else classes.delete(c)
          return classes.has(c)
        },
      },
      scrollHeight: 10000,
    },
  }
  const sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  }
  const performance = { getEntriesByType: (t: string) => (t === "navigation" ? [{ type: opts.navType, name: `https://storelib.com${opts.path}` }] : []), now: () => 0 }
  const fire = (type: string) => (listeners.get(type) ?? []).forEach((f) => f({ type }))
  const history = {
    pushState: (_d: unknown, _u: string, url?: string) => {
      entries.splice(at + 1)
      entries.push({ key: `k${nextKey++}`, url: url ?? entries[at].url })
      at = entries.length - 1
      if (url) go(url)
    },
    replaceState: (_d: unknown, _u: string, url?: string) => {
      if (url) {
        entries[at].url = url
        go(url)
      }
    },
    back: () => {
      at = Math.max(0, at - 1)
      go(entries[at].url)
      fire("popstate")
    },
    forward: () => {
      at = Math.min(entries.length - 1, at + 1)
      go(entries[at].url)
      fire("popstate")
    },
    scrollRestoration: "auto",
  }
  return { window, document, sessionStorage, performance, history, location, classes, store, fire, entryKey: () => entries[at].key }
}

function install(b: ReturnType<typeof makeBrowser>) {
  const g = globalThis as Record<string, unknown>
  g.window = b.window
  g.document = b.document
  g.sessionStorage = b.sessionStorage
  g.history = b.history
  Object.defineProperty(globalThis, "performance", { value: b.performance, configurable: true, writable: true })
}

async function main() {
  console.log("\n1. A place per visit, not per path")
  const b = makeBrowser({ path: "/explore", navType: "navigate", navigationApi: true })
  install(b)
  const scroll = await import("../lib/explore/use-explore-scroll")
  const entry = await import("../lib/explore/entry-state")
  const places = () => JSON.parse(b.store.get(scroll.EXPLORE_SCROLL_KEY) ?? "{}") as Record<string, number>

  /* Explore at 2000, then its search results (a push, same path) at 600, then a product. */
  ;(b.window as { scrollY: number }).scrollY = 2000
  scroll.saveExploreScrollNow()
  const exploreKey = `#${b.entryKey()}`
  check("a place is kept under the history entry and under the address", places()[exploreKey] === 2000 && places()["/explore"] === 2000, places())
  b.history.pushState({}, "", "/explore?q=prints")
  ;(b.window as { scrollY: number }).scrollY = 600
  scroll.saveExploreScrollNow()
  check("the search results have a place of their own (the address with its query)", places()["/explore?q=prints"] === 600 && places()["/explore"] === 2000, places())
  b.history.pushState({}, "", "/p/product-1")
  check("Explore's place is untouched by the results", places()[exploreKey] === 2000)

  b.history.back()
  check("Back to the results is a return, seen while rendering", scroll.exploreReturning() === true)
  check("and puts the results' place back", scroll.decideExploreRestore(true) === 600)
  check("the landing fade of a new visit is not played on a return", b.classes.has("explore-scroll-settling"))
  b.history.back()
  check("Back again, to Explore on the same mounted page, is a return too", scroll.exploreReturning() === true)
  check("and puts Explore's own place back, not the results'", scroll.decideExploreRestore(true) === 2000)

  /* The same address twice in the history: the entry key tells them apart. */
  b.history.pushState({}, "", "/explore")
  ;(b.window as { scrollY: number }).scrollY = 300
  scroll.saveExploreScrollNow()
  b.history.pushState({}, "", "/p/product-2")
  b.history.back()
  check("Explore visited again keeps its own place (300)", scroll.decideExploreRestore(true) === 300)
  b.history.back()
  b.history.back()
  check("and the first visit further back keeps its own (2000)", scroll.decideExploreRestore(true) === 2000)

  console.log("\n2. Without the Navigation API, the address with its query")
  {
    const keys = (scroll as { explorePlaceKeys: () => string[] }).explorePlaceKeys
    const nav = b.window.navigation
    delete b.window.navigation
    b.location.pathname = "/explore"
    b.location.search = "?type=communities"
    check("one key, the full address", JSON.stringify(keys()) === JSON.stringify(["/explore?type=communities"]), keys())
    b.window.navigation = nav
    check("with the API, the entry first", keys()[0].startsWith("#") && keys()[1] === "/explore?type=communities", keys())
  }

  console.log("\n3. Nothing is written for a page that is going")
  {
    const src = readCode("lib/explore/use-explore-scroll.ts")
    check("no write while a Back or Forward is on its way, while restoring, or once the address is another page's", /const mine = \(\) => !restoringRef\.current && traversalTo === null && window\.location\.pathname === path/.test(src))
    check("the write and the leave both ask it", /const write = \(\) => \{\s*frame = 0\s*if \(!mine\(\)\) return/.test(src) && /const handleLeave = \(\) => \{[\s\S]{0,120}if \(!mine\(\)\) return/.test(src))
    check("a press that leaves (a card, a creator, a community, a search) keeps the place at that moment", /document\.addEventListener\("click", handleLeave, true\)/.test(src) && /document\.addEventListener\("submit", handleLeave, true\)/.test(src))
    check("a Back between two addresses of the same mounted page is put back before paint", /useLayoutEffect\(\(\) => \{\s*if \(drawnAddress\.current === address\) return/.test(src) && /if \(traversalTo === null \|\| traversalTo !== address\) return/.test(src))
    check("a push clears the pending Back", /history\.pushState = function \(\.\.\.args\) \{\s*clearTraversal\(\)\s*traversalTo = null/.test(src))
    check("the oldest places are let go", /MAX_PLACES = 60/.test(src))
  }

  console.log("\n4. No fade unless the page was seen hidden")
  {
    const src = readCode("lib/explore/use-explore-scroll.ts")
    const css = readCode("app/globals.css")
    check("a page put back before its first frame is simply there", /if \(held && \(bootHeld \|\| attempts > 1\)\) reveal\(\)/.test(src))
    check("the place is reached only when the page is tall enough for it (no landing short and then moving)", /return Math\.abs\(window\.scrollY - y\) < 2 && y === target/.test(src))
    check("the fade belongs to the reveal class alone", /html\.explore-scroll-revealing:not\(\.explore-scroll-restoring\) \.explore-ground \{\s*animation: explore-return 220ms/.test(css) && !/html\.explore-scroll-settling:not\(\.explore-scroll-restoring\) \.explore-ground/.test(css))
    check("settling keeps anchoring off and nothing else", /html\.explore-scroll-settling \{\s*overflow-anchor: none;\s*\}/.test(css))
    check("reduced motion: no fade", /@media \(prefers-reduced-motion: reduce\) \{\s*html\.explore-scroll-revealing \.explore-ground \{\s*animation: none;/.test(css))
  }

  console.log("\n5. A document loaded again reads the same keys")
  {
    const { EXPLORE_SCROLL_BOOT_SCRIPT } = await import("../lib/explore/explore-scroll-boot")
    const boot = (path: string, store: Record<string, string>, key: string | null) => {
      const [p, q = ""] = path.split("?")
      const classes = new Set<string>()
      let scrolled = -1
      const doc = { documentElement: { classList: { add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) } } }
      const win = { navigation: key ? { currentEntry: { key } } : undefined, scrollTo: (_x: number, y: number) => void (scrolled = y), addEventListener: () => {} }
      const loc = { pathname: p, search: q ? `?${q}` : "" }
      const perf = { getEntriesByType: () => [{ type: "back_forward" }] }
      const ss = { getItem: (k: string) => store[k] ?? null, removeItem: () => {} }
      new Function("location", "performance", "sessionStorage", "document", "window", "setTimeout", EXPLORE_SCROLL_BOOT_SCRIPT)(loc, perf, ss, doc, win, () => 0)
      return { held: classes.has("explore-scroll-restoring"), scrolled }
    }
    const store = { "explore-scroll-restore-pending": "1", "explore-scroll-position": JSON.stringify({ "#k9": 1500, "/explore": 400, "/explore?q=prints": 700 }) }
    check("the entry's own place first", boot("/explore", store, "k9").scrolled === 1500)
    check("else the address with its query", boot("/explore?q=prints", store, null).scrolled === 700)
    check("and Explore itself by its address", boot("/explore", store, "k1").scrolled === 400)
    check("the script still parses on its own", (() => { try { new Function(EXPLORE_SCROLL_BOOT_SCRIPT); return true } catch { return false } })())
  }

  console.log("\n6. A list's own choices are kept with the visit")
  {
    b.history.pushState({}, "", "/explore/design")
    entry.writeExploreEntryState("category-list", { page: 3, sort: "popular", price: "all", query: "" })
    const designKey = b.entryKey()
    b.history.pushState({}, "", "/p/product-3")
    check("another page has nothing kept", entry.readExploreEntryState("category-list") === undefined)
    b.history.back()
    check("Back reads the list as it was (page 3, Popular)", JSON.stringify(entry.readExploreEntryState("category-list")) === JSON.stringify({ page: 3, sort: "popular", price: "all", query: "" }) && b.entryKey() === designKey)
    b.history.back()
    b.history.pushState({}, "", "/explore/design")
    check("a new visit to the same category by a link is not a return, so the page does not read it", scroll.exploreReturning() === false)

    const page = readCode("components/explore/category-page-client.tsx")
    check("the category page reads it in its first render on a client Back", /useState<CategoryListState \| null>\(\(\) => \(exploreReturning\(\) \? keptList\(\) : null\)\)/.test(page) && /useState\(kept\?\.page \?\? 1\)/.test(page))
    check("and from a layout effect for a document loaded again (never while hydrating)", /useLayoutEffect\(\(\) => \{\s*if \(kept \|\| !exploreDocumentReturn\(\)\) return/.test(page))
    check("a list put back is not reset to its first page", /if \(drawnChoices\.current === listChoices\) return/.test(page) && !/useEffect\(\(\) => \{\s*setCurrentPage\(1\)\s*\}, \[deferredPrice/.test(page))
    check("a kept page past the end is the last page", /if \(totalPages > 0 && currentPage > totalPages\) setCurrentPage\(totalPages\)/.test(page))
  }

  console.log("\n7. Discover communities: the pages read with Show more come back")
  {
    const cache = await import("../lib/explore/communities-cache")
    const card = (i: number) => ({ id: `c${i}` }) as never
    cache.clearCommunitiesCache()
    cache.keepMoreCommunities("category=design", { items: Array.from({ length: 48 }, (_, i) => card(i)), next: "n2", broadened: false })
    cache.clearCommunitiesCache()
    const back = cache.restoreKeptCommunities("category=design")
    check("a document loaded again finds all 48, not the first 24", back?.items.length === 48 && back?.next === "n2")
    check("and they are in memory for the grid's first render after it", cache.cachedCommunities("category=design")?.items.length === 48)
    check("a list already as long in memory is left alone", cache.restoreKeptCommunities("category=design") === null)
    const results = readCode("components/explore/explore-communities-results.tsx")
    check("the grid puts them back before its first paint, on a return only", /React\.useLayoutEffect\(\(\) => \{\s*if \(!exploreDocumentReturn\(\)\) return\s*const kept = restoreKeptCommunities\(query\)/.test(results))
  }

  console.log("\n8. A community opened on a computer: a fade, no slide; a phone keeps its push and pop")
  {
    const frame = readCode("components/community/member/shell-frame.tsx")
    check("from PAGE_PHONE up, opacity only, on the site's landing timing", /if \(wide\) el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: NAV_ENTER_MS, easing: NAV_ENTER_EASE \}\)/.test(frame))
    check("a phone keeps the push in from the right", /else el\.animate\(\[\{ translate: "36px 0", opacity: 0\.6 \}, \{ translate: "0 0", opacity: 1 \}\]/.test(frame))
    check("leaving for Explore slides off only on a phone", /if \(leavingRef\.current === "pop" && el && window\.matchMedia\?\.\(PAGE_PHONE\)\.matches\) holdLeavingStill\(el, 320, \{ motion: "pop", under: true \}\)/.test(frame))
    const push = await import("../lib/navigation/page-push")
    check("a full page pushed from a community on a computer fades without moving", push.PAGE_WIDE_SHIFT_PX === 0 && push.PAGE_PHONE === "(max-width: 767px)")
  }

  console.log("\n9. Words")
  {
    const files = ["lib/explore/use-explore-scroll.ts", "lib/explore/explore-scroll-boot.ts", "lib/explore/entry-state.ts", "lib/explore/communities-cache.ts", "components/explore/category-page-client.tsx", "scripts/check-explore25.mjs", "scripts/explore25-stub.mjs", "tests/explore25.test.ts"]
    const banned = new RegExp(`\\b(${["un" + "lock\\w*", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form(s|ed|ing)?"].join("|")})\\b`, "i")
    const offenders = files.filter((f) => read(f).includes(String.fromCharCode(0x2014)) || banned.test(readCode(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
