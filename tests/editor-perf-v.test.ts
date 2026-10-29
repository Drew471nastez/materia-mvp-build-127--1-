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
 *             exit per press, the leave question asked before any of it,
 *             the screen in the canvas rather than over the window (Y1)
 *   KEYS      a memo keyed by what it reads, not by the whole page
 *   WARM-UP   the section library's previews measured in batches
 *
 * Run with:  npx tsx tests/editor-perf-v.test.ts
 */
import { readCode, readSource } from "./_source"
import { EXIT_FADE_IN_MS, EXIT_MIN_MS, createExitHold, exitWatchdogMs } from "@/lib/website-builder/exit-hold"
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
    after: clock.after,
    clear: clock.clear,
    show: () => log.push(`show@${clock.now()}`),
    go: () => log.push(`go@${clock.now()}`),
  })
  return { clock, log, hold }
}

console.log("\nEXIT: at least three seconds of Going back, in the canvas")
{
  check("the minimum is the owner's three seconds", EXIT_MIN_MS === 3000)
  check("and the entrance matches the stylesheet's", EXIT_FADE_IN_MS === 220 && /\.wb-exit-canvas \{\s*animation: wb-exit-in 220ms/.test(readSource("app/globals.css")))
  check("the editor gives up on a way out after the minimum, the ceiling and two seconds", exitWatchdogMs(8000) === 13_000 && exitWatchdogMs(8000, 1000) === 11_000)

  {
    const { clock, log, hold } = holdWithLog()
    check("the press puts it up", hold.start() === true && log[0] === "show@0" && hold.phase() === "holding")
    check("a second press while it is up is the same exit", hold.start() === false && log.length === 1)
    clock.advance(2999)
    check("nothing is pushed before 3000ms", log.length === 1 && hold.phase() === "holding", log)
    clock.advance(1)
    check("at 3000ms it navigates, once", log[1] === "go@3000" && hold.phase() === "gone" && clock.pending() === 0, log)
    check("and a press after that is still the same exit", hold.start() === false && log.length === 2)
  }
  {
    const { clock, log, hold } = holdWithLog()
    hold.start()
    clock.advance(800)
    hold.cancel()
    clock.advance(5000)
    check("an exit that did not happen never navigates", log.length === 1 && hold.phase() === "idle" && clock.pending() === 0, log)
    check("and the next press puts it up again", hold.start() === true && log[1] === "show@5800")
  }
  {
    const { log, hold } = holdWithLog()
    hold.cancel()
    check("cancel with nothing up does nothing", log.length === 0 && hold.phase() === "idle")
  }

  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  const leaveFor = editor.slice(editor.indexOf("const leaveFor = useCallback("), editor.indexOf("}, [router])", editor.indexOf("const leaveFor = useCallback(")))
  check("one push per exit: leaveFor stands down once its exit has started",
    /if \(exitPushed\.current\) return\s*\n\s*exitPushed\.current = true/.test(leaveFor) && leaveFor.indexOf("exitPushed.current = true") < leaveFor.indexOf("router.push(href)"))
  check("the screen goes up on the press, and the push once it has been up EXIT_MIN_MS", /setLeaving\(true\)/.test(leaveFor) && /\}, EXIT_MIN_MS\)/.test(leaveFor) && leaveFor.indexOf("setLeaving(true)") < leaveFor.indexOf("router.push(href)"))
  check("the way out is warmed on the press", /router\.prefetch\(href\)/.test(leaveFor))
  const requestExit = editor.slice(editor.indexOf("const requestExit = useCallback("), editor.indexOf("const requestExit = useCallback(") + 400)
  check("the leave question comes first: with something to lose, requestExit asks and does not leave",
    /if \(hasSomethingToLose\(\{ draft: isDirty, code: codeDirty, busy: saving \|\| publishing \}\)\) \{\s*\n\s*setPendingExit\(href\)\s*\n\s*return\s*\n\s*\}\s*\n\s*leaveFor\(href\)/.test(requestExit))
  check("the bar's Back goes through requestExit", /onClick=\{\(\) => requestExit\("\/app\/website-builder"\)\}/.test(editor))
  check("Discard and Save in the question leave through leaveFor or goBackForReal", /if \(href === BACK_EXIT\) goBackForReal\(\)\s*\n\s*else if \(href\) \{\s*\n\s*leaveAnswered\.current = true\s*\n\s*leaveFor\(href\)/.test(editor))
  check("the browser's Back through the guard leaves through leaveFor once it has stepped off the guard", /backThen\(\(\) => leaveFor\("\/app\/website-builder"\)\)/.test(editor))
  check("a plain browser Back out of the builder lays nothing over the page that arrives",
    /if \(!guardArmed\.current && !goingBack\.current && !leavingRef\.current && !window\.location\.pathname\.startsWith\("\/website-builder\/"\)\) return/.test(editor))
  check("the editor going away cancels the hard load", /useEffect\(\(\) => \(\) => \{\s*\n\s*cancelCeiling\.current\?\.\(\)\s*\n\s*\}, \[\]\)/.test(editor))
  check("a revived editor takes the screen down, drops the waiting push and may leave again", /exitPushed\.current = false\s*\n\s*cancelCeiling\.current\?\.\(\)/.test(editor))
  check("the old glass and the white sheet on <body> are gone", !/className="wb-leaving"/.test(editor) && !/createPortal/.test(editor) && !/exitScreen/.test(editor) && !/\.wb-exit-screen/.test(readSource("app/globals.css")))
  check("the screen is in the canvas: inside the canvas's <main>, over it and nothing else",
    (() => {
      const main = editor.slice(editor.indexOf("ref={canvasMainRef}"), editor.indexOf("</main>", editor.indexOf("ref={canvasMainRef}")))
      return /\{leaving && \(\s*\n\s*<div\s*\n\s*className="wb-exit-canvas absolute inset-0 z-\[60\] flex items-center justify-center bg-white"/.test(main)
    })())
  check("it is the entry loader's look: the squares and one line, light", /<BuilderLoader className="wb-loading-line" tone="light" lines=\{\["Going back"\]\} \/>/.test(editor))
  check("EXIT_MIN_MS is defined once, and named as the owner's choice", /\/\*\* The owner's choice of how long the "Going back" screen stays up at the least\. \*\/\s*\nexport const EXIT_MIN_MS = 3000/.test(readSource("lib/website-builder/exit-hold.ts")) && !/EXIT_MIN_MS =/.test(editor))
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
  check("the library's list no longer depends on the page's sections", addable.length > 0 && !/\bsections\b/.test(addable) && /* Changed on purpose (round canvas-1023): and on whether the install's files are read, so the built-in schemas are not all read as the editor opens. */ /* Changed on purpose (round BC): plus missingOwnKey, a string of the page's missing main sections read each render like overlayTypesKey. */ /compatInstall, overlayTypesKey, storelibSourcesRead(, missingOwnKey)?\]\)/.test(addable))
  check("its key is read from the sections each render, cheaply", /const overlayTypesKey = overlayTypesOf\(sections\)/.test(editor))
}

console.log("\nWARM-UP: the library's previews measured in batches")
{
  const lib = readCode("components/website-builder/editor/section-library.tsx")
  /* Changed on purpose (round 44): a batch is as many as the idle moment has room for on this device, eight at most. */
  check("a batch at a time", /export const MEASURE_BATCH = 8/.test(lib) && /const batch = unmeasured\.splice\(0, roomFor\(deadline, measureCost, MEASURE_BATCH\)\)/.test(lib) && /sizes = measureMany\(batch\)/.test(lib))
  const many = lib.slice(lib.indexOf("function measureMany("), lib.indexOf("const idle ="))
  check("all of a batch goes in before any height is read", many.indexOf("ruler.append(...boxes)") > 0 && many.indexOf("ruler.append(...boxes)") < many.indexOf("getBoundingClientRect()"))
  check("each box is laid out as the ruler was: its width, and contained", /box\.style\.cssText = `width:\$\{item\.width\}px;contain:layout paint`/.test(many))
  check("the one-at-a-time measure is gone", !/function measureOne\(/.test(lib))
}

console.log("\nCOPY")
{
  const files = ["lib/website-builder/exit-hold.ts", "lib/website-builder/editor-perf.ts", "scripts/check-editor-perf.mjs", "scripts/check-editor-exit.mjs", "scripts/check-sidebar-fields.mjs", "scripts/render-sidebar-fields-probe.tsx"]
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
