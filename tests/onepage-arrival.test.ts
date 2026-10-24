/**
 * ===========================================================================
 *  A PRESS ON ONEPAGE ALWAYS ENDS IN THE EDITOR
 * ===========================================================================
 * "Sometimes when I want to go to the OnePage editor, it doesn't take me
 * there. It shows the loading thing but it never takes me there, or it takes
 * me there very delayed."
 *
 *   the server page awaited its Supabase reads with no ceiling, one after the
 *   other, and wrote the social links before answering: a read that hung
 *   held the router's answer for as long as it hung
 *                                         -> lib/onepage/bounded-read.ts, the
 *                                            two reads at once, the writes
 *                                            after the answer (next/server after)
 *   at the shell's eight second cap the spinner gave way to the page you
 *   were on, and the editor landed later over whatever came next
 *                                         -> the editor is loaded as a document
 *                                            at the cap instead
 *   on a phone nothing fetched the editor (the heaviest page in /app) before
 *   the press                             -> the shell warms it once idle
 *
 * The phone tab bar and the Theme kinds are measured by
 * scripts/check-onepage-tabbar.mjs; their shape is held here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { READ_TIMEOUT, readTwice, within, type ReadResult } from "@/lib/onepage/bounded-read"
import { loadsAsDocumentWhenStalled } from "@/lib/ui/app-navigation"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* A clock the test moves by hand, so a "hung" read costs no real time. */
function fakeClock() {
  let now = 0
  let timers: { at: number; cb: () => void; id: number }[] = []
  let next = 1
  return {
    timers: {
      now: () => now,
      setTimeout: (cb: () => void, ms: number) => { const id = next++; timers.push({ at: now + ms, cb, id }); return id },
      clearTimeout: (id: unknown) => { timers = timers.filter((t) => t.id !== id) },
    },
    async advance(ms: number) {
      const end = now + ms
      for (;;) {
        timers.sort((a, b) => a.at - b.at)
        const t = timers[0]
        if (!t || t.at > end) break
        timers.shift()
        now = t.at
        t.cb()
        await new Promise((r) => setImmediate(r))
      }
      now = end
      await new Promise((r) => setImmediate(r))
    },
  }
}
const never = <T,>() => new Promise<T>(() => {})

async function main() {
  console.log("\nA read that never answers still ends")
  {
    const clock = fakeClock()
    let aborted = 0
    let settled: ReadResult<unknown> | null = null
    within((signal) => { signal.addEventListener("abort", () => aborted++); return never<ReadResult<unknown>>() }, 2500, clock.timers).then((r) => { settled = r })
    await clock.advance(2499)
    check("not before its time", settled === null)
    await clock.advance(1)
    check("at 2.5s it ends with a timeout error", (settled as ReadResult<unknown> | null)?.error?.code === READ_TIMEOUT)
    check("and the request is aborted", aborted === 1)
  }
  {
    const clock = fakeClock()
    let tries = 0
    let settled: ReadResult<unknown> | null = null
    readTwice(() => { tries++; return never<ReadResult<unknown>>() }, { attemptMs: 2500, budgetMs: 4000 }, clock.timers).then((r) => { settled = r })
    await clock.advance(4000)
    check("two hung tries end inside the 4s budget: 2.5s and then the 1.5s left", (settled as ReadResult<unknown> | null)?.error?.code === READ_TIMEOUT && tries === 2)
  }
  {
    const clock = fakeClock()
    let tries = 0
    let settled: ReadResult<unknown> | null = null
    readTwice(() => { tries++; return never<ReadResult<unknown>>() }, { attemptMs: 3900, budgetMs: 4000 }, clock.timers).then((r) => { settled = r })
    await clock.advance(4000)
    check("no second try when the budget has no real room for it", (settled as ReadResult<unknown> | null)?.error?.code === READ_TIMEOUT && tries === 1)
  }
  {
    let tries = 0
    const r = await readTwice(async () => (++tries === 1 ? { data: null, error: { message: "blip" } } : { data: { id: "row" }, error: null }))
    check("a failed first try is asked again, and its answer used", tries === 2 && (r.data as { id: string } | null)?.id === "row" && r.error === null)
  }
  {
    let tries = 0
    const r = await readTwice(async () => { tries++; return { data: null, error: null } })
    check("a row that is not there is an answer, not a failure: asked once", tries === 1 && r.data === null && r.error === null)
  }
  {
    const r = await readTwice(() => { throw new Error("socket closed") })
    check("a read that throws becomes an error, never a throw", r.error?.message === "socket closed")
  }

  console.log("\nThe editor's page waits for nothing without an end")
  {
    const page = code("app/app/onepage/page.tsx")
    check("the creator and the page are read at once, each bounded and abortable",
      /await Promise\.all\(\[\s*readTwice\(\(signal\) =>\s*createAdminClient\(\)\.from\("creators"\)\.select\("\*"\)\.eq\("user_id", user\.id\)\.abortSignal\(signal\)\.maybeSingle\(\),?\s*\),\s*readTwice\(\(signal\) =>\s*supabase\.from\("onepages"\)\.select\("\*"\)\.eq\("owner_id", user\.id\)\.abortSignal\(signal\)\.maybeSingle\(\),?\s*\),?\s*\]\)/.test(page))
    check("the reads come from the shared bounded helper", /from "@\/lib\/onepage\/bounded-read"/.test(read("app/app/onepage/page.tsx")) && !/async function readTwice/.test(page))
    check("making a new page has a ceiling", /await within\(\s*async \(\) => \(\{ data: await ensureOnePage\(supabase, user\.id, creator\), error: null \}\),\s*MAKE_PAGE_MS,?\s*\)/.test(page))
    check("the store builder's links are waited on for 1.5s at most", /const STORE_SOCIALS_MS = 1500/.test(page) && /\.abortSignal\(signal\)\s*\.maybeSingle\(\),\s*STORE_SOCIALS_MS,?\s*\)/.test(page))
    check("the social link writes are finished after the answer, not awaited", /after\(sent\)/.test(page) && (page.match(/keep\(supabase\s*\.from\("onepages"\)/g) || []).length === 2 && !/await supabase\s*\.from\("onepages"\)\s*\.update/.test(page))
    check("the tab's name waits 1.5s at most", /profileForRequest\(user\.id\),\s*new Promise<null>\(\(resolve\) => setTimeout\(\(\) => resolve\(null\), 1500\)\)/.test(page))
  }

  console.log("\nA press that stalls loads the editor instead of handing back the page before")
  {
    check("the editor, with or without a tab in its address", loadsAsDocumentWhenStalled("/app/onepage") && loadsAsDocumentWhenStalled("/app/onepage#design") && loadsAsDocumentWhenStalled("/app/onepage/"))
    check("no other page", !loadsAsDocumentWhenStalled("/app") && !loadsAsDocumentWhenStalled("/app/products") && !loadsAsDocumentWhenStalled("/app/onepage-preview") && !loadsAsDocumentWhenStalled(null))
    const stage = code("components/app/app-stage.tsx")
    check("at the cap the stage loads it as a document, while it is still the navigation underway and the tab is in view",
      /if \(loadsAsDocumentWhenStalled\(nav\.href\) && getAppNavigation\(\) === nav && document\.visibilityState === "visible"\) \{[\s\S]{0,200}window\.location\.assign\(nav\.href as string\)\s*return/.test(stage))
    const sidebar = code("components/app/sidebar.tsx")
    check("on a phone the shell fetches the editor whole once idle, for a creator who has one",
      /if \(!onePagePublished \|\| !isPhoneShell\(\)\) return/.test(sidebar) && /prefetchAppPage\(router, "\/app\/onepage"\)/.test(sidebar) && /requestIdleCallback\(warm, \{ timeout: 5000 \}\)/.test(sidebar))
  }

  console.log("\nThe phone bar changes in place, and its words keep their descenders")
  {
    const editor = code("components/onepage/onepage-editor.tsx")
    const bar = editor.slice(editor.indexOf('data-onepage-tabbar=""'), editor.indexOf("<ShareOnePage"))
    check("no pill travels in the phone bar", !/data-tab-pill|useTabPill|phonePill/.test(bar) && !/phonePill/.test(editor))
    check("each button has its own dark fill, crossfaded on opacity over TAB_SELECT_MS",
      /data-tab-fill=""/.test(bar) && /style=\{\{ opacity: on \? 1 : 0, transitionDuration: `\$\{TAB_SELECT_MS\}ms` \}\}/.test(bar) && /const TAB_SELECT_MS = 140/.test(editor))
    check("a press scales it a little, and reduced motion swaps at once", /active:scale-\[0\.96\]/.test(bar) && /motion-reduce:transition-none/.test(bar) && /motion-reduce:active:scale-100/.test(bar))
    check("the word's line holds Inter's whole height, not 1em", /truncate text-center leading-\[1\.3\]" data-tab-word=""/.test(bar) && !/leading-none/.test(bar))
    /* The slide is the one every pill-tab row in the editor shares now (components/onepage/pill-tabs usePillSlide). */
    check("the computer's segmented row keeps its sliding pill", /const desktopPill = usePillSlide\(activeTab\)/.test(editor) && /pillMoves\.current = \[desktopPill\.slideTo\]/.test(editor))
  }

  console.log("\nA pick of a Theme kind moves nothing but the pick")
  {
    const design = code("components/onepage/tabs/design-tab.tsx")
    /* The kinds are the editor's one pill-tab row now (components/onepage/pill-tabs PillTabs, the pill sliding from the press); a pick still goes through the steady filter. */
    check("the pills pick through the steady filter", /onChange=\{pickFilter\}/.test(design) && /itemAttr="data-theme-filter"/.test(design) && /const \{ gridRef, pickFilter \} = useSteadyFilter\(filter, setFilter\)/.test(design))
    /* Changed on purpose (round 11): at the top of the panel nothing is held, so nothing is measured in the press either. */
    check("the rest of the panel is measured before the change, the scroll put back after it",
      /rest: box\.scrollHeight - grid\.offsetHeight/.test(design) && /if \(need > natural\) \{\s*grid\.style\.minHeight = `\$\{need\}px`/.test(design) && /if \(at\.box\.scrollTop !== at\.top\) at\.box\.scrollTop = at\.top/.test(design))
    check("the grid never stretches its rows to the held height", /grid grid-cols-2 content-start gap-3 sm:grid-cols-3/.test(design))
    /*
      Was: the whole grid faded up from opacity 0 on every pick, over cards
      made anew. That fade blanked every thumbnail, the ones that stayed
      included ("the themes flash and glitch"). Now every card is kept, the
      ones that stay slide to their new place, and only the ones that arrive
      fade in (round 10, scripts/check-onepage-themes.mjs samples the frames).
    */
    check("every theme card is kept; a pick only shows or hides them", /\{THEME_TEMPLATES\.map\(\(template\) => \(\s*<ThemeCard key=\{template\.id\}[^>]*shown=\{filter === "all" \|\| template\.category === filter\}/.test(design) && !/filteredTemplates/.test(design))
    /*
      Changed on purpose (round 11): "the themes flash when I land on each
      category". The round 10 slide and fade were the flash the owner saw.
      A pick is now one still swap: no card is animated, faded or moved,
      hidden cards are hidden with nothing their insides inherit (no
      tabindex, which the app's card rule names), and every card's photo is
      decoded before it can be shown (scripts/check-onepage-themes.mjs films
      the picks).
    */
    check("a pick is one still swap: no card is animated, faded in or slid",
      !/el\.animate\(/.test(design.slice(design.indexOf("function useSteadyFilter"), design.indexOf("function ThemeSection"))) &&
      /const HIDDEN_CARD: React\.CSSProperties = \{ position: "absolute", top: 0, left: 0, zIndex: -1, opacity: 0, contentVisibility: "hidden" \}/.test(design) &&
      /inert=\{!shown\}/.test(design) &&
      /decoding="sync" data-theme-thumb=""/.test(design) &&
      /useEffect\(\(\) => \{ preloadThemeThumbs\(\) \}, \[\]\)/.test(design))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
