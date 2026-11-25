/**
 * Materia's motion settings and the canvas that shows them (round 27).
 *
 *   SETTINGS   every "When a section scrolls into view" type, old and new,
 *              is drawn by animation.css (its type class and both armed
 *              rules), its keyframe starts partly visible (never blank) and
 *              ends at rest; the old values keep their names and the
 *              defaults are what installs already have; every template's
 *              chosen type is one the theme offers; every Image hover effect
 *              has its rule in theme.css; no em dashes in the labels.
 *   SCRIPTS    animation.js parses, listens for storelib:theme-change on the
 *              Animations settings only, and cleans every mark it adds.
 *   CANVAS     an older install's theme marks itself in an editor because it
 *              sits in a frame (editor-live-images before round 26): the
 *              canvas takes that class off until the first edit, keeps one
 *              the server drew, and leaves the class alone after an edit.
 *              The bridge passes "theme-changed" on as storelib:theme-change.
 *
 * Measured in Chromium by scripts/check-canvas-reveal-r27.ts (every type on
 * the live page, the editor's canvas with the current and an older install,
 * the replay, pictures on a slow network).
 *
 *   npx tsx tests/theme-motion-r27.test.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { CANVAS_BRIDGE, CANVAS_DESIGN_GUARD, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

const BASE = join(process.cwd(), "theme-packages", "materia", "base")
const css = readFileSync(join(BASE, "assets", "animation.css"), "utf8")
const js = readFileSync(join(BASE, "assets", "animation.js"), "utf8")
const themeCss = readFileSync(join(BASE, "assets", "theme.css"), "utf8")
const schema = JSON.parse(readFileSync(join(BASE, "config", "settings_schema.json"), "utf8")) as { name?: string; settings?: { id?: string; default?: unknown; options?: { value: string; label: string }[]; label?: string; info?: string }[] }[]
const anim = schema.find((g) => g.name === "Animations")!.settings!
const setting = (id: string) => anim.find((s) => s.id === id)!

console.log("\nSETTINGS")
const types = setting("scroll_animation").options!.map((o) => o.value)
const OLD_TYPES = ["none", "fade_in", "slide_in", "zoom_in", "subtle_rise", "cinematic", "blur_up", "slide_side", "mask_reveal"]
check("every value installs already have is still offered", OLD_TYPES.every((t) => types.includes(t)), types)
check("new types are offered: fade up, blur in, one by one, word by word", ["fade_up", "blur_in", "stagger_up", "split_text"].every((t) => types.includes(t)), types)
check("defaults are unchanged (none, 600ms, 0ms, zoom in, no zoom on scroll)", setting("scroll_animation").default === "none" && setting("animation_duration").default === 600 && setting("animation_delay").default === 0 && setting("hover_effect").default === "hover_zoom" && setting("zoom_image").default === false)
check("the new Delay between items defaults to the stagger the theme had (75ms)", setting("reveal_stagger")?.default === 75 && /--reveal-stagger: 75ms/.test(css))
const armedRules = [...css.matchAll(/\.scroll-trigger\.scroll-trigger--armed[^{]*:is\(([^)]*)\)/g)].map((m) => m[1]).filter((r) => r.includes(".fade_in"))
for (const t of types.filter((x) => x !== "none")) {
  const name = new RegExp(`\\.scroll-trigger\\.${t} \\{ --reveal-name: (\\w+)`).exec(css)?.[1]
  const inRules = armedRules.length >= 2 && armedRules.every((r) => r.split(",").map((x) => x.trim()).includes(`.${t}`))
  const frame = name ? new RegExp(`@keyframes ${name} \\{\\s*from \\{([^}]*)\\}`).exec(css)?.[1] ?? "" : ""
  const fromOpacity = /opacity: var\(--reveal-from-opacity, ([\d.]+)\)/.exec(frame)?.[1] ?? /opacity: ([\d.]+)/.exec(frame)?.[1]
  check(`${t}: drawn (${name}), armed and played, starts at opacity ${fromOpacity}`, !!name && inRules && Number(fromOpacity) >= 0.15, { name, inRules, frame })
}
check("the waiting opacity is never 0", Number(/--reveal-from-opacity: ([\d.]+)/.exec(css)?.[1]) >= 0.15)
for (const k of ["revealPartUp", "revealUnmask", "revealWord", "revealUnmaskCard"]) {
  const frame = new RegExp(`@keyframes ${k} \\{\\s*from \\{([^}]*)\\}`).exec(css)?.[1] ?? ""
  const o = /opacity: var\(--reveal-from-opacity, ([\d.]+)\)/.exec(frame)?.[1] ?? /opacity: ([\d.]+)/.exec(frame)?.[1]
  check(`${k} starts partly visible`, Number(o) >= 0.15, frame)
}
check("only compositor-friendly properties in the reveal keyframes (opacity, transform, filter, clip-path)", [...css.matchAll(/@keyframes reveal\w+ \{([\s\S]*?)\n\}/g)].every((m) => [...m[1].matchAll(/([a-z-]+):/g)].every((p) => ["opacity", "transform", "filter", "clip-path"].includes(p[1]))))
check("reduced motion shows the parts, words and zooms too", /prefers-reduced-motion: reduce\)[\s\S]{0,200}\[data-reveal-part\], \[data-reveal-zoom\], \.mt-word/.test(css))
check("a finished reveal lets go of its parts", /\.scroll-trigger\[data-animation-done\] :is\(\[data-reveal-part\], \[data-reveal-zoom\], \.mt-word\) \{ animation: none !important; \}/.test(css))

const templatesDir = join(process.cwd(), "theme-packages", "materia", "templates")
const chosen = readdirSync(templatesDir).filter((d) => existsSync(join(templatesDir, d, "config", "settings_data.json"))).map((d) => {
  const data = JSON.parse(readFileSync(join(templatesDir, d, "config", "settings_data.json"), "utf8")) as { current?: Record<string, unknown> }
  return [d, data.current?.scroll_animation, data.current?.hover_effect] as const
})
const badType = chosen.filter(([, t]) => t !== undefined && !types.includes(String(t)))
check("every template's reveal type is one the theme offers", badType.length === 0, badType)
const hovers = setting("hover_effect").options!.map((o) => o.value)
const badHover = chosen.filter(([, , h]) => h !== undefined && !hovers.includes(String(h)))
check("every template's hover effect is one the theme offers", badHover.length === 0, badHover)
for (const h of hovers.filter((x) => x !== "none")) check(`hover ${h} has its rule in theme.css`, themeCss.includes(`.${h} .hover-effect`))
const labels = [...setting("scroll_animation").options!, ...setting("hover_effect").options!].map((o) => o.label).concat(anim.map((s) => `${s.label ?? ""} ${s.info ?? ""}`))
check("no em dashes or banned words in the labels", labels.every((l) => !/—|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(l)), labels)

console.log("\nSCRIPTS")
let parses = true
try { new Function(js) } catch { parses = false }
check("animation.js parses", parses)
check("it replays only for the Animations settings", /REVEAL_SETTINGS = \['scroll_animation', 'animation_duration', 'animation_delay', 'reveal_stagger', 'zoom_image'\]/.test(js) && /addEventListener\('storelib:theme-change'/.test(js))
check("a done reveal takes off its parts, words and zoom marks", /function markDone[\s\S]{0,300}clearParts\(el\)/.test(js) && /unsplitWords\(part\)/.test(js) && /removeAttribute\('data-reveal-zoom'\)/.test(js))
check("the observer measures the frame's own screen inside a frame", /root: document, threshold: 0, rootMargin: margin/.test(js))
check("the safety net plays an armed reveal rather than snapping it", /window\.MateriaReveal\.play\(el\)/.test(readFileSync(join(BASE, "layout", "theme.liquid"), "utf8")))

console.log("\nCANVAS")
check("the guard runs first in the canvas head", CANVAS_HEAD.startsWith(CANVAS_DESIGN_GUARD))
check("the bridge says theme-changed to the theme as storelib:theme-change", /m\.type === "theme-changed"[\s\S]{0,400}new CustomEvent\("storelib:theme-change", \{ detail: \{ settings: changedSettings \} \}\)/.test(CANVAS_BRIDGE))

/* The guard run against a small stand-in for the page: a class list, MutationObserver and document listeners. */
function runGuard(serverClass: boolean) {
  const classes = new Set<string>(serverClass ? ["shopify-design-mode"] : [])
  const observers: (() => void)[] = []
  const listeners: Record<string, (() => void)[]> = {}
  const de = { classList: { contains: (c: string) => classes.has(c), remove: (c: string) => { classes.delete(c); observers.forEach((o) => queue.push(o)) }, add: (c: string) => { classes.add(c); observers.forEach((o) => queue.push(o)) } } }
  const queue: (() => void)[] = []
  const flush = () => { while (queue.length) queue.shift()!() }
  class MO { constructor(private cb: () => void) {} observe() { observers.push(this.cb) } }
  const document = { documentElement: de, addEventListener: (n: string, f: () => void) => { (listeners[n] ??= []).push(f) } }
  const script = /<script>([\s\S]*)<\/script>/.exec(CANVAS_DESIGN_GUARD)![1]
  new Function("document", "MutationObserver", script)(document, MO)
  return { de, flush, fire: (n: string) => (listeners[n] ?? []).forEach((f) => f()), has: () => classes.has("shopify-design-mode") }
}
{
  const g = runGuard(false)
  g.de.classList.add("shopify-design-mode"); g.flush()
  check("a class the theme puts on by itself at load is taken off", !g.has())
  g.fire("storelib:section-load")
  g.de.classList.add("shopify-design-mode"); g.flush()
  check("after an edit the theme's own class stays, as before", g.has())
}
{
  const g = runGuard(true)
  g.flush()
  check("a page the server drew in design mode keeps its class", g.has())
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
