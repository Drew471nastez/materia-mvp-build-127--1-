/**
 * ===========================================================================
 *  ROUND 11: THE EDITOR'S PILLS, ITS DESIGN PAGES, ITS TAB BAR, ITS WAY OUT
 * ===========================================================================
 * The shape of what scripts/check-onepage-motion-r11.mjs measures in a real
 * browser (the chosen pill's contrast at 390 and 1440, light and dark, each
 * switch frame by frame, the tab bar under a finger, and leaving the editor
 * every way in a real Next app around the /app shell).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PILL_FILL, PILL_WORDS_ON, PILL_WORDS_OFF, CONTENT_IN_FROM } from "@/lib/ui/pill-switch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/* Comments out, so a sentence about a class is not the class. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (a: string, b: string) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

console.log("\nThe chosen pill can be read")
{
  const pills = code("components/onepage/pill-tabs.tsx")
  check("no word is drawn by CSS (an empty `content: attr()` copy was the black pill with nothing on it)", !/content-\[attr/.test(pills) && !/data-text=/.test(pills))
  check("the word is the button's own text, once", /<PillWord on=\{on\} text=\{item\.label\} align=\{align\} \/>/.test(pills) && /\{text\}\s*<\/span>/.test(pills))
  const fill = PILL_FILL.match(/bg-\[(#[0-9a-f]{6})\]/i)?.[1] ?? ""
  const ink = PILL_WORDS_ON.match(/text-\[(#[0-9a-f]{6})\]/i)?.[1] ?? ""
  const grey = PILL_WORDS_OFF.match(/text-\[(#[0-9a-f]{6})\]/i)?.[1] ?? ""
  const on = contrast(ink, fill)
  const off = contrast(grey, "#ffffff")
  check("the chosen pill's words against its fill are 4.5:1 or more", on >= 4.5, { ink, fill, on: Math.round(on * 100) / 100 })
  check("and a pill not chosen, grey on white, too", off >= 4.5, { grey, off: Math.round(off * 100) / 100 })
  check("the fill and the words are Storelib's own pills (lib/ui/pill-switch), a caller only sizes them",
    /cn\(PILL_FILL, on \? "opacity-100" : "opacity-0"\)/.test(pills) && /cn\(PILL_TAB, itemClassName\)/.test(pills) && !/pillClassName|onClass|offClass/.test(pills.slice(pills.indexOf("export function PillTabs"), pills.indexOf("function scrollerOf"))))
  check("a hover colours a word only where there is a mouse", /\[@media\(hover:hover\)\]:group-hover\/pill/.test(PILL_WORDS_OFF))
  check("a finger's choice gives a light haptic tick, a mouse's none", /if \(pointer\.current === "touch"\) hapticTap\("light"\)/.test(pills))
  const callers = ["components/onepage/tabs/settings-tab.tsx", "components/onepage/tabs/design-tab.tsx"].map(code).join("\n")
  check("no row hands in a dark pill or white words", !/pillClassName=|onClass="text-white"/.test(callers.replace(/<TabFace[^>]*>/g, "")))
}

console.log("\nWhat is under the pills switches as Storelib's settings do")
{
  const pills = code("components/onepage/pill-tabs.tsx")
  check("the section left is not drawn in the frame the next one arrives", /const drawn = p\.id === state\.shown\n/.test(pills))
  check("the next lands from most of the way there on opacity alone, never from nothing", CONTENT_IN_FROM >= 0.5 && /incoming\.animate\(\[\{ opacity: PANEL_IN_FROM \}, \{ opacity: 1 \}\]/.test(pills) && !/translate3d\(\$\{dx\}/.test(pills))
}

console.log("\nSettings has room, and Billing is /app's")
{
  const settings = code("components/onepage/tabs/settings-tab.tsx")
  check("each section is /app's card, with its room", /className=\{cn\(APP_CARD, "p-5 sm:p-6"\)\}/.test(settings) && /import \{ StatusBadge, card as APP_CARD \} from "@\/app\/\(storelib\)\/app\/orders\/order-parts"/.test(settings))
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  check("the plan reads as Billing's plan card: current plan, price, fee per digital and per physical sale", /data-settings-plan=""/.test(settings) && /tt\("Current plan"\)/.test(settings) && /tt\("Fee per digital sale"\)/.test(settings) && /tt\("Fee per physical sale"\)/.test(settings) && /text-\[34px\] font-bold/.test(settings))
  /* Changed on purpose (round 42): "make them one horizontal row that scrolls, with small arrow buttons". The row no longer wraps from 768px; it scrolls at every width, with fades and arrows (PillTabs scroll). */
  check("the pill row is one row at every width: it scrolls with an end piece, no bar (app-no-scrollbar), fades and arrows",
    !/md:flex-wrap/.test(settings) && /scroll=\{\{ wrapClassName: "-mx-4 md:-mx-6" \}\}/.test(settings) && /app-no-scrollbar after:block after:w-px after:shrink-0/.test(settings) && !/\.no-scrollbar\s*\{/.test(read("components/onepage/tabs/settings-tab.tsx")))
  check("Settings is 768px wide in the editor, so the seven pills are one row where the column holds them", /t === "settings" \? "max-w-3xl"/.test(code("components/onepage/onepage-editor.tsx")))
  check("on Free, the plan cards are the very ones Billing draws", /<PlanCards\s+compact/.test(settings) && /from "@\/components\/billing\/plan-cards"/.test(settings))
}

console.log("\nThe Design pages move as the app's sub-pages do")
{
  const design = code("components/onepage/tabs/design-tab.tsx")
  const body = design.slice(design.indexOf("export function DesignTab("), design.indexOf("function reducedMotion("))
  check("on a phone the panel rises and drops on the page layer's times and curve", /from "@\/components\/app\/page-layer"/.test(design) && /const PUSH_MS = LAYER_MOTION_MS/.test(design) && /startWhenFramesFlow\(anims\)/.test(body))
  check("no crossfade: no page fades out under another", !/leaving\.animate\(\[\{ opacity/.test(body) && !/arriving\.animate\(/.test(body))
  check("transform and opacity only", !/\.animate\(\[\{ (top|left|height|width|margin)/.test(body))
}

console.log("\nThe phone's tab bar holds still under a thumb")
{
  const editor = code("components/onepage/onepage-editor.tsx")
  const bar = editor.slice(editor.indexOf('data-onepage-tabbar=""'), editor.indexOf("<ShareOnePage"))
  check("no press scales or moves a button", !/active:scale|hover:scale|active:translate|hover:translate/.test(bar))
  check("no hover style at all in the bar", !/\bhover:/.test(bar))
  check("a press greys the button's own ground, a named property", /transition-\[background-color\] duration-\[120ms\] ease-out active:bg-\[#f3f4f6\]/.test(bar))
  check("a light haptic tick on a finger's tap", /if \(phonePointer\.current === "touch" && !on\) hapticTap\("light"\)/.test(bar) && /import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(editor))
}

console.log("\nLeaving the editor leaves nothing behind")
{
  const editor = code("components/onepage/onepage-editor.tsx")
  const guard = code("components/platform/stuck-layer-guard.tsx")
  check("the editor's class on <html> is taken off once its editor is gone, whatever the way out",
    /\["with-op-editor", "\[data-onepage-editor\]"\]/.test(guard) && /else html\.classList\.remove\(name\)/.test(guard) && /mo\.observe\(html, \{ attributes: true, attributeFilter: \["class"\] \}\)/.test(guard))
  check("the editor starts where the rail ends, open or a row of icons", /md:left-\[var\(--app-rail-w,240px\)\]/.test(editor) && !/md:left-\[240px\] md:top-\[58px\]/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
