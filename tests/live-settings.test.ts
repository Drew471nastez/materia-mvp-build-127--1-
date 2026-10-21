/**
 * ===========================================================================
 *  A DRAG IS DRAWN LIVE AND COMMITTED ONCE, ROUND 25
 * ===========================================================================
 * "If I drag the slider for a heading's font size, the change on the canvas
 * is very laggy." A slider's values go to lib/website-builder/live-settings
 * while the finger is down, where only the section they belong to reads
 * them, and the editor hears the last of each once the finger lifts: one
 * undo step, one autosave. What that layer promises is held here; what it
 * does to the canvas's frames is measured by scripts/check-slider-latency.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  beginLive, deferLive, endLive, isLive, liveGesture, resetLive, setLiveBlockSetting, setLiveSectionSetting, withLive,
} from "@/lib/website-builder/live-settings"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const hero: SectionInstance = {
  id: "hero-1", type: "hero_centered", name: "Hero",
  settings: { padding_top: 80, heading: "Hello" },
  blocks: [{ id: "card", type: "card", settings: { title: "A" }, blocks: [{ id: "title", type: "heading", settings: { size: 24 } }] }],
} as SectionInstance

console.log("\nLAID OVER, NOT WRITTEN INTO")
{
  check("nothing live: the same object, so no section renders again", withLive(hero, undefined) === hero)
  const o = withLive(hero, { settings: { padding_top: 120 } })
  check("a section's value under a finger is drawn", o.settings.padding_top === 120 && o.settings.heading === "Hello")
  check("the editor's own copy is untouched", hero.settings.padding_top === 80)
  check("a value the editor already holds makes no new section", withLive(hero, { settings: { padding_top: 80 } }) === hero)
  const b = withLive(hero, { blocks: { "card/title": { size: 40 } } })
  check("a block inside a block, by its path", (b.blocks?.[0].blocks?.[0].settings as Record<string, unknown>).size === 40 && (hero.blocks?.[0].blocks?.[0].settings as Record<string, unknown>).size === 24)
  const bare = withLive(hero, { blocks: { title: { size: 32 } } })
  check("and by a bare id, as the header's link editor sends it", (bare.blocks?.[0].blocks?.[0].settings as Record<string, unknown>).size === 32)
}

console.log("\nONE COMMIT PER SETTING, WHEN THE FINGER LIFTS")
{
  resetLive()
  const runs: number[] = []
  check("no gesture: a setting is written straight away", isLive() === false)
  beginLive()
  check("a gesture: settings are live", isLive() === true)
  for (const v of [90, 100, 110, 120]) {
    setLiveSectionSetting("hero-1", "padding_top", v)
    deferLive("section:hero-1:padding_top", () => runs.push(v))
  }
  setLiveBlockSetting("hero-1", "card/title", "size", 30)
  check("nothing is committed while the finger is down", runs.length === 0)
  endLive()
  check("on release, the last value of each setting is committed, once", JSON.stringify(runs) === "[120]", runs)
  check("and the gesture is over", isLive() === false)
  endLive()
  check("a second release commits nothing again", JSON.stringify(runs) === "[120]")
}

console.log("\nA PRESS AND ITS RELEASE PAIR")
{
  resetLive()
  const g = liveGesture()
  g.end()
  check("a release with no press does not end somebody else's gesture", isLive() === false)
  g.begin(); g.begin()
  check("two presses are one gesture", isLive() === true)
  g.end()
  check("one release ends it", isLive() === false)
}

console.log("\nWIRED")
{
  const slider = read("components/website-builder/editor/slider-number-control.tsx")
  check("the slider's drag is a gesture: begun on the press, ended after its last value is sent", /beginLive\(\)/.test(slider) && /live\.current\.flush\(\)\s*endLive\(\)/.test(slider))
  const chip = read("components/website-builder/editor/color-chip.tsx")
  check("a colour dragged in the picker is a gesture too", /gesture\.begin\(\); handleSvPoint/.test(chip) && /gesture\.begin\(\); handleHuePoint/.test(chip))
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the editor's section, block and theme writers draw live during a gesture and defer their commit", /if \(isLive\(\)\) \{\s*setLiveSectionSetting/.test(page) && /setLiveBlockSetting\(sectionId, blockKey, key, value\)/.test(page) && /if \(isLive\(\)\) \{\s*setLiveThemeSetting/.test(page))
  check("only the section a value belongs to renders it", /const section = useLiveSection\(props\.section\)/.test(read("components/website-builder/sections/SectionRenderer.tsx")))
  /* Changed on purpose (round 34): onto the sections on screen while the finger is down, and onto the root once committed (canvasThemePatcher; tests/editor-live-edit-34.test.ts). */
  check("a theme value is written onto the canvas on the move, before any render", /useLiveTheme\(committedTheme, patchCanvasThemeVars\)/.test(page) && /canvasThemePatcher\(\{ committed: /.test(page))
  const commit = read("components/website-builder/editor/use-frame-commit.ts")
  check("a commit's cost is what its frame ran over the screen's frame, not the whole frame", /gap - \(Number\.isFinite\(frameMs\.current\)/.test(commit))
  const css = read("app/globals.css")
  check("pointing into a scroller restyles the scroller, not everything in it", /\.wb-slim-scroll > \* \{\s*scrollbar-color: transparent transparent;/.test(css))
}

resetLive()
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
