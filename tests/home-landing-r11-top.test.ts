/**
 * ===========================================================================
 *  HOME, LANDING ROUND 11 (TOP): A SECOND SITE AND A SECOND ONEPAGE IN THE
 *  EDITORS, PRODUCT SHOTS FOR THE FIRST SITE, A LITTLE DEPTH ON THE FRAME, AND
 *  A DIGITAL PRODUCT STORE IN THE STRIP
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx, showcase-mocks/builder-mocks.tsx
 * and everything-in-one-place.tsx.
 *
 * The owner, after round 10:
 *   1. the builder's first site: "I don't like the physical product examples; make
 *      something more like the 2nd image as the products" (bold product shots
 *      of boxes, strong titles, sale badges), and "I also don't like the hero
 *      of it; add something else more realistic, smooth, clean";
 *   2. "in the website builder, after some time another template should
 *      appear, e.g. the loudlib website", the switch "very smooth";
 *   3. "Add Idris Kane as another OnePage in the OnePage editor pill, but more
 *      realistic, adapted to how Storelib is";
 *   4. "add to the overall cards of the website builder, OnePage editor and
 *      community a little more depth, just a little";
 *   5. keep the Strength Room as is;
 *   6. Soft Ground (Kiln Goods): "make it a digital product store ... with a
 *      different heading/hero".
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import * as Ideas from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, CommunityMock, OnePageEditorMock, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const F = {
  ev: "components/marketing/home/everything-in-one-place.tsx",
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
}
const ideasCss = Ideas.IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const evCss = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
const webp = (p: string, kb: number) => {
  const f = join(root, "public", p)
  if (!existsSync(f)) return false
  const b = readFileSync(f)
  return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" && statSync(f).size < kb * 1024
}

console.log("\n── 1. The builder's first site ──")
// Changed on purpose (landing round 12): the owner dropped round 11's first site entirely (its box shots and studio hero are deleted); the first site is their own GodBless store, pinned in tests/home-landing-r12-top.test.ts.
check("the earlier site's pictures are gone", ["mm-studio", "mm-game", "mm-late-round", "mm-family", "mm-crate"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))))

console.log("\n── 2. The website builder: Steez alone ──")
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez. loudlib, its second
// scene, its cross fade and its box pictures are gone, and so are the tabs' scenes (tests/home-landing-r15-stats.test.ts).
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
check("one site in the canvas, no second hidden behind it", (wb.match(/class="smk-frame wx-site"/g) ?? []).length === 1 && !/bm-s[12]/.test(wb + BUILDER_CSS))
check("the bar's name and the published address are Steez's", /<b class="wx-name">Steez<\/b>/.test(wb) && /<b class="wx-pub-host">steez\.storelib\.com<\/b>/.test(wb) && !/loudlib/.test(wb))
check("loudlib's box pictures are deleted", ["ll-serum", "ll-tech-house", "ll-ambience", "ll-deep-house", "ll-unitech"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`)) && !existsSync(join(root, `public/marketing/loudlib/${n}.webp`))))
check("the builder rings the products", (wb.match(/<em>Selected<\/em>/g) ?? []).length === 1)

console.log("\n── The autoplay plays each tab's moment, then the next tab ──")
const src = code(read(F.ideas))
check("no tab has scenes", Ideas.IDEAS_TABS.every((t) => !("scenes" in t)))
check("the clock restarts for each tab and moves the tab on", /key=\{t\.index\}/.test(src) && /onAnimationEnd=\{t\.advance\}/.test(src) && !/setTimeout|setInterval/.test(src))
const ideas = renderToStaticMarkup(createElement(Ideas.IdeasComeToLife))
check("no panel carries a scene", !/data-scene/.test(ideas))

console.log("\n── 3. Idris Kane is gone (landing round 13) ──")
// Changed on purpose (landing round 13): the owner removed Idris Kane; the OnePage editor shows Desmond Ayo alone, one scene (tests/home-landing-r13-ideas.test.ts).
const ope = renderToStaticMarkup(createElement(OnePageEditorMock))
check("one Links column and one page, Desmond's", (ope.match(/class="ope-panel"/g) ?? []).length === 1 && !/Idris|ope-page|class="dp ik"/.test(ope) && !/\.ik[-{ ]/.test(BUILDER_CSS))
check("his pictures are deleted", ["ik-portrait", "ik-av", "ik-print", "ik-print-128"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))))

console.log("\n── 4. A little depth on the frame ──")
const frame = rule(ideasCss, ".ideas-frame")
check("one soft layered shadow, on the frame only", /box-shadow:0 1px 2px rgba\(16,24,40,\.04\),0 6px 16px -6px rgba\(16,24,40,\.08\),0 22px 44px -22px rgba\(16,24,40,\.16\)/.test(frame))
check("the frame never animates or changes", !/\.ideas-frame[^{]*\{[^}]*(animation|transition)/.test(ideasCss) && !/\.ideas-frame\[/.test(ideasCss))
check("no panel carries a shadow of its own", !/\.ideas-panel[^{]*\{[^}]*box-shadow/.test(ideasCss))

console.log("\n── 5. The Strength Room is as it was ──")
const cm = renderToStaticMarkup(createElement(CommunityMock))
check("its markup is round 8's, to the byte", createHash("sha256").update(cm).digest("hex") === "8774fce177ad3c3da91226068e54ba4916f973accb30e9089f39713e84f0cb8f")
check("its styles are round 8's", createHash("sha256").update(BUILDER_CSS.slice(BUILDER_CSS.indexOf(".cx{"))).digest("hex") === "f8aee363c14a9b53af8b57b1eb559827dab709087e343398b8b0f76e3aadd50c")

console.log("\n── 6. A digital product store in the strip ──")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
// Changed on purpose (landing round 12): the owner found round 11's digital store "really bad"; Jonah Wells, a guitar teacher laid out like Fieldwork with photographs of what he sells, takes its place (tests/home-landing-r12-top.test.ts).
check("Soft Ground and Kiln Goods are gone", !/Kiln Goods|Soft Ground|soft-ground|kiln-/.test(JSON.stringify(EVERYTHING_STORES) + html + code(read(F.ev))))
// Changed on purpose (landing round 14): the store of downloads (Jonah Wells) gave way to Liam Bailey's real product page, a download itself, at its live price (tests/home-landing-r14-everything.test.ts); two stores now.
check("a downloadable product is still in the strip", EVERYTHING_STORES.some((s) => s.kind === "product"))
check("its price as the live page shows it", /<span class="ev-pp-price">\$11\.87<\/span>/.test(html))
/* Changed on purpose (landing round 15): nine pages; the stores are Slow Form and the owners' three screenshots (Loudlib, Sora, GodBless), still never two side by side. */
const isStore = (s: (typeof EVERYTHING_STORES)[number]) => s.kind === "merch" || (s.kind === "shot" && s.key !== "satori")
check("still never two stores side by side", EVERYTHING_STORES.length === 9 && EVERYTHING_STORES.filter(isStore).length === 4 && EVERYTHING_STORES.every((s, i) => !isStore(s) || !isStore(EVERYTHING_STORES[(i + 1) % EVERYTHING_STORES.length])))

console.log("\n── Copy ──")
const all = code(read(F.ev)) + code(read(F.ideas)) + code(read(F.builders))
check("no em dashes, no banned words", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Studio Marlow|Kai Moreno|ceramics|Weeknight Pasta|sourdough|Golden Hour|Elena Ruiz/i.test(all))
check("this suite runs with the push tests, after round 10's", /"tests\/home-landing-r10-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r11-top\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
