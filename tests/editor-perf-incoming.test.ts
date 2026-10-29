/**
 * Changes from outside land as what changed, and a burst of them is one
 * render (round perf2-1028).
 *
 * Measured in the real editor by scripts/check-editor-perf.mjs (PART=live):
 * a GitHub push that rewrote a page redrew every section for one replaced,
 * an Ask Storelib run's 24 edits a few ms apart were 146 commits, every key
 * and press in a connected editor threw a ReferenceError from the activity
 * poll, and the edits that came in behind a scroll waited a further second
 * after it rested. This holds the mechanisms that fixed them.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sameContent, shareSettings, shareUnchanged } from "@/lib/website-builder/incoming-diff"
import { frameLines, LINE_FALLBACK_MS } from "@/lib/website-builder/ask-client"
import { useStableHandlers } from "@/lib/website-builder/stable-handlers"
import * as React from "react"
import { renderToString } from "react-dom/server"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA page read back whole keeps the sections that did not change")
{
  const a = { id: "a", type: "hero", settings: { heading: "Hi", list: [1, 2] }, blocks: [] }
  const b = { id: "b", type: "faq", settings: { heading: "Q" }, blocks: [{ id: "b1", type: "q", settings: {} }] }
  const prev = [a, b]
  const same = [JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))]
  check("the same contents: the very array on screen", shareUnchanged(prev, same) === prev)
  const edited = [JSON.parse(JSON.stringify(a)), { ...JSON.parse(JSON.stringify(b)), settings: { heading: "New" } }]
  const out = shareUnchanged(prev, edited)
  check("one section edited: a new array, the other section kept by reference", out !== prev && out[0] === a && out[1] !== b && out[1].settings.heading === "New")
  const replaced = shareUnchanged(prev, [JSON.parse(JSON.stringify(a)), { id: "c", type: "stats", settings: {}, blocks: [] }])
  check("one section replaced: the new one is new, the kept one is the same object", replaced[0] === a && replaced[1].id === "c")
  const moved = shareUnchanged(prev, [JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a))])
  check("reordered: a new array of the same objects", moved !== prev && moved[0] === b && moved[1] === a)
  check("a shorter page is a new array", shareUnchanged(prev, [JSON.parse(JSON.stringify(a))]).length === 1)
  check("key order does not make a value different", sameContent({ x: 1, y: { z: [1, { k: 2 }] } }, { y: { z: [1, { k: 2 }] }, x: 1 }))
  check("a missing key does", !sameContent({ x: 1, y: undefined }, { x: 1, z: undefined }) && !sameContent({ x: [1] }, { x: { 0: 1 } }))
  const settings = { primary: "#111", schemes: { a: { bg: "#fff" } } }
  check("the same theme values keep the settings object", shareSettings(settings, JSON.parse(JSON.stringify(settings))) === settings)
  const changed = { ...settings, primary: "#222" }
  check("a changed value takes the new one", shareSettings(settings, changed) === changed)
}

console.log("\nThe editor reads a push back through that")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const quiet = editor.slice(editor.indexOf("if (quiet) {\n      startTransition(() => {"), editor.indexOf("} catch (err) {\n      console.error(\"[editor] loadData failed:\""))
  check("a quiet read lays the sections and the settings over what is on screen", /setSections\(\(prev\) => shareUnchanged\(prev, loaded\)\)/.test(quiet) && /setSettingsDraft\(\(prev\) => shareSettings\(prev, loadedSettings\)\)/.test(quiet))
}

async function lines() {
  console.log("\nAsk Storelib's lines are handed on once a frame, in order, none dropped")
  const got: { n: number; at: number }[] = []
  let tick = 0
  const feed = frameLines((e) => got.push({ n: Number(e.n), at: tick }))
  feed.push('{"n":1}\n{"n"')
  feed.push(':2}\n')
  feed.push('{"n":3}\n{"n":4')
  check("nothing is handed on in the task the text arrived in", got.length === 0)
  tick = 1
  /* No animation frame in node: the fallback timer is what hands them on, as in a tab in the background. */
  await new Promise((r) => setTimeout(r, LINE_FALLBACK_MS + 30))
  check("everything that arrived before the frame goes in one task, in order", got.map((g) => g.n).join() === "1,2,3" && got.every((g) => g.at === 1), got)
  tick = 2
  feed.push("}\n")
  feed.drain()
  check("drain hands on what arrived, at once", got.map((g) => g.n).join() === "1,2,3,4")
  feed.push('{"n":5}')
  feed.finish()
  check("finish hands on the last line, with or without its newline", got.map((g) => g.n).join() === "1,2,3,4,5")
  const client = read("lib/website-builder/ask-client.ts")
  const stream = client.slice(client.indexOf("export async function streamPost("), client.indexOf("function streamWithProgress("))
  check("the streamed answer goes through it, and what came before a stop is handed on first", /const feed = frameLines\(options\.onLine\)/.test(stream) && /catch \(error\) \{[\s\S]*feed\.drain\(\)[\s\S]*throw error/.test(stream) && /feed\.finish\(\)/.test(stream))
  const xhr = client.slice(client.indexOf("function streamWithProgress("))
  check("and the one with pictures too", /feed\.push\(text\.slice\(read\)\)/.test(xhr) && /feed\.finish\(\)/.test(xhr) && (xhr.match(/feed\.drain\(\)/g) ?? []).length === 2)
}

console.log("\nThe activity poll")
{
  const hook = read("components/website-builder/site-connections.tsx")
  const imports = hook.slice(hook.indexOf("import {\n  POLL_ACTIVE_MS"), hook.indexOf('} from "@/lib/agent-access/connection-mark"'))
  check("every constant the poll uses is imported (a press or a key threw a ReferenceError on each)", ["POLL_ACTIVE_MS", "POLL_BASE_MS", "POLL_MAX_MS"].every((k) => !hook.includes(k) || imports.includes(k)))
  check("an apply that waited for a scroll to rest reads again at once", /heldUp = Date\.now\(\) - applying >= POLL_ACTIVE_MS/.test(hook) && /else if \(heldUp\) delay = HELD_UP_MS/.test(hook) && /export const HELD_UP_MS = 50/.test(hook))
}

console.log("\nA render of the editor does not draw what did not change")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const wrapper = editor.slice(editor.indexOf("function FieldEditor(props"), editor.indexOf("/** One function per section or block"))
  check("a field's body is memoized and handed one stable onChange that calls the newest", /const latest = useRef\(props\.onChange\)/.test(wrapper) && /latest\.current = props\.onChange/.test(wrapper) && /useCallback\(\(v: unknown\) => latest\.current\(v\), \[\]\)/.test(wrapper) && /<FieldEditorBody label=\{props\.label\} field=\{props\.field\} value=\{props\.value\} onChange=\{onChange\} \/>/.test(wrapper))
  check("the body is the memo", /const FieldEditorBody = memo\(function FieldEditorBody\(/.test(editor))
  check("a section's and a block's translation keys are one function each, so the fields' context stays put", /keyFor=\{stableTextKey\(`section\\u0000\$\{section\.id\}`/.test(editor) && /stableTextKey\(`block\\u0000\$\{section\.id\}\\u0000\$\{block\.id\}`/.test(editor) && !/<TranslationScope keyFor=\{\(id\) =>/.test(editor))
  check("the section toolbar is memoized behind stable handlers", /const SectionToolbarBody = memo\(function SectionToolbarBody\(/.test(editor) && /const handlers = useStableHandlers\(\{/.test(editor) && /<SectionToolbarBody \{\.\.\.props\} \{\.\.\.handlers\} \/>/.test(editor))
  const bound = read("components/website-builder/editor/controls/collection-bound-field.tsx")
  const entry = bound.slice(bound.indexOf("export function CollectionBoundField("), bound.indexOf("function FollowsCollection("))
  check("only a setting that follows a collection reads the section's other settings", /if \(!props\.field\.from\) return/.test(entry) && !/useSiblingSettings\(\)/.test(entry) && /function FollowsCollection[\s\S]*useSiblingSettings\(\)/.test(bound))
}

async function handlers() {
  console.log("\nStable handlers call the newest one")
  /* Rendered twice through one component instance is not possible on the server, so the hook's two rules are read off its source and one render. */
  let got: { a?: (n: number) => unknown } = {}
  function Probe({ a }: { a: (n: number) => unknown }) {
    got = useStableHandlers({ a })
    return null
  }
  renderToString(React.createElement(Probe, { a: (n: number) => n * 2 }))
  check("a handler is passed on as a function that answers as the one given", typeof got.a === "function" && got.a(21) === 42)
  const src = read("lib/website-builder/stable-handlers.ts")
  check("one function per name for the life of the component, each reading the latest render's", /latest\.current = handlers/.test(src) && /if \(!stable\.current\[name\]\)/.test(src) && /latest\.current\[name\]\?\.\(\.\.\.args\)/.test(src))
}

console.log("\nWhat is kept hidden stays still, and drawing ahead steps aside")
{
  const css = read("app/globals.css")
  /* Changed on purpose (round 44): the section library's previews hold nothing that moves (REVEAL_SHOWN freezes them), so it is no longer in the pause rule, whose `*` restyled the whole library on every open and close. */
  check("animations inside the closed block picker and Ask card are paused, and the library's previews never move", /\[data-block-picker-layer\]\[data-state="closed"\] \*,[\s\S]*?\[data-ask-card\]\[aria-hidden="true"\] \*::after \{\s*animation-play-state: paused !important;/.test(css) && !/\.wb-library-layer\[data-state="closed"\] \*,/.test(css) && /\.wb-pv \*\{animation-duration:0s!important/.test(read("components/website-builder/editor/section-library.tsx")))
  const lib = read("components/website-builder/editor/section-library.tsx")
  /* Changed on purpose (round 44): an open one waits out a press or a scroll (pressQuietFor), a third of a second. */
  check("a closed library puts its cards in only once the editor is quiet", /const wait = open \? pressQuietFor\(\) : busyFor\(\)/.test(lib) && /later = window\.setTimeout\(step, wait\)/.test(lib) && /window\.clearTimeout\(later\)/.test(lib))
  check("and steps aside while a change from outside lands", /export function deferPreviewsForChange\(\)/.test(lib) && /if \(events\.length > 0\) deferPreviewsForChange\(\)/.test(read("app/website-builder/editor/[installId]/page.tsx")))
}

console.log("\nNo repeated asks on a slow or signed out network")
{
  const own = read("lib/analytics/own-site.ts")
  check("an ask for the own-site token that came back empty is not asked again on every mount for a while", /if \(refusedAt && Date\.now\(\) - refusedAt < RETRY_AFTER_MS\) return/.test(own) && /\} else refusedAt = Date\.now\(\)/.test(own) && /export const RETRY_AFTER_MS = 30_000/.test(own))
}

console.log("\nThe measurement")
{
  const probe = read("scripts/check-editor-perf.mjs")
  check("the editor probe scrolls the canvas on a computer and a phone, Storelib and imported", /synthesizeScrollGesture/.test(probe) && /mouse\.wheel/.test(probe) && /THEMES = \(process\.env\.THEME \?\? "storelib,imported"\)/.test(probe))
  check("it plays agent edits, a burst, a push and an Ask run under an open editor", /agent burst of 12/.test(probe) && /github push rewrote the page/.test(probe) && /ask run, 24 edits 4ms apart/.test(probe))
  check("and holds them to budgets", /function budgets\(all, cpu\)/.test(probe))
  check("this suite runs with the others", read("scripts/run-push-tests.mjs").includes('"tests/editor-perf-incoming.test.ts"'))
}

void lines().then(handlers).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
