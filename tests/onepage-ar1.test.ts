/**
 * Round AR, track 1: how a OnePage feels, in the preview and on the live page.
 *
 *   - the round Close over the keyboard (images/133.webp): the keyboard counts
 *     as up from the visible height too, so Safari's pan (inset 0) never brings
 *     the bar back; the focused field is scrolled above the keys
 *   - sheets open with their content: the form and the legal text are read
 *     while the page is idle, a press that finds them opens at once, and no
 *     grey bars stand in for a sheet's content
 *   - every button and row answers a press at once, from pointerdown, in one
 *     shared rule, and the action is never held back
 *   - Back inside a form or booking sheet moves a step, then closes; never a
 *     navigation
 *   - the Hero darkens and is held back as the page slides over it, with a
 *     slim bar once it has gone (CSS scroll timelines, a passive fallback)
 *   - a block taken off folds away, in the editor's list and in the preview
 *   - a setting changed in the preview keeps a shelf's products drawn
 *
 * scripts/check-onepage-ar1.mjs measures them in Chromium.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { HERO_DIM_MAX, KEYBOARD_MIN_PX, heroScroll, heroScrollEffect, keyboardState, revealDelta, sheetBack, topBarShown, withLeaving } from "@/lib/onepage/feel"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── The keyboard ── */
const phone = { field: true, touch: true, layoutHeight: 844 }
let m = { saw: false }
let s = keyboardState({ ...phone, inset: 0, visibleHeight: 844 }, m)
check("a field focused on a touch phone: the keyboard counts as up before it is reported", s.up)
m = s.memory
s = keyboardState({ ...phone, inset: 336, visibleHeight: 508 }, m)
check("reported: up, and remembered", s.up && s.memory.saw)
m = s.memory
s = keyboardState({ ...phone, inset: 0, visibleHeight: 508 }, m)
check("images/133.webp: Safari panned to the field (inset 0, visible height still cut): still up", s.up)
m = s.memory
s = keyboardState({ ...phone, inset: 0, visibleHeight: 844 }, m)
check("the keys put away with the field still focused (Android Back): down", !s.up)
check("blurred: down, and forgotten", !keyboardState({ ...phone, field: false, inset: 336, visibleHeight: 508 }, { saw: true }).up)
check("a mouse never hides the bar", !keyboardState({ field: true, touch: false, layoutHeight: 900, inset: 0, visibleHeight: 900 }, { saw: false }).up)
check("a collapsing toolbar is not a keyboard", !keyboardState({ field: true, touch: false, layoutHeight: 844, inset: 0, visibleHeight: 844 - KEYBOARD_MIN_PX + 40 }, { saw: false }).up)
check("a field under the keys is scrolled up by what it is under", revealDelta({ top: 600, bottom: 700 }, { top: 100, bottom: 800 }, 508) === 700 - (508 - 16))
check("never so far that its top goes under the sheet's top", revealDelta({ top: 130, bottom: 700 }, { top: 100, bottom: 800 }, 508) === 130 - 116)
check("a field in view is left alone", revealDelta({ top: 200, bottom: 260 }, { top: 100, bottom: 800 }, 508) === 0)

const sheet = read("components/onepage/block-sheet.tsx")
check("the sheet reads the keyboard through keyboardState with the visible height and its own fixed box", /keyboardState\(\s*\{ field, touch: touch\(\), inset: readPublishedKeyboardInset\(\), layoutHeight, visibleHeight: Math\.round\(vv\?\.height \?\? layoutHeight\) \}/.test(sheet) && /rootRef\.current\?\.clientHeight/.test(sheet))
check("the foot bar with the round Close is hidden while typing", /typing( \|\| footless)? \? "hidden" : "flex"/.test(sheet))
check("the focused field is brought above the keys inside the sheet's scroll", /revealDelta\(field\.getBoundingClientRect\(\), body\.getBoundingClientRect\(\), visibleBottom\)/.test(sheet))

/* ── Sheets open with their content ── */
const frame = read("components/forms/action-frame.tsx")
check("a form's code and questions are read when its button nears the screen, while idle", /new IntersectionObserver/.test(frame) && /whenIdle\(\(\) => void warmForm\(warmId\)/.test(frame) && /rootMargin: "600px 0px"/.test(frame))
check("and on hover and a finger coming down", /onPointerEnter=\{warmable \?/.test(frame) && /onPointerDownCapture=\{formId && blockSheet\.available \? \(\) => void warmForm\(formId\)/.test(frame))
check("a press that finds both opens the sheet in that same task", /if \(sheetBodyModule && readyForms\.has\(id\)\) return showFormSheet\(id, sheetBodyModule\)/.test(frame))
check("no pulsing bars while a form is on its way in the sheet", !/animate-pulse/.test(frame) && /quietLoading/.test(read("components/forms/form-sheet-body.tsx")) && /if \(loading && quietLoading\)/.test(read("components/forms/public-form.tsx")))
const legal = read("components/onepage/onepage-legal-links.tsx")
check("Privacy and Terms: the reader is fetched while idle and opened with its text, no grey bars", /requestIdleCallback\(run/.test(legal) && /if \(Reader\) return setOpen\(true\)/.test(legal) && !/rounded-full bg-\[var\(--sheet-field\)\]" style=\{\{ width/.test(legal) && !/next\/dynamic/.test(legal))
check("an embed's dots appear only after half a second", /\[animation:op-late-in_200ms_ease-out_500ms_both\]/.test(sheet) && /@keyframes op-late-in/.test(read("app/globals.css")))

/* ── Press ── */
const css = read("app/globals.css")
const press = read("components/onepage/press-feel.ts")
/* Round 3 (tests/onepage-contrast-r3): the press sinks without fading the words. */
check("one press rule for every OnePage button, from pointerdown, scale only, no fade over its words", /html\[data-op-press\] \[data-op-pressing\]:not\(#op\) \{\s*scale: 0\.965;\s*opacity: 1;/.test(css) && /document\.addEventListener\("pointerdown", onDown, opts\)/.test(press))
check("the press listeners are passive: the click is never held back", /const opts = \{ passive: true, capture: true \} as const/.test(press) && !/preventDefault/.test(press))
check("a finger that scrolls lets go", /pointercancel/.test(press) && /SLOP_PX/.test(press))
check("the public page turns it on", /usePressFeel\(\)/.test(read("components/onepage/public-onepage.tsx")))

/* ── Back inside a sheet ── */
check("Back with a step to go back to is a step; from the first step it closes", sheetBack(2) === "step" && sheetBack(1) === "step" && sheetBack(0) === "close")
check("the sheet asks the steps first and stands on its entry again (no navigation, no reload)", /if \(stepBack\(\)\) \{\s*try \{\s*window\.history\.pushState\(historyWith\(mark\.current\), "", window\.location\.href\)/.test(sheet))
const form = read("components/forms/public-form.tsx")
check("the form takes Back while it has a step, and slides each step in from its side", /sheetBack\.take\(/.test(form) && /slide-in-from-left-3/.test(form) && /slide-in-from-right-3/.test(form))

/* ── Hero ── */
const top = heroScroll(0, 400)
const half = heroScroll(200, 400)
const past = heroScroll(900, 400)
check("the hero is untouched at the top", top.dim === 0 && top.shift === 0 && top.scale === 1)
check("it darkens and is held back as it scrolls, to a limit", half.dim > 0 && half.dim < past.dim && past.dim === HERO_DIM_MAX && half.shift === 70 && past.shift === 140)
check("only the full picture hero gets it, not the circle", heroScrollEffect("hero", true) && !heroScrollEffect("classic", true) && !heroScrollEffect("hero", false))
check("the bar shows once the profile's foot is under it, and hides as it comes back", topBarShown(40, 56) && !topBarShown(80, 56))
check("CSS scroll timelines on the hero's own box, transform and opacity only", /view-timeline: --op-hero block/.test(css) && /animation-range: exit 0% exit 100%/.test(css) && /@keyframes op-hero-shift \{\s*from \{ translate: 0 0; scale: 1; \}/.test(css))
const hero = read("components/onepage/hero-scroll.tsx")
check("the bar is shown by an IntersectionObserver, the fallback listener is passive", /new IntersectionObserver/.test(hero) && /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(hero) && /CSS\.supports\("animation-timeline: view\(\)"\)/.test(hero))

/* ── Leaving ── */
const a = { id: "a" }, b = { id: "b" }, c = { id: "c" }
const drawn = [a, b, c].map((x) => ({ id: x.id, item: x, leaving: false }))
const next = withLeaving(drawn, [a, c], new Set())
check("a removed block is kept at its place, marked leaving", next.map((e) => `${e.id}${e.leaving ? "*" : ""}`).join(",") === "a,b*,c")
check("and dropped once it has folded away", withLeaving(next, [a, c], new Set(["b"])).map((e) => e.id).join(",") === "a,c")
check("a first block removed stays first", withLeaving(drawn, [b, c], new Set()).map((e) => e.id).join(",") === "a,b,c")
check("the editor's card folds before the block is taken off", /onRemove=\{\(\) => foldThen\(block\.id,/.test(read("components/onepage/tabs/links-tab.tsx")))

/* ── The preview keeps a shelf drawn ── */
check("a shelf keeps the last answer's products while a changed setting is asked about", /if \(answer\) \{\s*const now = Object\.fromEntries/.test(read("components/onepage/storelib-blocks.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
