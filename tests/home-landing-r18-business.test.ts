/**
 * Landing round 18, business ("A page that fits what you sell"). The owner:
 *  - the "Digital downloads" card should not be round 17's one PDF and its
 *    receipt email. It shows several digital products, with a different,
 *    simpler and cleaner moving picture. So: six real downloads of six
 *    kinds (an e-book, a video course, a LUT pack, a sample pack, a Notion
 *    template, a PDF guide), each a card with its cover, kind and price,
 *    gliding up one column past one fixed "Instant download" tag; the card
 *    that comes to rest under the tag turns its price into Delivered and the
 *    tag's arrow dips. One loop on one clock (a negative delay per
 *    card), played four steps once a turn and stopped at a rest (no endless
 *    loop, round 13), transform and opacity only, under .bz-on, paused off
 *    screen; without motion it stands at the loop's first rest.
 *  - the name and line stay: "Digital downloads", "E-books and files, sent
 *    the moment they pay".
 *  - not round 14's shelf (a grid you hover and buy from), not round 15's
 *    library rows, not round 16's book, not round 17's receipt.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
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
const { BUSINESS_MOCK_CSS, DigitalScene, DIGITAL_PRODUCTS, DIGITAL_BADGE, DIGITAL_BEAT_S, DIGITAL_GLIDE, DIGITAL_STEPS, DIGITAL_LOOP_S, DIGITAL_ARRIVE, DIGITAL_RUN_STEPS, DIGITAL_RUN_S, digitalPlace, digitalStep, digitalLook, digitalRuns } = Mocks
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

console.log("\nDigital: the name and line stay")
{
  const d = BUSINESS_SLIDES[0]
  check("\"Digital downloads\", \"E-books and files, sent the moment they pay\"", d.id === "digital" && d.label === "Digital downloads" && d.tab === "Downloads" && d.line === "E-books and files, sent the moment they pay")
  check("both on the page", html.includes(">Digital downloads<") && html.includes("E-books and files, sent the moment they pay"))
  check("its alt names all six products and the tag", DIGITAL_PRODUCTS.every((p) => d.alt.includes(p.name) && d.alt.includes(p.price)) && d.alt.includes("Instant download") && /Delivered/.test(d.alt))
  const words = [d.label, d.line, d.alt, digital.replace(/<[^>]+>/g, " "), ...DIGITAL_PRODUCTS.flatMap((p) => [p.name, p.kind, p.price])].join(" ")
  check("no banned words, em dashes, disliked names, other brands or presets", !BANNED.test(words), words.match(BANNED)?.[0])
}

console.log("\nDigital: several products, of different kinds, real covers")
{
  check("six products, six different kinds", DIGITAL_PRODUCTS.length === 6 && new Set(DIGITAL_PRODUCTS.map((p) => p.kind.split(" · ")[0])).size === 6)
  const kinds = DIGITAL_PRODUCTS.map((p) => p.kind).join("|")
  check("an e-book, a video course, a LUT pack, a sample pack, a Notion template and a PDF guide", ["E-book", "Video course", "LUT pack", "Sample pack", "Notion template", "Guide · PDF"].every((k) => kinds.includes(k)))
  check("the names the page already sells", DIGITAL_PRODUCTS.map((p) => p.name).join() === "Ancestral Kitchen,Daily Mobility,Cine Tones,Drums One Shots,Creator Planner,Pricing Your Work")
  check("prices are dollars, and match the page elsewhere (Ancestral Kitchen $34, Daily Mobility $79, Cine Tones $29)", DIGITAL_PRODUCTS.every((p) => /^\$\d+$/.test(p.price)) && DIGITAL_PRODUCTS[0].price === "$34" && DIGITAL_PRODUCTS[1].price === "$79" && DIGITAL_PRODUCTS[2].price === "$29")
  check("Daily Mobility's lesson count is the one the checkout section shows", DIGITAL_PRODUCTS[1].kind.includes("21 lessons") && read("components/marketing/home/checkout-scene.tsx").includes("Video course · 21 lessons"))
  const srcs = [...digital.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
  check("every cover is drawn, one per card", srcs.length === 6 && srcs.join() === DIGITAL_PRODUCTS.map((p) => p.cover).join())
  const missing = srcs.filter((s) => !existsSync(`public${s}`))
  check("every cover exists in public/", missing.length === 0, missing)
  check("covers are small 240px squares (under 12 KB each)", srcs.every((s) => statSync(`public${s}`).size < 12_000) && srcs.every((s) => /\/home\/showcase\/dz-[a-z]+\.webp$/.test(s)) && /<img src="[^"]+" alt="" width="240" height="240" loading="eager"/.test(digital))
  check("one tag, \"Instant download\", outside the moving column", DIGITAL_BADGE === "Instant download" && (digital.match(/class="dz-tag"/g) ?? []).length === 1 && /<\/div><span class="dz-tag">/.test(digital))
  check("each card: cover, kind, name, then price and Delivered in one place", (digital.match(/<div class="dz-card[^"]*" style="[^"]*"><img[^>]*><span class="dz-txt"><span class="dz-kind">[^<]+<\/span><b class="dz-name">[^<]+<\/b><span class="dz-state"><span class="a">\$\d+<\/span><span class="b"><svg[\s\S]*?<\/svg> Delivered<\/span><\/span><\/span><\/div>/g) ?? []).length === 6)
  check("not round 17's receipt or round 15's library or round 14's buy shelf", !/dl-mail|dl-fly|Your receipt|Download now|Buy for|bl-row|Library/.test(digital) && !("DIGITAL_FILE" in Mocks) && !/class="[^"]*\bdl-/.test(html))
  check("a picture, not a control: a labelled image on the usual turn, no script", !BUSINESS_SLIDES[0].live && BUSINESS_SLIDES[0].ms === undefined && !/useState/.test(code(MOCKS)) && /<div class="smk-frame bz-frame" role="img" aria-label="Digital downloads on Storelib/.test(html))
}

console.log("\nDigital: one column, one clock")
{
  check("the loop: six steps of 1.5 s, 40% of each a glide", DIGITAL_STEPS === 6 && DIGITAL_BEAT_S === 1.5 && DIGITAL_GLIDE === 0.4 && DIGITAL_LOOP_S === 9)
  const places = DIGITAL_PRODUCTS.map((_, k) => digitalPlace(k))
  check("at rest: Ancestral Kitchen under the tag, two below, one hidden under the foot, two above", places.join() === "0,1,2,3,-2,-1")
  check("each card's step into the loop puts it at its place (it starts at place 3 and rises one a step)", DIGITAL_PRODUCTS.every((_, k) => 2 - digitalStep(k) === (places[k] === 3 ? -3 : places[k])))
  check("the drawn style carries place, opacity, scale, step and run", DIGITAL_PRODUCTS.every((_, k) => digital.includes(`style="--p:${places[k]};--o:${digitalLook(places[k]).o};--sc:${digitalLook(places[k]).s};--m:${digitalStep(k)};--n:${digitalRuns(k)}"`)))
  /* Each card's run ends at the same moment of the turn: its delay is -(m + glide) steps, its run n loops. */
  const ends = DIGITAL_PRODUCTS.map((_, k) => digitalRuns(k) * DIGITAL_LOOP_S - (digitalStep(k) + DIGITAL_GLIDE) * DIGITAL_BEAT_S)
  check("every card stops on the same frame, 6.6 s in (four products delivered in the 6.5 s turn)", DIGITAL_RUN_STEPS === 4 && Math.abs(DIGITAL_RUN_S - 6.6) < 1e-9 && ends.every((e) => Math.abs(e - DIGITAL_RUN_S) < 0.01), ends)
  /* The fourth card comes to rest under the tag at 4 steps; Delivered is in 0.5 s later; the next glide would start (1 - glide) of a step later. */
  const lastIn = DIGITAL_RUN_STEPS * DIGITAL_BEAT_S
  check("it stops in a rest, after the last Delivered is in and before the next glide", DIGITAL_RUN_S >= lastIn + 0.5 && DIGITAL_RUN_S < lastIn + (1 - DIGITAL_GLIDE) * DIGITAL_BEAT_S && Section.BUSINESS_SLIDE_MS / 1000 >= lastIn + 0.5)
  check("delivered at rest: the card under the tag and those above; priced: those below", (digital.match(/class="dz-card is-sent"/g) ?? []).length === 3 && places.every((p, k) => digital.split('<div class="dz-card')[k + 1].startsWith(p <= 0 ? ' is-sent"' : '"')))
  check("the card under the tag is whole, the others fade with distance, hidden past two", digitalLook(0).o === 1 && digitalLook(0).s === 1 && digitalLook(1).o > digitalLook(2).o && digitalLook(2).o > 0 && digitalLook(3).o === 0 && digitalLook(-3).o === 0)
  const ride = motion.match(/@keyframes dz-ride\{([\s\S]*?\})\}/)?.[1] ?? ""
  const frames = [...ride.matchAll(/([\d.]+)%\{opacity:([\d.]+);transform:translate3d\(0,calc\(var\(--dz-step\) \* (-?\d)\),0\)(?: scale\(([\d.]+)\))?\}/g)].map((m) => ({ at: +m[1], o: +m[2], p: +m[3] }))
  check("dz-ride: 13 frames, a glide then a rest each step, from place 3 to -3", frames.length === 13 && frames[0].at === 0 && frames[0].p === 3 && frames[12].at === 100 && frames[12].p === -3 && frames.slice(0, 12).every((f, i) => f.p === 3 - Math.ceil(i / 2)), frames)
  check("it is hidden at both ends of the loop, so the jump from the top to the foot is never seen", frames[0].o === 0 && frames[12].o === 0 && frames[11].o === 0)
  const own = motion.split("\n").filter((l) => /\.dz-/.test(l) && /animation/.test(l))
  check("every moment is under .bz-on", own.length === 4 && own.every((l) => l.startsWith(".bz-on ")))
  check("the three per card moments share one clock: the loop's length, the card's own delay and run", own.filter((l) => !/dz-nudge/.test(l)).every((l) => l.includes(`${DIGITAL_LOOP_S}s`) && l.includes(`calc((var(--m) + ${DIGITAL_GLIDE}) * -${DIGITAL_BEAT_S}s) var(--n) both`)))
  check("no endless loop (round 13)", !/infinite/.test(mocks))
  check("the tag's arrow nudges once a step, for the steps played", own.some((l) => l.includes(`.dz-tag svg{animation:dz-nudge ${DIGITAL_BEAT_S}s ease .05s ${DIGITAL_RUN_STEPS + 1} both}`)))
  const arrive = +(DIGITAL_ARRIVE * 100).toFixed(3)
  const price = motion.match(/@keyframes dz-price\{0%,([\d.]+)%/)?.[1]
  const sent = motion.match(/@keyframes dz-sent\{0%,([\d.]+)%/)?.[1]
  check("Delivered comes just after the card comes to rest under the tag (within 0.3 s)", Math.abs(DIGITAL_ARRIVE - 0.4) < 1e-9 && +price! > arrive && +sent! > arrive && ((+sent! - arrive) / 100) * DIGITAL_LOOP_S <= 0.3, { arrive, price, sent })
  const used = [...new Set(own.flatMap((l) => [...l.matchAll(/animation:([\w-]+)/g)].map((m) => m[1])))]
  const keys = used.map((k) => motion.match(new RegExp(`@keyframes ${k}\\{([\\s\\S]*?\\})\\}`))?.[1] ?? "MISSING").join("")
  const props = [...keys.matchAll(/([a-z-]+):/g)].map((m) => m[1])
  check("its keyframes touch transform and opacity only", used.length === 4 && !keys.includes("MISSING") && props.every((p) => ["transform", "opacity"].includes(p)), { used, props })
  check("no filter, blur, will-change, mask or 3D in it", !/\.(dz-|bs-digital)[^{]*\{[^}]*(filter|blur|will-change|perspective|preserve-3d|mask)/.test(mocks))
  check("without motion the cards stand at their places (the drawn style), not by an animation", /\.dz-card\{[^}]*opacity:var\(--o\);transform:translate3d\(0,calc\(var\(--dz-step\) \* var\(--p\)\),0\) scale\(var\(--sc\)\)\}/.test(desk) && !/\.dz-[^{]*\{[^}]*animation/.test(desk + phone))
  check("the section still pauses its scenes off screen", /\.biz:not\(\[data-live\]\) \.bz-on \*/.test(read("components/marketing/home/business-carousel.tsx")))
  check("round 17's moments and keyframes are gone", !/\.dl-|dl-fly|dl-fill/.test(mocks))
}

console.log("\nDigital: inside its card, on a computer and on a phone")
{
  for (const [name, src, W, H] of [["computer", desk, 1100, 570], ["phone", phone, 360, 520]] as const) {
    const card = { ...Object.fromEntries(["left", "top", "width", "height"].map((k) => [k, num(rule(desk, ".dz-card"), k)])), ...Object.fromEntries(["left", "top", "width", "height"].map((k) => [k, num(rule(src, ".dz-card"), k)]).filter(([, v]) => !Number.isNaN(v))) } as Record<string, number>
    const step = num(rule(src, ".bs-digital"), "--dz-step")
    check(`${name}: the card at rest sits in the middle of the scene`, Math.abs(card.left + card.width / 2 - W / 2) <= 1 && Math.abs(card.top + card.height / 2 - H / 2) <= 1, card)
    check(`${name}: cards never overlap, and the ones beside the middle are whole`, step > card.height && card.top - step >= 0 && card.top + card.height + step <= H, { step, card })
    check(`${name}: nothing past the sides (at least 20u in)`, card.left >= 20 && card.left + card.width <= W - 20)
    const tag = rule(src, ".dz-tag")
    const tagTop = num(tag, "top")
    const tagH = num(tag, "height")
    check(`${name}: the tag sits on the resting card's top edge, at its right`, tagTop < card.top && tagTop + tagH > card.top && W - num(tag, "right") < card.left + card.width && W - num(tag, "right") > card.left + card.width / 2, { tagTop, tagH, card })
  }
  check("the tag stays above the cards", /\.dz-tag\{[^}]*z-index:2/.test(desk))
}

console.log("\nRegistered")
{
  const run = read("scripts/run-push-tests.mjs")
  const at = run.indexOf('"tests/home-landing-r18-business.test.ts"')
  const lastR17 = Math.max(...["small", "business", "checkout"].map((t) => run.indexOf(`"tests/home-landing-r17-${t}.test.ts"`)))
  check("in the push suite, after the last round 17 entry", at > lastR17 && lastR17 > 0)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
