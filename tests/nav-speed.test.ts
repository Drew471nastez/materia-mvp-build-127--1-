/**
 * ===========================================================================
 *  ROUND 26: THE PHONE'S TABS, ITS MENU AND ITS PULL, WITHOUT THE WAITS
 * ===========================================================================
 * The owner, on the iPhone app: the bottom bar's pages "show loading" and do
 * not feel native; a row in the menu "blocks ~4 seconds before navigating";
 * pull to refresh "sometimes takes 6 to 7 seconds to finish".
 *
 *   PULL      the spinner waited for the whole refresh (Home's Analytics
 *             answer, Orders' router.refresh with an 8s fallback, a 10s
 *             wrapper cap). It ends at PULL_SPIN_MAX_MS now, and the refresh
 *             carries on behind it.
 *   TABS      router.refresh() purges the router's whole cache in Next 16, so
 *             after one pull every tab the pill had warmed was cold again for
 *             five minutes. The pill's pages are asked for again when the
 *             router drops them (prefetchAppPage keepWarm, onInvalidate).
 *   MENU      the menu stayed up until the new page had committed (up to
 *             1.6s), frozen over the screen; it closes on the tap now. Its
 *             read ahead on open is held to the device's plan and skips the
 *             pill's four.
 *   SERVER    the /app layout's setup ring reads and Home's creator reads
 *             start when the creator row lands, not after the slowest read
 *             beside it.
 *
 * Run with:  pnpm run test:push
 */
import { readCode } from "./_source"
import { PULL_SPIN_MAX_MS, spinUntil } from "@/lib/ui/pull-refresh-cap"
import { forgetKeptWarm, prefetchAppPage, REWARM_AFTER_MS } from "@/lib/ui/app-navigation"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log("\nThe pull's spinner never waits for the whole refresh")
  {
    check("the cap is under two seconds", PULL_SPIN_MAX_MS > 0 && PULL_SPIN_MAX_MS <= 2_000, PULL_SPIN_MAX_MS)

    let t = performance.now()
    let finished = false
    const slow = new Promise<void>((r) => setTimeout(() => { finished = true; r() }, 400))
    const how = await spinUntil(() => slow, 60)
    let took = performance.now() - t
    check("a slow refresh is capped: the spinner ends at the cap", how === "capped" && took < 300, { how, took })
    check("  and the refresh is not cancelled: it still finishes behind it", !finished && (await slow, finished))

    t = performance.now()
    check("a quick refresh ends the spinner when it settles", (await spinUntil(() => wait(10), 2_000)) === "settled" && performance.now() - t < 500)
    check("a failed refresh still ends it", (await spinUntil(() => Promise.reject(new Error("no")), 2_000)) === "settled")
    check("a refresh that throws as it starts still ends it", (await spinUntil(() => { throw new Error("no") }, 2_000)) === "settled")
    check("a refresh that is not a promise ends it", (await spinUntil(() => undefined, 2_000)) === "settled")

    t = performance.now()
    const never = await spinUntil(() => new Promise(() => {}), 50)
    took = performance.now() - t
    check("a refresh that never settles ends at the cap", never === "capped" && took < 300, { never, took })

    const hook = readCode("hooks/use-pull-to-refresh.ts")
    check("the hook ends the gesture through the cap, with maxSpin as an option",
      /maxSpin: PULL_SPIN_MAX_MS/.test(hook) && /maxSpin = PULL_TO_REFRESH\.maxSpin/.test(hook) && /spinUntil\(\(\) => refreshRef\.current\(\), maxSpin\)/.test(hook))
    check("the wrapper's own ceiling is the same number, not 10s",
      /export const REFRESH_MAX_MS = PULL_SPIN_MAX_MS/.test(readCode("components/ui/pull-to-refresh.tsx")))
  }

  console.log("\nThe pill's pages come back after a refresh drops them")
  {
    forgetKeptWarm()
    const calls: { href: string; options: { kind?: string; onInvalidate?: () => void } }[] = []
    const router = { prefetch: (href: string, options?: never) => { calls.push({ href, options: (options ?? {}) as { kind?: string; onInvalidate?: () => void } }) } }

    prefetchAppPage(router, "/app/orders")
    check("an ordinary prefetch is whole and has no listener", calls[0]?.options.kind === "full" && !calls[0]?.options.onInvalidate)

    calls.length = 0
    prefetchAppPage(router, "/app/orders", { keepWarm: true })
    prefetchAppPage(router, "/app/orders", { keepWarm: true })
    const listeners = calls.filter((c) => c.options.onInvalidate)
    check("keepWarm asks with one onInvalidate per page, never stacked", calls.length === 2 && listeners.length === 1 && calls.every((c) => c.options.kind === "full"), calls.length)

    calls.length = 0
    listeners[0].options.onInvalidate!()
    check("dropped by a refresh: nothing is asked at once, so the refresh goes first", calls.length === 0)
    await wait(REWARM_AFTER_MS + 100)
    check("  and the page is asked for again after REWARM_AFTER_MS, still kept warm",
      calls.length === 1 && calls[0].href === "/app/orders" && typeof calls[0].options.onInvalidate === "function", calls.length)
    forgetKeptWarm()

    const shell = readCode("components/app/sidebar.tsx")
    /* Changed on purpose (round 48): kept warm where the bar is on screen; on a computer, where it is hidden, the page alone and once (tests/appperf-r48.test.ts). */
    check("the pill's warm keeps its pages warm", /onPrefetch=\{\(href, phone\) => \{[\s\S]{0,260}?prefetchAppPage\(router, href, phone \? \{ keepWarm: true \} : \{ pageOnly: true \}\)/.test(shell))
  }

  console.log("\nThe menu closes on the tap")
  {
    const nav = readCode("components/app/sidebar-mobile-nav.tsx")
    check("no waiting for the page before the menu goes", !/going\.current/.test(nav) && /const closeOnto = useCallback\(\(to\?: string\) => \{\s*void to\s*closeRef\.current\(\)/.test(nav))
    check("its read ahead skips the pill's four and keeps to the device's plan",
      /!tabs\.has\(i\.href\)/.test(nav) && /\.slice\(0, plan\.idleBudget\)/.test(nav) && /const plan = prefetchPlan\(\)/.test(nav))
  }

  console.log("\nThe server starts a creator's reads when the creator is known")
  {
    const layout = readCode("app/(storelib)/app/layout.tsx")
    check("the layout's setup reads start from the creator read, not after the whole first round",
      /const setupRead = Promise\.all\(\[creatorForRequest\(user\.id\), teamStoreForRequest\(user\.id\)\.catch\(\(\) => null\)\]\)\.then/.test(layout) && /setupRead\.catch\(\(\) => \{\}\)/.test(layout)
      && layout.indexOf("const setupRead") < layout.indexOf("listBusinesses(user.id)") && /const setupRows = await setupRead/.test(layout))
    check("  the store is the same one the shell draws: the team store first, then their own", /const creator = team\?\.store \?\? own/.test(layout) && /const creator = teamStore \?\? ownCreator/.test(layout))
    const home = readCode("app/(storelib)/app/page.tsx")
    check("Home's creator reads start when the creator row lands, after the same two checks",
      /const creatorReads = homeCreator\(user\.id\)\.then\(\(creator\) => \{\s*if \(!creator \|\| !creator\.onboarding_completed\) return null/.test(home)
      && /creatorReads\.catch\(\(\) => \{\}\)/.test(home) && home.indexOf("const creatorReads") < home.indexOf("await firstRead"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
