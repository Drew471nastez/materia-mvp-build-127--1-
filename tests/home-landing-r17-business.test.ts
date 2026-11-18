/**
 * Landing round 17, business ("A page that fits what you sell"). The owner:
 *  - disliked the digital card's cookbook opening, and asked for a name and
 *    a line people understand at a glance and a clear, calm picture of "you
 *    sell a file, the buyer gets it the moment they pay". The card is
 *    "Digital downloads", "E-books and files, sent the moment they pay". The
 *    scene: Ancestral Kitchen, a PDF, bought (Buy turns into Paid), the
 *    buyer's receipt email comes in, the PDF lifts off the Buy button and
 *    lands in it, Download now is pressed, a bar fills, Downloaded. CSS on
 *    transform and opacity only, once a turn under .bz-on, paused off
 *    screen; without motion it stands at its end.
 *  - on a phone, the line of store designs ran off both edges of its card
 *    (r17in/physical-phone.png). On a phone the front design is smaller,
 *    one design shows each side, solid, and the two further out are gone,
 *    so nothing stands past the card while it turns or is dragged.
 */
import { existsSync, readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Section from "@/components/marketing/home/business-carousel"
import * as Mocks from "@/components/marketing/home/showcase-mocks/business-mocks"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const MOCKS = "components/marketing/home/showcase-mocks/business-mocks.tsx"
const { BUSINESS_SLIDES, BusinessCarousel } = Section
const { BUSINESS_MOCK_CSS, DigitalScene, PhysicalScene, CourseScene, ClubScene, CoachScene, DIGITAL_PRODUCTS, STORE_DESIGNS, STORE_DESIGN_WIDTHS, STORE_PHONE, STORE_PLACE_O_PHONE, storePlace } = Mocks
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/calc\(([-\d.]+)\*var\(--u\)\)/g, "$1u")
const phoneAt = mocks.indexOf("@media(max-width:767px)")
const motionAt = mocks.indexOf("@media(prefers-reduced-motion:no-preference)")
const desk = mocks.slice(0, phoneAt)
const phone = mocks.slice(phoneAt, motionAt)
const motion = mocks.slice(motionAt)
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const digital = renderToStaticMarkup(createElement(DigitalScene))
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramic|\btotes?\b|After Dark|membership|Mondo Mango|Mara Lind|Idris Kane|Ruben Linde|Juno Kada|junokada|Five ways to get paid|From a cookbook to a coaching call|Ship it, stream it|Sell files, parcels|What sellers ask us|Shopify|Liquid|Materia|instantly|preset/i
const rule = (src: string, sel: string) => src.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""
const num = (decl: string, prop: string) => Number(decl.match(new RegExp(`(?:^|;)${prop}:(-?[\\d.]+)u`))?.[1])

console.log("\nDigital: a name and a line read at a glance")
{
  const d = BUSINESS_SLIDES[0]
  check("the card is \"Digital downloads\", \"E-books and files, sent the moment they pay\"", d.id === "digital" && d.label === "Digital downloads" && d.tab === "Downloads" && d.line === "E-books and files, sent the moment they pay")
  check("the name and line are on the page (index and phone card)", html.includes(">Digital downloads<") && html.includes("E-books and files, sent the moment they pay"))
  // Changed on purpose (landing round 18): the scene is six products in a column, not one PDF and its email; the alt names them all.
  check("its alt names the file, the email and the download", /^Digital downloads on Storelib: Ancestral Kitchen, an e-book/.test(d.alt) && /Delivered/.test(d.alt))
  // Changed on purpose (landing round 18): the words are the six products' names, kinds and prices.
  const words = [d.label, d.line, d.alt, digital.replace(/<[^>]+>/g, " "), ...DIGITAL_PRODUCTS.flatMap((p) => [p.name, p.kind, p.price])].join(" ")
  check("no banned words, em dashes, disliked names, other brands or presets", !BANNED.test(words), words.match(BANNED)?.[0])
}

/*
  Changed on purpose (landing round 18): the owner asked for several digital products and a different, simpler
  moving picture than this round's one PDF bought and landing in an email. The receipt scene (its buy card, email,
  flying file and their places) is gone; tests/home-landing-r18-business.test.ts pins the column of products that
  replaced it. What still holds from here: a labelled picture on the usual turn, every moment under .bz-on on
  transform and opacity, nothing standing past its card.
*/
console.log("\nDigital: calm, on the compositor, paused off screen")
{
  check("a labelled picture on the usual turn, no script", !BUSINESS_SLIDES[0].live && BUSINESS_SLIDES[0].ms === undefined && !/useState/.test(code(MOCKS)) && /<div class="smk-frame bz-frame" role="img" aria-label="Digital downloads on Storelib/.test(html))
  check("the receipt scene is gone", !/dl-mail|dl-fly|dl-buy|Your receipt/.test(digital + mocks))
  const own = motion.split("\n").filter((l) => /\.dz-/.test(l) && /animation/.test(l))
  check("every moment is under .bz-on (restarts when shown; paused off screen by the section)", own.length >= 3 && own.every((l) => l.startsWith(".bz-on ")))
  check("no filter, blur, will-change or 3D in it", !/\.dz-[^{]*\{[^}]*(filter|blur|will-change|perspective|preserve-3d)/.test(mocks))
  check("the section still pauses its scenes off screen", /\.biz:not\(\[data-live\]\) \.bz-on \*/.test(read("components/marketing/home/business-carousel.tsx")))
}

console.log("\nPhysical on a phone: nothing past the card")
{
  check("the phone line: smaller (228u of 360u), closer, one solid design a side, none further", STORE_PHONE.w === 228 && STORE_PHONE.x <= 0.36 && STORE_PLACE_O_PHONE.join() === "0,0,1,1,1,0,0" && /\.bt-stage\{width:228u;height:285u;/.test(phone))
  check("the computer's line is as it was", storePlace(0).o === 1 && storePlace(1).o === 1 && storePlace(2).o === 0.55 && /\.bt-stage\{[^}]*width:336u;height:420u;/.test(desk))
  check("the engine reads the layout's own opacities and drag", /storePlace\(k, scale\.o\)/.test(code(MOCKS)) && /scale\.drag \* unit/.test(code(MOCKS)))
  check("before the script runs, the phone's far designs are hidden", [3, 4, 5].every((i) => new RegExp(`\\.bt-card:nth-child\\(${i}\\)\\{[^}]*opacity:0;[^}]*visibility:hidden\\}`).test(phone)))
  /*
    Where a design's edges land on screen, by the same sums the browser does: scale, turn about the card's middle,
    move, then the stage's perspective (950u, seen from 42% down). Every design drawn at any point of a turn, at
    every fraction between two places, stays inside the 360u card with room to spare.
  */
  const P = Number(phone.match(/\.bt-stage\{[^}]*perspective:([\d.]+)u/)?.[1])
  const W = STORE_PHONE.w
  const H = (W * 5) / 4
  let worst = 0
  let worstSolid = 0
  for (let k = -3; k <= 3; k += 0.02) {
    const p = storePlace(k, STORE_PLACE_O_PHONE)
    if (p.o < 0.02) continue
    const r = (p.r * Math.PI) / 180
    for (const sx of [-1, 1]) {
      const x = (sx * W) / 2 * p.s
      const X = x * Math.cos(r) + p.x * STORE_PHONE.x
      const Z = -x * Math.sin(r) + p.z * STORE_PHONE.z
      const edge = Math.abs((X * P) / (P - Z))
      worst = Math.max(worst, edge)
      if (p.o >= 0.5) worstSolid = Math.max(worstSolid, edge)
    }
  }
  check("every drawn design stays inside the card's 180u half width; at half strength or more, 6u to spare", P === 950 && worst < 180 && worstSolid <= 174, { worst: Math.round(worst), worstSolid: Math.round(worstSolid), H })
}

console.log("\nEvery picture the section names exists")
{
  const markup = [DigitalScene, PhysicalScene, CourseScene, ClubScene, CoachScene].map((S) => renderToStaticMarkup(createElement(S))).join("")
  const srcs = [...new Set([...markup.matchAll(/src="([^"]+)"/g)].map((m) => m[1]))]
  const designs = STORE_DESIGNS.flatMap((d) => STORE_DESIGN_WIDTHS.map((w) => `/home/showcase/bt-${d}-${w}.webp`))
  const missing = [...srcs, ...designs].filter((s) => s.startsWith("/") && !existsSync(`public${s.split("?")[0]}`))
  check("every src in the five scenes and every store design is in public/", srcs.length >= 6 && missing.length === 0, missing)
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 16 entries", /"tests\/home-landing-r16-business\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r17-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
