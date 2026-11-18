/**
 * ===========================================================================
 *  HOME, LANDING ROUND 13 (IDEAS): THE OWNER'S STEEZ THEME IN THE WEBSITE
 *  BUILDER, DESMOND ALONE IN THE ONEPAGE EDITOR, A LARGER MARQUEE ON A PHONE
 * ===========================================================================
 * components/marketing/home/showcase-mocks/builder-mocks.tsx,
 * ideas-come-to-life.tsx and components/marketing/product-marquee.tsx.
 *
 * The owner, after round 12:
 *   1. the website builder example "needs to actually be accurate": their
 *      Materia Steez theme (1.2.0 export) in place of GodBless, without the
 *      Steez Club slideshow: the Summer Madness '26 slideshow, the products,
 *      then the next sections as the theme has them. GodBless's files go.
 *   2. the OnePage editor: Idris Kane goes entirely; Desmond Ayo alone, his
 *      page not cut off and his head sitting well.
 *   3. "Unlimited possibilities" is too small on a phone after wave 18: a bit
 *      larger, between wave 18 and the sizes before it.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Ideas from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, OnePageEditorMock, SteezSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
  marquee: "components/marketing/product-marquee.tsx",
}
/** One rule of a sheet, with the u units written out as the frame does (calc(N*var(--u))). */
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
const U = (n: number) => `calc(${n}*var(--u))`
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

console.log("\n── 1. Steez, drawn from the theme's export ──")
const site = renderToStaticMarkup(createElement(SteezSite, { rings: true }))
const at = (s: string) => site.indexOf(s)
check("the page in the template's order, without Steez Club: bar, Summer Madness '26, the products, Summer Collection", at('class="stz-bar"') < at("Summer Madness &#x27;26") && at("Summer Madness &#x27;26") < at('class="stz-shop"') && at('class="stz-shop"') < at("SUMMER COLLECTION") && !/STEEZ CLUB|Steez Club/i.test(site), site.slice(0, 200))
check("the announcement bar: #111, white, FREE SHIPPING THIS SUMMER, a close key", /<p class="stz-bar">FREE SHIPPING THIS SUMMER<svg[^>]*stz-x/.test(site) && /background:#111;color:#fff/.test(rule(BUILDER_CSS, ".stz-bar")) && rule(BUILDER_CSS, ".stz-bar").includes(`height:${U(24)}`))
check("the transparent header over the slide: the white wordmark in the middle, menu left, icons right", /class="stz-nav"><span class="stz-menu">[\s\S]*?<\/span><img[^>]*src="\/home\/showcase\/stz-logo\.webp"[^>]*class="smk-pic stz-logo"[^>]*><span class="stz-icons">/.test(site) && /grid-template-columns:1fr auto 1fr/.test(rule(BUILDER_CSS, ".stz-nav")) && /color:#fff/.test(rule(BUILDER_CSS, ".stz-nav")))
// (round 14: the heading is now the builder's editable heading, its old words first)
check("the slideshow: 640px of the theme (455u), the demo photo, a 29% overlay, the words at the bottom centre", rule(BUILDER_CSS, ".stz-hero").includes(`height:${U(455)}`) && /justify-content:flex-end;align-items:center/.test(rule(BUILDER_CSS, ".stz-hero")) && /background:rgba\(0,0,0,\.29\)/.test(rule(BUILDER_CSS, ".stz-hero::before")) && /<span class="stz-sub">NEW COLLECTION<\/span><b><span class="wx-edit"><i class="wx-hd"><\/i><span class="wx-was">Summer Madness &#x27;26<\/span>[\s\S]*?<\/b><em>EXPLORE<\/em>/.test(site)) /* Changed on purpose (landing round 15): the heading wears the editor's outline (wx-hd); its words are selected in the panel's field, not on the page. */
check("the heading in Instrument Sans 600 at -0.034em, the theme's heading settings", /font-family:var\(--stz-head\);[^}]*font-weight:600;[^}]*letter-spacing:-\.034em/.test(rule(BUILDER_CSS, ".stz-pitch b")) && /--stz-head:"STZ Instrument"/.test(BUILDER_CSS))
check("EXPLORE on the scheme's taupe key with its border", /border:calc\(1\*var\(--u\)\) solid #bab6b1;[^}]*background:#847265;color:#fff/.test(rule(BUILDER_CSS, ".stz-pitch em")))
check("the theme's fonts ship as small subsets from the site itself", ["stz-instrument-500", "stz-instrument-600", "stz-montserrat-400", "stz-montserrat-500"].every((n) => { const f = join(root, `public/home/fonts/${n}.woff2`); return existsSync(f) && statSync(f).size < 12_000 && BUILDER_CSS.includes(`/home/fonts/${n}.woff2`) }) && !/fonts\.googleapis|fonts\.gstatic/.test(BUILDER_CSS))
const names = [...site.matchAll(/<span class="stz-card">[\s\S]*?<b>([^<]+)<\/b><span class="stz-price">([^<]+)<\/span>/g)].map((m) => `${m[1]} ${m[2]}`)
// Changed on purpose (landing round 14): the owner's own four products (tests/home-landing-r14-ideas.test.ts).
check("the carousel: four tees with names and prices, no heading", names.join() === "Gradient Hoodie $100.00,Raw Tee $120.00,Grey Graphic T-shirt $80.00,Faith over fear Graphic T-shirt $120.00" && !/class="stz-h"/.test(site), names)
check("4 to a row, 5px apart, 3:4 shots with 4px corners, centred", /grid-template-columns:repeat\(4,1fr\);gap:calc\(3\.5\*var\(--u\)\)/.test(rule(BUILDER_CSS, ".stz-grid")) && /aspect-ratio:3\/4;border-radius:calc\(3\*var\(--u\)\)/.test(rule(BUILDER_CSS, ".stz-img")) && /text-align:center/.test(rule(BUILDER_CSS, ".stz-card")))
// Changed on purpose (landing round 14): the owner asked for the progress bar to go.
check("the progress bar and a square black View all", !/stz-progress/.test(site + BUILDER_CSS) && /<\/span><\/span><\/div><span class="stz-all">View all<\/span>/.test(site) && /background:#111;color:#fff/.test(rule(BUILDER_CSS, ".stz-all")) && !/border-radius/.test(rule(BUILDER_CSS, ".stz-all")))
check("Summer Collection: DISCOVER, SHOP MENS and SHOP WOMENS on light keys", /<span class="stz-sub">DISCOVER<\/span><b>SUMMER COLLECTION<\/b><span class="stz-keys"><em>SHOP MENS<\/em><em>SHOP WOMENS<\/em><\/span>/.test(site) && /background:#ebebeb;color:#000/.test(rule(BUILDER_CSS, ".stz-summer .stz-pitch em")))
// Changed on purpose (landing round 14): one ring, on the slideshow whose heading is edited.
/* Changed on purpose (landing round 15): the heading is outlined, not its slideshow ringed; the one ring is the products section's, which the builder picks to give more top padding. */
check("the rings: the heading outlined, the products section ringed", /class="stz-hero">[\s\S]*?wx-hd[\s\S]*?class="stz-shop">[\s\S]*?wx-ring/.test(site) && (site.match(/wx-ring/g) ?? []).length === 1)

console.log("\n── Pictures: the theme's own where it has them, 2x and small ──")
/* The site is 1024u in a canvas 986 of the frame's 1280, the frame at most about 1370px (1920 screen): 1u is at most about 1.03 CSS px. */
const hero = webp("home/showcase/stz-hero.webp", 120)
check("the Summer Madness photo (the theme's demo image) at least 1.75x for 1024u by 455u", !!hero && hero.w >= 1800 && Math.abs(hero.w / hero.h - 1024 / 455) < 0.01, hero)
const summer = webp("home/showcase/stz-summer.webp", 60)
check("the Summer Collection photo, only its top seen, small", !!summer && summer.w >= 1200 && Math.abs(summer.w / summer.h - 1024 / 455) < 0.01, summer)
// Changed on purpose (landing round 14): the owner's products, cut from his own store's picture.
check("each tee at 2x for its 248u by 331u box", ["stz-p-hoodie", "stz-p-raw", "stz-p-grey", "stz-p-faith"].every((n) => { const s = webp(`home/showcase/${n}.webp`, 40); return !!s && s.w >= 480 && s.h === (s.w * 4) / 3 }))
const logo = webp("home/showcase/stz-logo.webp", 10)
check("the wordmark at 3x for its 64u width", !!logo && logo.w >= 192, logo)

console.log("\n── The builder around it ──")
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
// Changed on purpose (landing round 15): the builder shows only Steez (the owner): its one tree, nothing cross faded.
check("one tree, Steez's", (wb.match(/class="wx-tree"/g) ?? []).length === 1 && !/wx-trees/.test(BUILDER_CSS))
const steezTree = wb.slice(wb.indexOf('class="wx-tree"'), wb.indexOf('class="wx-panels"'))
const rows = [...steezTree.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1])
check("Steez's rows are its sections' schema names, in the template's order, no Steez Club", rows.join() === "Announcement Bar Basic,Header,Slideshow,Products carousel,Slideshow,Products carousel,Collection List,Countdown Timer Flip,Category Banners,Footer", rows)
// Changed on purpose (landing round 14): one row lit, the slideshow whose heading is edited.
check("the first slideshow and the first products are the rows lit with the rings", /class="wx-row wx-hl">(?:(?!<\/b>)[\s\S])*<b>Slideshow<\/b>/.test(steezTree) && (steezTree.match(/wx-hl/g) ?? []).length === 1)
// Changed on purpose (landing round 14): the pointer now goes to each site's heading (its own path per site), pinned in tests/home-landing-r14-ideas.test.ts.
// Changed on purpose (landing round 15): Steez's tree alone: its two header rows and the footer.
check("the tree has two header rows, so the cursor lands on the products row (34u lower than round 12)", (wb.match(/class="wx-badge"/g) ?? []).length === 3)
// Changed on purpose (landing round 14): the canvas scrolls to the products after Publish, once, and stays.
check("the canvas scrolls the products into view when they are selected: a transform, live only, and still with reduced motion", /@media\(prefers-reduced-motion:no-preference\)\{\[data-mock-live\] \.stz \.stz-page\{animation:sxk-stz-scroll/.test(BUILDER_CSS) && /@keyframes sxk-stz-scroll\{0%,49\.14%\{transform:none\}56\.9%,100%\{transform:translateY\(calc\(-400\*var\(--u\)\)\)\}\}/.test(BUILDER_CSS)) /* Changed on purpose (landing round 15): the canvas scrolls after the first publish (5.7s to 6.6s of 11.6), by 400u, to the products' top edge. */
/* Changed on purpose (landing round 15): the ring in parts (top and sides, a bottom edge that moves down, the sides carried on) so a section can grow by transforms; the chip at the bottom right, as sections/_shared.tsx draws it. */
check("the selection ring and chip are the builder's (#3b82f6)", /\n\.wx-sel\{position:absolute;inset:0;box-shadow:inset 0 calc\(2\*var\(--u\)\) #3b82f6/.test(BUILDER_CSS) && /\n\.wx-sel em\{position:absolute;right:calc\(8\*var\(--u\)\);bottom:calc\(8\*var\(--u\)\);[^}]*background:#3b82f6/.test(BUILDER_CSS))
// Changed on purpose (landing round 15): Steez alone, no scenes (the owner).
check("Steez alone on the tab", !("scenes" in Ideas.IDEAS_TABS[0]) && /<b class="wx-name">Steez<\/b>/.test(wb) && !/loudlib/.test(wb))

console.log("\n── GodBless is gone, with its files ──")
const all = code(read(F.builders)) + code(read(F.ideas))
check("nothing of it in the code or the alt text", !/GodBless|godbless|GB Oswald|gb-/.test(all + Ideas.IDEAS_TABS.map((t) => t.alt).join()))
check("its pictures and font are deleted", ["gb-hero", "gb-logo", "gb-camo", "gb-green", "gb-hoodie", "gb-brown"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))) && !existsSync(join(root, "public/home/fonts/gb-oswald.woff2")))

console.log("\n── 2. The OnePage editor: Desmond alone ──")
const ope = renderToStaticMarkup(createElement(OnePageEditorMock))
check("Idris Kane is gone from the editor, the code and the alt text", !/Idris|idriskane|IdrisPage|IDRIS/.test(ope + all + Ideas.IDEAS_TABS[1].alt) && !/\.ik[-{ ]|\.dp\.ik/.test(BUILDER_CSS))
check("his pictures are deleted", ["ik-portrait", "ik-av", "ik-print", "ik-print-128", "lt-field", "lt-field-128", "lt-street", "lt-street-128"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))))
// Changed on purpose (landing round 15): the tabs have no scenes any more; one Links column, one page.
check("one scene: one Links column, one page", !("scenes" in Ideas.IDEAS_TABS[1]) && (ope.match(/class="ope-panel"/g) ?? []).length === 1 && (ope.match(/class="dp"/g) ?? []).length === 1 && !/bm-s[12]/.test(ope))
check("the phone no longer scrolls, so his photo, name and corner keys stay in view", !/sxk-op-scroll/.test(BUILDER_CSS) && !/\.ope-phone \.dp\{animation/.test(BUILDER_CSS))
check("the video is 156u, so the page with the signup on fits the phone (measured: 13u to spare)", rule(BUILDER_CSS, ".dp-video").includes(`height:${U(156)}`))

console.log("\n── 3. Unlimited possibilities: larger on a phone ──")
const um = read(F.marquee)
const phone = um.match(/@media\(max-width:767px\)\{\n[\s\S]*?\n\}/)?.[0] ?? ""
check("the heading 33px at 390 (wave 18: 30, before: 36)", /\.um \.story-heading\{font-size:clamp\(28px,8\.5vw,36px\)\}/.test(phone) && Math.round(390 * 0.085) === 33)
check("the photos 51px at 390 (wave 18: 47, before: 54)", /\.um-row\{--pic:clamp\(46px,13vw,56px\)\}/.test(phone) && Math.round(390 * 0.13) === 51)
/* Changed on purpose (landing round 15): on a phone the line under the heading is hidden (the owner). */
// Changed on purpose (landing round 15): the line under the heading is gone at every width (the owner), so nothing to hide.
check("the line gone, the labels 17px, a little more room", !/um-sub/.test(phone) && /\.um-item\{gap:13px;margin-right:37px;font-size:17px\}/.test(phone))
check("a computer keeps its sizes", /\.um-row\{--pic:clamp\(54px,5\.6vw,108px\);/.test(um) && /\.um-item\{[^}]*font-size:clamp\(18px,1\.75vw,31px\)/.test(um))

console.log("\n── Copy ──")
const words = renderToStaticMarkup(createElement(WebsiteBuilderMock)) + ope + Ideas.IDEAS_TABS.map((t) => t.alt).join(" ")
check("no em dashes, no banned words", !/—/.test(all + words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|enthusiasts?)\b/i.test((all + words).replace(/transform[:(=][^;}\n]*/g, "")))
check("no Shopify or Liquid in what is drawn or said", !/shopify|liquid/i.test(words))
check("none of the never on the page samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind\b/i.test(words))
check("this suite runs with the push tests, after round 12's", /"tests\/home-landing-r12-perf\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r13-ideas\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
