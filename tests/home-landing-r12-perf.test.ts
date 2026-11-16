/**
 * LANDING ROUND 12, PERF: the same page, cheaper.
 *
 * The owner wants storelib.com's home page smooth on every phone, with no
 * stutter. A page wide audit (a phone at 390x844, the CPU slowed four times,
 * the whole page flicked through) named these, and each is fixed without
 * changing what is seen:
 *
 *   analytics   the globe read scrollY inside its scroll event (a layout
 *               before the frame's own): read after the frame now. Each card
 *               pauses its lights and dots on its own more than a screen
 *               away. No permanent will-change on the orbs or the engines
 *               strip (the strip only while the section is live). The dot
 *               grid drifts under a still fade instead of carrying a mask.
 *               The engines' turning light on a 154% square (was 180%), the
 *               same tints in the new square's terms.
 *   creators    the rail is no layer for good: a flat translate, and
 *               will-change only while it is live. Photos decoded while the
 *               rail is off screen are simply there (no fade nobody sees).
 *   ai tools    the two turning squares are as wide as their rim's diagonal
 *               (hypot through container units), not twice its width; no
 *               will-change; the turn exists only while live; the terminal
 *               and the light run only while all of the terminal is within a
 *               screen.
 *   everything  no will-change on the four grounds; each card pauses its
 *               loops on its own more than a screen away.
 *   ideas       the block tiles and the product packs draw small copies of
 *               their photos, about twice their largest drawn size.
 *   sheets      a kept sheet's scrim holds no layer while it rests.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AI_TOOLS_STYLES } from "@/components/marketing/home/ai-tools-section"
import { DesmondPage, IdrisPage, OnePageEditorMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const DIR = "components/marketing/home"
/** A CSS module rule's body, by its exact selector. */
const block = (css: string, sel: string) => ((css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]=()*+?^$|\\/"]/g, "\\$&")} \\{([^}]*)\\}`)) ?? [])[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "")

console.log("\n── the shared part observer ──")
{
  const motion = read(`${DIR}/platform-motion.tsx`)
  const css = read(`${DIR}/platform.module.css`)
  check("one IntersectionObserver for every part, a screen ahead, at 0 and whole", /export function usePartsLive\(/.test(motion) && /\{ rootMargin: LIVE_AHEAD, threshold: \[0, 0\.995\] \}/.test(motion))
  check("live only while ALL of a part is within a screen", /export const wholeInside = \(e: IntersectionObserverEntry\) =>\s*e\.isIntersecting && \(e\.intersectionRatio > 0\.99/.test(motion))
  check("the attribute is written only when it changes", /if \(el\.getAttribute\(PART_LIVE_ATTR\) !== value\) el\.setAttribute\(PART_LIVE_ATTR, value\)/.test(motion))
  check("a part reported away pauses its loops", /\.root \[data-part-live="false"\] \.loop,\s*\.root \[data-part-live="false"\] \.loop::before,\s*\.root \[data-part-live="false"\] \.loop::after \{\s*animation-play-state: paused !important;/.test(css))
  check("no scroll listener in it", !/addEventListener\("scroll"/.test(motion))
}

console.log("\n── analytics ──")
{
  const globe = read(`${DIR}/analytics-globe.tsx`)
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const onScroll = (globe.match(/const onScroll = \(\) => \{([\s\S]*?)\n    \}/) ?? [])[1] ?? ""
  check("the globe's scroll event only asks; scrollY is read after the next frame", /if \(asked\) return/.test(onScroll) && /requestAnimationFrame\(\(\) => window\.setTimeout\(measure, 0\)\)/.test(onScroll) && !/scrollY/.test(onScroll))
  check("the read is in measure, and stops once the listener is gone", /const measure = \(\) => \{\s*asked = false\s*if \(!listening\) return\s*const t = performance\.now\(\)\s*const y = window\.scrollY/.test(globe))
  check("each dark card pauses on its own", /usePartsLive\(ref, `\.\$\{s\.dark\}`\)/.test(src))
  check("no permanent will-change on the orbs", !/will-change/.test(block(css, ".orb")) && /animation: orbDrift 22s ease-in-out infinite alternate;/.test(block(css, ".orb")))
  check("the engines strip is a layer only while the section is live", !/will-change/.test(block(css, ".strip")) && /\[data-platform-live="true"\] \.strip \{\s*will-change: transform;\s*\}/.test(css))
  check("the dot grid drifts under a still fade: the mask on the field, none on the moving grid", /mask-image: radial-gradient\(90% 70% at 100% 0%/.test(block(css, ".dotsField")) && /inset: -22px;/.test(block(css, ".dotsField")) && !/mask/.test(block(css, ".dots")) && /animation: dotsDrift 16s linear infinite;/.test(block(css, ".dots")))
  check("the field wraps the grid in the markup", /<span className=\{s\.dotsField\} aria-hidden="true">\s*<span className=\{`\$\{s\.dots\} \$\{m\.loop\}`\} \/>\s*<\/span>/.test(src))
  /* The orbit's tints in absolute terms (card widths): the same place and size as round 7's 180% square. */
  const orbit = block(css, ".orbit")
  const side = Number(/width: ([\d.]+)%;/.exec(orbit)?.[1]) / 100
  const tints = [...orbit.matchAll(/radial-gradient\(([\d.]+)% [\d.]+% at ([\d.]+)% ([\d.]+)%/g)].map((m) => m.slice(1).map(Number))
  const abs = (s: number, [r, x, y]: number[]) => [(r / 100) * s, (x / 100 - 0.5) * s, (y / 100 - 0.5) * s]
  const old = [abs(1.8, [22, 30, 34]), abs(1.8, [24, 70, 66])]
  const now = tints.map((t) => abs(side, t))
  const same = now.length === 2 && now.every((v, i) => v.every((n, j) => Math.abs(n - old[i][j]) < 0.002))
  check("the orbit square is 154% of the card (was 180%), its tints where and as big as they were", side === 1.54 && same && /margin: -77% 0 0 -77%;/.test(orbit), { side, now, old })
  const reach = Math.max(...now.map(([r, x, y]) => Math.hypot(x, y) + 0.7 * r))
  check("every tint ends inside the square's inner circle, so no angle cuts one off", reach <= side / 2, { reach, half: side / 2 })
}

console.log("\n── creators ──")
{
  const src = read(`${DIR}/creators-carousel.tsx`)
  const track = (src.match(/\n\.cc-track\{([^}]*)\}/) ?? [])[1] ?? ""
  check("the rail holds no layer by its stylesheet", !/will-change/.test(track), track)
  check("its place is a flat translate (a 3D one is a layer by itself)", /const tf = \(v: number\) => `translate\(\$\{\(-v\)\.toFixed\(2\)\}px\)`/.test(src) && !/translate3d\(\$\{\(-v\)/.test(src))
  check("will-change only while the rail is live, set on show, hide and a resize", /const promote = \(\) => \{\s*const want = live\(\) \? "transform" : ""/.test(src) && /const resume = \(\) => \{\s*promote\(\)/.test(src) && /const sync = \(\) => \{\s*promote\(\)/.test(src))
  check("a photo decoded off screen is shown at once, one in sight eases in", /show\(img, !visible\)/.test(src))
  check("touch still runs on the page's own frames (round 12 rails)", /anim = frameLeg\(from, by, ms/.test(src))
}

console.log("\n── AI tools ──")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("")
  const src = read(`${DIR}/ai-tools-section.tsx`)
  const spin = (css.match(/\n\.ait-spin\{([^}]*)\}/) ?? [])[1] ?? ""
  check("no will-change and no paused turn on the squares", !/will-change/.test(spin) && !/animation/.test(spin), spin)
  check("the turn exists only while live, 26s a lap as round 12's close set it", /\.ait-tw\[data-live\] \.ait-spin\{animation:ait-spin 26s linear infinite\}/.test(css))
  check("each rim is a size container", /\.ait-beam,\.ait-glow\{[^}]*contain:strict;container-type:size\}/.test(css))
  check("each square is as wide as its rim's diagonal (hypot), centred", /@supports \(width:hypot\(100cqw,100cqh\)\)\{\.ait-spin\{--d:calc\(hypot\(100cqw,100cqh\) \+ 2px\);width:var\(--d\);height:var\(--d\);margin:calc\(var\(--d\) \/ -2\) 0 0 calc\(var\(--d\) \/ -2\)\}\}/.test(css))
  check("without hypot it is the old 200% square", /width:200%;aspect-ratio:1;margin:-100% 0 0 -100%/.test(spin))
  check("the light keeps round 12's soft lilac head at .42", /rgba\(220,210,255,\.42\) 170deg/.test(spin))
  check("the terminal runs while all of it is within a screen", /seen = wholeInside\(entry\)/.test(src) && /\{ rootMargin: LIVE_AHEAD, threshold: \[0, 0\.995\] \}/.test(src))
  check("reduced motion: still, at an angle", /\.ait-spin\{animation:none!important;transform:rotate\(38deg\)\}/.test(css))
  /* The diagonal covers the rim at every angle: a square of side d centred on a w x h box covers it turned any way when d/2 >= hypot(w, h)/2. */
  for (const [w, h] of [[300, 360], [640, 520], [900, 600]]) {
    const d = Math.hypot(w, h) + 2
    check(`a ${w}x${h} rim is covered at every angle, ${((d * d) / (2 * w) ** 2).toFixed(2)} of the old square's area`, d / 2 >= Math.hypot(w / 2, h / 2) && d * d < (2 * w) ** 2)
  }
}

console.log("\n── Everything ──")
{
  const src = read(`${DIR}/everything-in-one-place.tsx`)
  const bg = (src.match(/\n\.ev-p-bg\{([^}]*)\}/) ?? [])[1] ?? ""
  check("the four grounds hold no layer for good", !/will-change/.test(bg) && /animation:ev-bg-drift 22s ease-in-out infinite alternate/.test(bg), bg)
  check("each card pauses on its own", /usePartsLive\(ref, "\.ev-card"\)/.test(src))
  check("the storefront strip drifts only while all of it is within a screen", /const shown = \(\) => liveRef\.current && near && !document\.hidden/.test(src) && /near = wholeInside\(e\)/.test(src) && /if \(on && near && !document\.hidden\) startDrift\(\)/.test(src))
  check("its loops and its tab fill pause there", /\.ev-card\[data-part-live="false"\] \.ev-loop,\.ev-card\[data-part-live="false"\] \.ev-tab\[data-on\] \.ev-tab-fill\{animation-play-state:paused\}/.test(src))
  const pause = src.indexOf('.ev-card[data-part-live="false"] .ev-p-bg[data-on]{animation-play-state:paused}')
  const run = src.indexOf('.ev[data-platform-live="true"] .ev-p-bg[data-on]{animation-play-state:running}')
  check("the pause comes after the rule that runs the shown ground (same weight, so the later one wins)", run > 0 && pause > run, { run, pause })
}

console.log("\n── Ideas: small thumbnails ──")
{
  const html = renderToStaticMarkup(createElement("div", null, createElement(OnePageEditorMock), createElement(DesmondPage), createElement(IdrisPage)))
  const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
  const tiles = [...html.matchAll(/<span class="ope-tile"><img[^>]*src="([^"]+)"/g)].map((m) => m[1])
  const packs = [...html.matchAll(/<span class="dp-pack"><img[^>]*src="([^"]+)"/g)].map((m) => m[1])
  check("every block tile draws a small copy", tiles.length >= 4 && tiles.every((s) => /-(128|208)\.webp$/.test(s)), tiles)
  check("every product pack draws a small copy", packs.length >= 2 && packs.every((s) => /-128\.webp$/.test(s)), packs)
  check("the full size photos are gone from the tiles and packs", !srcs.some((s) => /\/(dr-neon|ik-print|lt-street)\.webp$/.test(s)), srcs.filter((s) => /dr-neon|ik-print|lt-street/.test(s)))
  check("the videos keep their photos", srcs.includes("/home/showcase/lp-f2.webp") && srcs.includes("/home/showcase/lt-field.webp"))
  for (const f of ["dr-neon-128", "ik-print-128", "lt-street-128", "lt-field-128", "lp-f2-208"]) {
    const size = statSync(join(root, `public/home/showcase/${f}.webp`)).size
    check(`${f}.webp is there and small (${size} bytes)`, size > 300 && size < 16000)
  }
}

console.log("\n── sheets ──")
{
  const sheet = read("components/ui/bottom-sheet.tsx")
  check("a resting kept sheet's scrim holds no layer; an open one does", /style=\{\{ opacity: 0, touchAction: "none", willChange: atRest \? undefined : "opacity", pointerEvents: isOpen \? "auto" : "none" \}\}/.test(sheet))
  check("the panel's own layer is unchanged", /willChange: keepMounted \|\| !atRest \? "transform" : undefined,/.test(sheet))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after round 12's other tracks", /"tests\/home-landing-r12-frame\.test\.ts",[\s\S]{0,2000}"tests\/home-landing-r12-perf\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
