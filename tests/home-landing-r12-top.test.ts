/**
 * ===========================================================================
 *  HOME, LANDING ROUND 12 (TOP): GODBLESS IN THE WEBSITE BUILDER, AND A
 *  GUITAR TEACHER'S DIGITAL STORE IN THE STRIP
 * ===========================================================================
 * components/marketing/home/showcase-mocks/builder-mocks.tsx,
 * ideas-come-to-life.tsx and everything-in-one-place.tsx.
 *
 * The owner, after round 11:
 *   1. the website builder's first example goes "entirely"; in its place
 *      something "more realistic, cool and clean": their own GodBless store
 *      (the summer offer bar, HOME / SHOP ALL / ABOUT US, the red GODBless
 *      wordmark, a photo hero "GodBless Summer Club" with "Trusted by 1,250+"
 *      and EXPLORE, then New Collection with the jacket, two tees and the
 *      hoodie on light grey). The builder still moves on to loudlib.
 *   2. the strip's digital product store is "really bad": a store that looks
 *      shipped, with real product photographs, a new creator.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import * as Ideas from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, GodBlessSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const evCss = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
/** A real webp under `kb`, and its pixel size from the VP8/VP8L/VP8X header. */
const webp = (p: string, kb: number) => {
  const f = join(root, "public", p)
  if (!existsSync(f)) return null
  const b = readFileSync(f)
  if (b.subarray(0, 4).toString() !== "RIFF" || b.subarray(8, 12).toString() !== "WEBP" || statSync(f).size >= kb * 1024) return null
  const kind = b.subarray(12, 16).toString()
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
}

console.log("\n── 1. The earlier example is gone, everywhere ──")
const everything = code(read(F.builders)) + code(read(F.ideas)) + read(F.builders) + read(F.ideas)
check("no Mondo Mango in the code, the comments or the alt text", !/mondo|mango/i.test(everything))
check("its pictures are deleted", ["mm-studio", "mm-logo", "mm-game", "mm-late-round", "mm-family", "mm-crate"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))))
check("none of its styles are left", !/\.mg[-{]|mg-ring/.test(BUILDER_CSS))

console.log("\n── 2. GodBless, drawn after the owner's live store ──")
const site = renderToStaticMarkup(createElement(GodBlessSite))
const hero = site.slice(site.indexOf('class="gb-hero"'), site.indexOf('class="gb-shop"'))
check("the black bar with the summer offer", /<p class="gb-bar">40% OFF \+ FREE SHIPPING THIS SUMMER<\/p>/.test(site) && /\.gb-bar\{[^}]*background:#111;color:#fff/.test(BUILDER_CSS))
check("Home, Shop all, About us on the left, Home underlined", /<span class="gb-links"><b>Home<\/b><span>Shop all<\/span><span>About us<\/span><\/span>/.test(site) && /text-transform:uppercase/.test(rule(BUILDER_CSS, ".gb-links")) && /box-shadow:inset 0 -1u 0 #111|box-shadow:inset 0 calc\(-1\*var\(--u\)\) 0 #111/.test(rule(BUILDER_CSS, ".gb-links b")))
check("the red wordmark in the middle, as a picture", /class="smk-pic gb-logo"/.test(site) && site.includes("/home/showcase/gb-logo.webp") && /left:50%;top:50%/.test(rule(BUILDER_CSS, ".gb-logo")))
check("Search, Account and Cart (0) on the right", /<span class="gb-links gb-right"><span>Search<\/span><span>Account<\/span><span>Cart \(0\)<\/span><\/span>/.test(site))
check("the hero is one photograph with the stars, the name, the line and Explore", (hero.match(/<img /g) ?? []).length === 1 && hero.includes("/home/showcase/gb-hero.webp") && /Trusted by 1,250\+/.test(hero) && /<b>GodBless Summer Club<\/b>/.test(hero) && /Discover our featured brand highlight and exclusive drops\./.test(hero) && /<em>Explore<\/em>/.test(hero))
check("four and a half stars", (hero.match(/<svg /g) ?? []).length === 5 && (hero.match(/class="gb-half"/g) ?? []).length === 1 && /clip-path:inset\(0 50% 0 0\)/.test(rule(BUILDER_CSS, ".gb .gb-stars .gb-half")))
check("Explore is a square white key", /background:#fff;color:#111/.test(rule(BUILDER_CSS, ".gb-pitch em")) && !/border-radius/.test(rule(BUILDER_CSS, ".gb-pitch em")))
check("New Collection with a square black View all", /<p class="gb-h"><b>New Collection<\/b><span>View all<\/span><\/p>/.test(site) && /background:#111;color:#fff/.test(rule(BUILDER_CSS, ".gb-h span")) && !/border-radius/.test(rule(BUILDER_CSS, ".gb-h span")))
const names = [...site.matchAll(/<span class="gb-card">[\s\S]*?<b>([^<]+)<\/b><span class="gb-price">([^<]+)<\/span>/g)].map((m) => `${m[1]} ${m[2]}`)
check("the owner's four pieces at their prices", names.join() === "Camo X Boxy Jacket $99.00,Green Basic Tshirt $59.00,Charcoal Classic Hoodie $89.00,Brown Tshirt Basic $29.00", names)
check("on light grey, square, the name and price centred", /background:#f0f0f0/.test(rule(BUILDER_CSS, ".gb-img")) && !/border-radius/.test(rule(BUILDER_CSS, ".gb-img")) && /text-align:center/.test(rule(BUILDER_CSS, ".gb-card")))
check("headings in the store's condensed face, a small subset that ships with the page", /@font-face\{font-family:"GB Oswald";src:url\(\/home\/fonts\/gb-oswald\.woff2\) format\("woff2"\)/.test(BUILDER_CSS) && /var\(--gb-head\)/.test(rule(BUILDER_CSS, ".gb-pitch b")) && readFileSync(join(root, "public/home/fonts/gb-oswald.woff2")).subarray(0, 4).toString() === "wOF2" && statSync(join(root, "public/home/fonts/gb-oswald.woff2")).size < 16 * 1024)

console.log("\n── Crisp at 2x, and small ──")
/* The site is drawn 1024u wide in a canvas 986 of the frame's 1280; the frame is at most about 1370px wide (1920 screen). So 1u is at most about 1.03 CSS px, and 2x needs about 2.06 image px per u. */
const hero2x = webp("home/showcase/gb-hero.webp", 120)
check("the hero photo is 2x for 1024u (at least 2100px wide) and small", !!hero2x && hero2x.w >= 2100 && Math.abs(hero2x.w / hero2x.h - 1024 / 290) < 0.05, hero2x)
check("each piece is 2x for its 231u by 236u box", ["gb-camo", "gb-green", "gb-hoodie", "gb-brown"].every((n) => { const s = webp(`home/showcase/${n}.webp`, 40); return !!s && s.w >= 470 && s.h >= 480 }))
const logo = webp("home/showcase/gb-logo.webp", 30)
check("the wordmark has at least 3 pixels for every u of its 26u height", !!logo && logo.h >= 78, logo)
check("height and the box: 1024u wide in the frame, as before", /\.wx-site>\.smk\{--w:1024\}/.test(BUILDER_CSS) && /height:calc\(290\*var\(--u\)\)/.test(rule(BUILDER_CSS, ".gb-hero")) && /height:calc\(236\*var\(--u\)\)/.test(rule(BUILDER_CSS, ".gb-img")))

console.log("\n── 3. Still moves on to loudlib, on the clock ──")
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
check("GodBless first, loudlib second, in the one canvas", /class="smk-frame wx-site bm-s1"[^>]*><div class="smk"[^>]*><div class="gb">/.test(wb) && /class="smk-frame wx-site bm-s2"[^>]*><div class="smk"[^>]*><div class="ll">/.test(wb))
check("the bar's name and the published address change with it", /<span class="bm-s1">GodBless<\/span><span class="bm-s2">loudlib<\/span>/.test(wb) && /<span class="bm-s1">godbless\.storelib\.com<\/span><span class="bm-s2">loudlib\.net<\/span>/.test(wb))
check("the builder rings the Hero and the products on both", (wb.match(/class="wx-sel wx-ring-a"/g) ?? []).length === 2 && (wb.match(/class="wx-sel wx-ring-b"/g) ?? []).length === 2 && /\.wx-sel\{position:absolute;inset:0;box-shadow:inset 0 0 0 calc\(2\*var\(--u\)\) #3b82f6/.test(BUILDER_CSS))
check("the cross fade is opacity only, with two scenes on the tab", /\[data-scene="1"\] \.bm-s1\{opacity:0\}/.test(BUILDER_CSS) && Ideas.IDEAS_TABS[0].scenes === 2)
check("the alt text tells it", /First GodBless, a streetwear store/.test(Ideas.IDEAS_TABS[0].alt) && /Then loudlib/.test(Ideas.IDEAS_TABS[0].alt))
check("motion in the new site: none of its own (the rings and cursor are the builder's)", !/@keyframes gb|\.gb[^{]*\{[^}]*(animation|transition)/.test(BUILDER_CSS))

console.log("\n── 4. Jonah Wells, a guitar teacher's digital store ──")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const jonah = EVERYTHING_STORES.find((s) => s.key === "jonah")
check("round 11's store is gone, with its pictures and its dark band", !/Noor Haddad|Saltwater|Shoot to Invoice|ev-dg-|data-digital/.test(JSON.stringify(EVERYTHING_STORES) + html + evCss + code(read(F.ev))) && !existsSync(join(root, "public/home/everything/stores/dg-saltwater.webp")))
check("a store laid out like Fieldwork: the cover photo, the menu, his name and the cart", jonah?.kind === "merch" && jonah.hero === "/home/everything/stores/jonah-cover.webp" && /data-ink="light"><span class="ev-ms-cover"><img class="ev-ms-hero"[^>]*src="\/home\/everything\/stores\/jonah-cover\.webp"[^>]*><span class="ev-ms-top"><span class="ev-ms-nav">Shop all<\/span><span class="ev-ms-mark">Jonah Wells<\/span><span class="ev-ms-nav">Cart \(0\)<\/span>/.test(html))
check("the drop's name and Instant download in white over a darker foot", /<b>Guitar lessons<\/b><b>and tabs<\/b><i>Instant download<\/i>/.test(html) && /\.ev-mc\[data-ink="light"\] \.ev-ms-drop\{z-index:1;color:#fff\}/.test(evCss) && /\.ev-mc\[data-ink="light"\] \.ev-ms-cover::after\{[^}]*linear-gradient/.test(evCss))
check("what he sells, each saying what it is", !!jonah && jonah.kind === "merch" && jonah.products.map((p) => `${p.name}|${p.format}`).join() === "Fingerstyle Basics|Video course,Blues Licks Tab Book|PDF,Amp Tones Vol 2|Presets,Backing Tracks|24 tracks")
check("one reduced, the old price struck through, the format after", /<span class="ev-mc-price"><s>\$19<\/s>\$14<i>PDF<\/i><\/span>/.test(html) && /\.ev-mc-price i::before\{content:"\\00b7"/.test(evCss))
check("product photographs, webp, with the small copies, crisp at 2x", !!jonah && jonah.kind === "merch" && jonah.products.every((p) => { const a = webp(p.src.replace(/^\//, ""), 60); const b = webp(p.src.replace(/^\//, "").replace(/\.webp$/, "-240.webp"), 30); return !!a && a.w === 360 && a.h === 450 && !!b && b.w === 240 }) && (webp("home/everything/stores/jonah-cover.webp", 80)?.w ?? 0) >= 780)
check("still three stores, never two side by side", EVERYTHING_STORES.length === 7 && EVERYTHING_STORES.filter((s) => s.kind === "merch").length === 3 && EVERYTHING_STORES.every((s, i) => s.kind !== "merch" || EVERYTHING_STORES[(i + 1) % 7].kind !== "merch"))
check("the other stores still say how many pieces they have", /<i>4 pieces<\/i>/.test(html))

console.log("\n── Copy ──")
const all = code(read(F.ev)) + code(read(F.ideas)) + code(read(F.builders))
check("no em dashes, no banned words", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the never on the page samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind\b/i.test(all))
check("no Shopify or Liquid in what is drawn", !/shopify|liquid/i.test(renderToStaticMarkup(createElement(WebsiteBuilderMock)) + html))
check("this suite runs with the push tests, after round 11's", /"tests\/home-landing-r11-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r12-top\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
