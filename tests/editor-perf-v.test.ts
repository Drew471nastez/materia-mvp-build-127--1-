/**
 * ===========================================================================
 *  V3: THE BUILDER'S SPEED, AND LEAVING IT
 * ===========================================================================
 * The owner asked for a performance audit of the website builder's editor,
 * profiled first, and for leaving it to show at least three seconds of a
 * Going back screen. What was measured is in scripts/check-editor-perf.mjs
 * (before and after numbers in its header) and scripts/check-editor-exit.mjs;
 * this holds the pure parts and the shape of the code:
 *
 *   EXIT      the hold's timing on a fake clock (EXIT_MIN_MS is 3000), one
 *             exit per press, the leave question asked before any of it
 *   KEYS      a memo keyed by what it reads, not by the whole page
 *   WARM-UP   the section library's previews measured in batches
 *
 * Run with:  npx tsx tests/editor-perf-v.test.ts
 */
import { readCode, readSource } from "./_source"
import { EXIT_FADE_MS, EXIT_MIN_MS, createExitHold, exitRevealIn } from "@/lib/website-builder/exit-hold"
import { overlayTypesOf, splitTypesKey } from "@/lib/website-builder/editor-perf"
import { dynamicContext, withDynamicSources } from "@/lib/website-builder/storefront-data"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

/* A clock and timers the test moves by hand. */
function fakeClock() {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number; cb: () => void }>()
  return {
    now: () => now,
    after: (cb: () => void, ms: number) => {
      const id = next++
      timers.set(id, { at: now + ms, cb })
      return id
    },
    clear: (id: number) => {
      timers.delete(id)
    },
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = due[1].at
        due[1].cb()
      }
      now = end
    },
    pending: () => timers.size,
  }
}

function holdWithLog() {
  const clock = fakeClock()
  const log: string[] = []
  const hold = createExitHold({
    now: clock.now,
    after: clock.after,
    clear: clock.clear,
    show: () => log.push(`show@${clock.now()}`),
    fade: () => log.push(`fade@${clock.now()}`),
    remove: () => log.push(`remove@${clock.now()}`),
  })
  return { clock, log, hold }
}

console.log("\nEXIT: at least three seconds of Going back")
{
  check("the minimum is the owner's three seconds", EXIT_MIN_MS === 3000)
  check("and the fade matches the stylesheet's", EXIT_FADE_MS === 320 && /\.wb-exit-screen \{[\s\S]*?transition: opacity 320ms/.test(readSource("app/globals.css")))
  check("time left is counted from the press", exitRevealIn(1000, 1500) === 2500 && exitRevealIn(1000, 4500) === 0 && exitRevealIn(0, 0, 3000) === 3000)

  {
    const { clock, log, hold } = holdWithLog()
    check("the press puts it up", hold.start() === true && log[0] === "show@0" && hold.phase() === "holding")
    check("a second press while it is up is the same exit", hold.start() === false && log.length === 1)
    clock.advance(500)
    hold.arrived()
    clock.advance(2400)
    check("a quick page arriving at 500ms leaves it up until 3000ms", log.length === 1 && hold.phase() === "holding", log)
    clock.advance(100)
    check("at 3000ms it starts to fade", log[1] === "fade@3000" && hold.phase() === "fading", log)
    clock.advance(EXIT_FADE_MS)
    check("and is taken away once the fade is over", log[2] === `remove@${3000 + EXIT_FADE_MS}` && hold.phase() === "done" && clock.pending() === 0, log)
    check("a second arrival does nothing", (hold.arrived(), log.length === 3))
  }
  {
    const { clock, log, hold } = holdWithLog()
    hold.start()
    clock.advance(4200)
    check("a slow page: nothing moves before it is there", log.length === 1 && hold.phase() === "holding")
    hold.arrived()
    clock.advance(0)
    check("and once it is, the fade starts at once (the minimum is long over)", log[1] === "fade@4200", log)
  }
  {
    const { clock, log, hold } = holdWithLog()
    hold.start()
    clock.advance(800)
    hold.cancel()
    check("an exit that did not happen takes the screen away at once", log[1] === "remove@800" && hold.phase() === "done" && clock.pending() === 0, log)
    check("and the next press puts it up again", hold.start() === true && log[2] === "show@800")
    hold.arrived()
    hold.cancel()
    check("a cancel during the hold stops the reveal timer too", clock.pending() === 0 && hold.phase() === "done")
  }
  {
    const { log, hold } = holdWithLog()
    hold.arrived()
    hold.cancel()
    check("arrived or cancel with nothing up does nothing", log.length === 0 && hold.phase() === "idle")
  }

  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  const leaveFor = editor.slice(editor.indexOf("const leaveFor = useCallback("), editor.indexOf("}, [router])", editor.indexOf("const leaveFor = useCallback(")))
  check("one push per exit: leaveFor stands down once its push has gone, before the screen or the push",
    /if \(exitPushed\.current\) return\s*\n\s*exitPushed\.current = true\s*\n\s*exitScreen\.start\(\)/.test(leaveFor) && leaveFor.indexOf("exitPushed.current = true") < leaveFor.indexOf("router.push(href)"))
  check("the push still goes on the press, so the page behind loads while the screen is up", /\}, LEAVING_SEEN_MS\)/.test(leaveFor))
  const requestExit = editor.slice(editor.indexOf("const requestExit = useCallback("), editor.indexOf("const requestExit = useCallback(") + 400)
  check("the leave question comes first: with something to lose, requestExit asks and does not leave",
    /if \(hasSomethingToLose\(\{ draft: isDirty, code: codeDirty, busy: saving \|\| publishing \}\)\) \{\s*\n\s*setPendingExit\(href\)\s*\n\s*return\s*\n\s*\}\s*\n\s*leaveFor\(href\)/.test(requestExit))
  check("the bar's Back goes through requestExit", /onClick=\{\(\) => requestExit\("\/app\/website-builder"\)\}/.test(editor))
  check("Discard and Save in the question leave through leaveFor or goBackForReal", /if \(href === BACK_EXIT\) goBackForReal\(\)\s*\n\s*else if \(href\) \{\s*\n\s*leaveAnswered\.current = true\s*\n\s*leaveFor\(href\)/.test(editor))
  check("the browser's Back through the guard puts the screen up before going back", /exitScreen\.start\(\)\s*\n\s*backThen\(\(\) => leaveFor\("\/app\/website-builder"\)\)/.test(editor))
  check("a plain browser Back out of the builder puts it up too, and only out of /website-builder/",
    /if \(!guardArmed\.current && !goingBack\.current && !leavingRef\.current && !window\.location\.pathname\.startsWith\("\/website-builder\/"\)\) \{\s*\n\s*exitScreen\.start\(\)/.test(editor))
  check("the editor going away is the arrival", /useEffect\(\(\) => \(\) => \{\s*\n\s*cancelCeiling\.current\?\.\(\)\s*\n\s*exitScreen\.arrived\(\)/.test(editor))
  check("a revived editor takes the screen down and may leave again", /exitPushed\.current = false\s*\n\s*exitScreen\.cancel\(\)/.test(editor))
  check("the old glass inside the editor is gone (it went with the editor, in a cut)", !/className="wb-leaving"/.test(editor) && !/createPortal/.test(editor))
  const screen = readCode("components/website-builder/exit-screen.tsx")
  check("the screen is its own root on <body>, so it outlives the editor", /document\.body\.appendChild\(node\)/.test(screen) && /root = createRoot\(node\)/.test(screen))
  check("it is the entry loader's look: the squares and one line, light", /<BuilderLoader tone="light" lines=\{\[(tt\()?"Going back"\)?\]\} \/>/.test(screen) && /\.wb-exit-screen \{[\s\S]*?background: #ffffff;/.test(readSource("app/globals.css")))
  check("a page brought back from the back/forward cache takes it down", /if \(e\.persisted\) get\(\)\?\.cancel\(\)/.test(screen))
  check("EXIT_MIN_MS is defined once, and named as the owner's choice", /\/\*\* The owner's choice of how long the "Going back" screen stays up at the least\. \*\/\s*\nexport const EXIT_MIN_MS = 3000/.test(readSource("lib/website-builder/exit-hold.ts")) && !/EXIT_MIN_MS =/.test(editor) && !/EXIT_MIN_MS =/.test(screen))
}

console.log("\nKEYS: a memo keyed by what it reads")
{
  const page = [
    { id: "h", type: "header" },
    { id: "a", type: "hero_centered", settings: { heading: "One" } },
    { id: "p", type: "popup", group: "overlay" },
    { id: "b", type: "back_to_top", group: "overlay" },
  ] as { id: string; type: string; group?: "overlay"; settings?: Record<string, unknown> }[]
  const key = overlayTypesOf(page)
  const typed = page.map((s) => (s.id === "a" ? { ...s, settings: { heading: "One more" } } : s))
  check("a key typed in a heading is the same overlay key", overlayTypesOf(typed) === key && typed !== page)
  check("the key names the overlay types in page order", splitTypesKey(key).join(",") === "popup,back_to_top")
  check("one added to the Overlay group is a new key", overlayTypesOf([...page, { id: "c", type: "tab_bar", group: "overlay" }]) !== key)
  check("and a page with none is the empty key, read back as no types", overlayTypesOf(page.slice(0, 2)) === "" && splitTypesKey("").length === 0)

  /* A section with a placeholder in it, drawn again for a key typed elsewhere: the same filled object. */
  const schema = SECTION_SCHEMAS.text_rich
  const schemaOf = () => schema
  const dyn = dynamicContext({ theme: { brand_name: "Drew & Co" }, now: new Date("2026-10-17T00:00:00Z") })
  const footer = { id: "f", type: "text_rich", name: "Text", settings: { heading: "© {{ date.year }} {{ shop.name }}" }, blocks: [] } as SectionInstance
  const hero = { id: "h", type: "text_rich", name: "Text", settings: { heading: "One" }, blocks: [] } as SectionInstance
  const first = withDynamicSources([hero, footer], schemaOf, dyn)
  const typedHero = { ...hero, settings: { heading: "One more" } }
  const second = withDynamicSources([typedHero, footer], schemaOf, dyn)
  check("the placeholder is filled", first[1].settings.heading === "© 2026 Drew & Co", first[1].settings.heading)
  check("a key typed in another section leaves the filled one the same object", second[1] === first[1] && second[0] === typedHero)
  const dyn2 = dynamicContext({ theme: { brand_name: "Drew Studio" }, now: new Date("2026-10-17T00:00:00Z") })
  const third = withDynamicSources([typedHero, footer], schemaOf, dyn2)
  check("a new shop name fills it again", third[1] !== first[1] && third[1].settings.heading === "© 2026 Drew Studio")
  const editedFooter = { ...footer, settings: { heading: "{{ shop.name }}" } }
  check("and so does an edit to the section itself", withDynamicSources([typedHero, editedFooter], schemaOf, dyn)[1].settings.heading === "Drew & Co")
  check("what was stored keeps its placeholder", footer.settings.heading === "© {{ date.year }} {{ shop.name }}")

  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  const addable = editor.slice(editor.indexOf("const libraryAddable = useMemo("), editor.indexOf("const overlayAddable = useMemo("))
  check("the library's list no longer depends on the page's sections", addable.length > 0 && !/\bsections\b/.test(addable) && /compatInstall, overlayTypesKey\]\)/.test(addable))
  check("its key is read from the sections each render, cheaply", /const overlayTypesKey = overlayTypesOf\(sections\)/.test(editor))
}

console.log("\nWARM-UP: the library's previews measured in batches")
{
  const lib = readCode("components/website-builder/editor/section-library.tsx")
  check("a batch at a time", /export const MEASURE_BATCH = 8/.test(lib) && /const batch = unmeasured\.splice\(0, MEASURE_BATCH\)/.test(lib) && /sizes = measureMany\(batch\)/.test(lib))
  const many = lib.slice(lib.indexOf("function measureMany("), lib.indexOf("const idle ="))
  check("all of a batch goes in before any height is read", many.indexOf("ruler.append(...boxes)") > 0 && many.indexOf("ruler.append(...boxes)") < many.indexOf("getBoundingClientRect()"))
  check("each box is laid out as the ruler was: its width, and contained", /box\.style\.cssText = `width:\$\{item\.width\}px;contain:layout paint`/.test(many))
  check("the one-at-a-time measure is gone", !/function measureOne\(/.test(lib))
}

console.log("\nCOPY")
{
  const files = ["lib/website-builder/exit-hold.ts", "lib/website-builder/editor-perf.ts", "components/website-builder/exit-screen.tsx", "scripts/check-editor-perf.mjs", "scripts/check-editor-exit.mjs"]
  /* The words are spelled out in pieces so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "trans" + "form(?!:)"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = files.filter((f) => banned.test(readSource(f)))
  check("no em dash and no banned word in the new files", bad.length === 0, bad)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
