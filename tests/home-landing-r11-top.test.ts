/**
 * ===========================================================================
 *  HOME, LANDING ROUND 11 (TOP): A SECOND SITE AND A SECOND ONEPAGE IN THE
 *  EDITORS, PRODUCT SHOTS FOR MONDO MANGO, A LITTLE DEPTH ON THE FRAME, AND
 *  A DIGITAL PRODUCT STORE IN THE STRIP
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx, showcase-mocks/builder-mocks.tsx
 * and everything-in-one-place.tsx.
 *
 * The owner, after round 10:
 *   1. Mondo Mango: "I don't like the physical product examples; make
 *      something more like the 2nd image as the products" (bold product shots
 *      of boxes, strong titles, sale badges), and "I also don't like the hero
 *      of Mondo Mango; add something else more realistic, smooth, clean";
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
import { BUILDER_CSS, CommunityMock, IdrisPage, LoudlibSite, MondoMangoSite, OnePageEditorMock, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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

console.log("\n── 1. Mondo Mango: product shots of boxes, a clean studio hero ──")
const site = renderToStaticMarkup(createElement(MondoMangoSite))
const hero = site.slice(site.indexOf('class="mg-hero"'), site.indexOf('class="mg-shop"'))
check("the hero is one studio picture of the game, the words on it", /src="\/home\/showcase\/mm-studio\.webp"[^>]*width="1600" height="534"/.test(hero) && (hero.match(/<img /g) ?? []).length === 1 && /<b>Game night, but louder\.<\/b>/.test(hero))
check("no orange block, no sticker, no wall photograph left", !/mg-sticker|mg-wall|mm-hero|Wear it loud/.test(site + BUILDER_CSS))
check("four products, each a shot of its box", ["mm-game", "mm-after-dark", "mm-family", "mm-crate"].every((n) => site.includes(`/home/showcase/${n}.webp`) && webp(`home/showcase/${n}.webp`, 60)))
check("the old garment photos are gone", !/mm-(crew|cap|tee|tote)/.test(site + read(F.builders)) && !existsSync(join(root, "public/home/showcase/mm-crew.webp")))
check("two are on sale, the old price struck through", (site.match(/class="mg-sale">On sale</g) ?? []).length === 2 && /<s>€35<\/s>€29/.test(site))
check("the studio picture is small", webp("home/showcase/mm-studio.webp", 120))

console.log("\n── 2. The website builder moves on to loudlib ──")
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
const ll = renderToStaticMarkup(createElement(LoudlibSite))
check("both sites stand in the one canvas, the second hidden at first", /class="smk-frame wx-site bm-s1"/.test(wb) && /class="smk-frame wx-site bm-s2"/.test(wb) && /\.bm-s2\{opacity:0\}/.test(BUILDER_CSS))
check("the bar's name and the published address change with it", /<span class="bm-s1">Mondo Mango<\/span><span class="bm-s2">loudlib<\/span>/.test(wb) && /<span class="bm-s1">mondomango\.shop<\/span><span class="bm-s2">loudlib\.net<\/span>/.test(wb))
check("loudlib: the purple sale bar, the dark header, the bundle and Bestselling", /class="ll-bar">Sale 60% off all products/.test(ll) && /class="ll-discover">Discover/.test(ll) && /Tech House Master Bundle 2025/.test(ll) && /class="ll-h">Bestselling/.test(ll))
check("its packs are rendered boxes, three on sale", ["ll-serum", "ll-tech-house", "ll-drums", "ll-midi", "ll-hero"].every((n) => webp(`home/showcase/${n}.webp`, 120)) && (ll.match(/class="ll-sale">On sale</g) ?? []).length === 3)
check("the builder rings the Hero and the products on loudlib too", (wb.match(/<em>Selected<\/em>/g) ?? []).length === 4)
check("the change is a cross fade, opacity only", /\.bm-s1,\.bm-s2\{transition:opacity \.7s cubic-bezier\(\.4,0,\.2,1\)\}/.test(BUILDER_CSS) && /\[data-scene="1"\] \.bm-s1\{opacity:0\}/.test(BUILDER_CSS) && /\[data-scene="1"\] \.bm-s2\{opacity:1\}/.test(BUILDER_CSS))
check("with reduced motion it simply changes", /@media\(prefers-reduced-motion:reduce\)\{\.bm-s1,\.bm-s2\{transition:none\}\}/.test(BUILDER_CSS))

console.log("\n── The autoplay plays each scene, then the next tab ──")
const src = code(read(F.ideas))
check("the website builder and the OnePage editor have two scenes, the community one", Ideas.IDEAS_TABS.map((t) => t.scenes).join() === "2,2,1")
check("the clock restarts for each scene", /key=\{`\$\{t\.index\}-\$\{scene\}`\}/.test(src) && /onAnimationEnd=\{onClockEnd\}/.test(src))
check("a scene that is not the last moves the scene on, the last moves the tab on", /if \(scene \+ 1 < IDEAS_TABS\[t\.index\]\.scenes\) setShown\(\{ index: t\.index, scene: scene \+ 1 \}\)\s*else t\.advance\(\)/.test(src))
check("the leaving panel keeps its scene while it fades, and goes back to the first at rest", /data-scene=\{i === shown\.index \? shown\.scene : 0\}/.test(src) && /const fading = \[\.\.\.t\.states\.values\(\)\]\.includes\("leaving"\)\s*if \(shown\.index !== t\.index && !fading\) setShown\(\{ index: t\.index, scene: 0 \}\)/.test(src) && !/setTimeout|setInterval/.test(src))
const ideas = renderToStaticMarkup(createElement(Ideas.IdeasComeToLife))
check("the first panel starts on its first scene", /id="ideas-panel-website"[^>]*data-scene="0"/.test(ideas))

console.log("\n── 3. Idris Kane in the OnePage editor ──")
const ope = renderToStaticMarkup(createElement(OnePageEditorMock))
const ik = renderToStaticMarkup(createElement(IdrisPage))
check("two Links columns and two pages, Desmond's first", /class="ope-panel bm-s1"/.test(ope) && /class="ope-panel bm-s2"/.test(ope) && ope.indexOf("Desmond Ayo") < ope.indexOf("Idris Kane") && /class="ope-page bm-s2"><div class="dp ik">/.test(ope))
check("his page is Storelib's Hero header: the photo melting into the page, the name with the badge over it", /class="ik-hero"><img[^>]*src="\/home\/showcase\/ik-portrait\.webp"/.test(ik) && /class="ik-tick"/.test(ik) && /mask-image:linear-gradient\(#000 0%,#000 46%/.test(rule(BUILDER_CSS, ".ik-hero")) && /margin-top:-74u|margin-top:calc\(-74\*var\(--u\)\)/.test(rule(BUILDER_CSS, ".ik-head")))
check("his blocks: link buttons, prints, the signup the editor turns on, the showreel", /<b>Portfolio<\/b>/.test(ik) && /<b>Book a shoot<\/b>/.test(ik) && /Prints and photo books/.test(ik) && /class="dp-btn dp-new"/.test(ik) && /class="dp-video dp-after"/.test(ik))
check("the same script runs on his page (switch on, signup in, scroll)", /\.ope-off \.ope-sw-on,\[data-mock-live\] \.ope-phone \.dp-new/.test(BUILDER_CSS) && (ope.match(/class="ope-card ope-off"/g) ?? []).length === 2)
check("his pictures exist and are small", webp("home/showcase/ik-portrait.webp", 60) && webp("home/showcase/ik-av.webp", 30))

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
const noor = EVERYTHING_STORES.find((s) => s.key === "noor")
check("Soft Ground and Kiln Goods are gone", !/Kiln Goods|Soft Ground|soft-ground|kiln-/.test(JSON.stringify(EVERYTHING_STORES) + html + code(read(F.ev))))
check("Noor Haddad's store sells digital products", noor?.kind === "merch" && !!noor.digital && noor.products.map((p) => p.name).join() === "Saltwater Presets,Shoot to Invoice,Client Shoot Planner,Night Drive LUTs")
check("its covers are real webps, with the small copies", !!noor && noor.kind === "merch" && noor.products.every((p) => webp(p.src.replace(/^\//, ""), 60) && webp(p.src.replace(/^\//, "").replace(/\.webp$/, "-240.webp"), 40)))
const dg = html.slice(html.indexOf('data-digital=""'), html.indexOf('data-digital=""') + 3000)
check("a different heading: a dark band with her name, what she sells and Instant download", /<span class="ev-dg-band"><span class="ev-dg-top"><span class="ev-dg-mark">Noor Haddad<\/span><span>Cart \(0\)<\/span><\/span><span class="ev-dg-head"><b>Presets and guides<\/b>/.test(dg) && /<i>Instant download<\/i>/.test(dg))
check("the band is as tall as the other stores' header, the covers in the same grid", /\.ev-dg-band\{[^}]*height:calc\(214 \* var\(--r\)\)/.test(evCss) && /\.ev-dg-band \+ \.ev-mc-grid\{margin-top:calc\(24 \* var\(--r\)\)\}/.test(evCss))
check("one is reduced, its old price struck through", /<span class="ev-mc-price"><s>\$39<\/s>\$29<\/span>/.test(dg))
check("still three stores, never two side by side", EVERYTHING_STORES.length === 7 && EVERYTHING_STORES.filter((s) => s.kind === "merch").length === 3 && EVERYTHING_STORES.every((s, i) => s.kind !== "merch" || EVERYTHING_STORES[(i + 1) % 7].kind !== "merch"))

console.log("\n── Copy ──")
const all = code(read(F.ev)) + code(read(F.ideas)) + code(read(F.builders))
check("no em dashes, no banned words", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Studio Marlow|Kai Moreno|ceramics|Weeknight Pasta|sourdough|Golden Hour|Elena Ruiz/i.test(all))
check("this suite runs with the push tests, after round 10's", /"tests\/home-landing-r10-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r11-top\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
