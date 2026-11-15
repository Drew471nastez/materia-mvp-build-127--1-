/**
 * LANDING ROUND 9, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * What the owner asked for after round 8, pinned:
 *
 *   the entrance       first the phone, big, with the products going round it; the stage holds about a screen
 *                      (sticky, asked for here) while the scroll brings the phone down and reveals the headline,
 *                      which is not there when the section arrives; then the cards. A scroll timeline of
 *                      transform and opacity, and where there is none, the finished scene with nothing held
 *   the products       going round the phone's axis by themselves, not standing there: one CSS 3D space, the
 *                      browser sorting the phone and the ring by depth; dimmer behind it; paused off screen
 *   what they are      a creator's products, physical and digital: a tee, a cap, a tote, and the Cine Tones LUT
 *                      Pack's box, an e-book, a course card, a Notion template. No camera, plant, lamp, vase,
 *                      cassette player or hat
 *   Google Pay         beside Apple Pay on the phone's checkout
 *   the bug            "on mobile devices the content of the phone mockup doesn't load": WebKit divided a length
 *                      it had not worked out yet; the scale now divides a registered length
 *   the cards, phone   each card's computer picture in a 4:3 box, cropped or laid out again, never scaled down
 *                      whole; shorter lines under the titles
 *   smoother           One page, then paid (fewer animated layers, softer scrolls, an opaque paid screen) and
 *                      the currencies (cross fades, a gliding marker)
 *   the reminder       the black t-shirt in the email, and a "Recovered" tile with a rising line beside it
 *   orbs               two barely visible lights on each card, still gradients
 *   lighter            no shadow or filter in the stage, fewer and smaller pictures on a phone
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_STYLES, FLOATS, LUTS, PRICES, TEE } from "../components/marketing/home/checkout-scene"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const CO = "components/marketing/home/checkout-scene.tsx"
const src = read(CO)
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const co = renderToString(createElement(CheckoutScene))
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))?.[1] ?? ""
const onlyCompositor = (body: string) => body.length > 0 && [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function")
const card = (id: string) => co.slice(co.indexOf(`data-k="${id}"`), co.indexOf("</article>", co.indexOf(`data-k="${id}"`)))
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
/* The part of the stylesheet that only applies with scroll timelines, and the part before it. */
// Changed on purpose (landing round 10): the cards have no ground of their own now; the timeline part ends where their rule's comment starts.
const tl = css.slice(css.indexOf("@supports (animation-timeline:view()){"), css.indexOf(" * The cards: no ground of their own"))
const base = css.slice(0, css.indexOf("@supports (animation-timeline:view()){"))
/* The phone's rules for the cards (the last max-width block of the cards' stylesheet). */
const phoneCss = css.slice(css.lastIndexOf("@media (max-width:899px){", css.indexOf(".cmc-bento{display:flex")), css.indexOf("@keyframes cdx-scroll"))

console.log("\n1. The entrance: the phone first, then the headline, then the cards")
// Changed on purpose (landing round 10): the track holds the stage and the cards (its height is theirs), so the stage holds a screen and then stays behind the cards.
check("the stage holds about one screen, by sticky, only where scroll timelines exist", /\.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(tl) && /\.cmc-stage\{position:sticky;top:0\}/.test(tl) && /\.cmc-track > \.cmc-cards\{margin-top:calc\(100svh - 56svh\)\}/.test(tl) && /\.cmc-track\.cmc-track\{[^}]*padding:0\}/.test(base) && /\.cmc-stage\{position:relative;height:100svh;/.test(base))
// Changed on purpose (landing round 10): the ranges are svh of scroll (the track is longer: it holds the cards too).
check("the phone starts big and centred and comes down, a little smaller, over the first part of the hold", /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.4,0,\.2,1\) both;animation-timeline:--cmc-t;animation-range:contain 0svh contain 44svh\}/.test(tl) && /\.cmc-rise\{animation:cmc-shrink cubic-bezier\(\.4,0,\.2,1\) both;animation-timeline:--cmc-t;animation-range:contain 0svh contain 44svh\}/.test(tl) && /from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(0,var\(--down\),0\)\}/.test(keyframes("cmc-settle") + "}") && /to\{transform:scale\(var\(--ps\)\)\}/.test(keyframes("cmc-shrink") + "}"))
check("  the phone is bigger: up to 72vw on a phone, 400px on a computer, and as tall as the screen allows", /--pw:min\(72vw,300px,calc\(\(100svh - var\(--hd\) - 40px\) \/ 2\.07\)\)/.test(css) && /--pw:min\(400px,calc\(\(100svh - var\(--hd\) - 56px\) \/ 2\.07\)\)/.test(css))
// Changed on purpose (landing round 10): the same ranges in svh of scroll.
check("the headline is not there when the section arrives: each word rises in on the timeline, one after another, done as the phone lands", /\.cmc-w\{animation:cmc-word cubic-bezier\(\.2,\.7,\.3,1\) both;animation-timeline:--cmc-t\}/.test(tl) && /from\{opacity:0;transform:translate3d\(0,\.55em,0\)\}/.test(keyframes("cmc-word")) && (tl.match(/\.cmc-w\[data-w="\d"\]\{animation-range:contain [\d.]+svh contain [\d.]+svh\}/g) ?? []).length === 8 && /\.cmc-w\[data-w="0"\]\{animation-range:contain 5svh contain 25\.8svh\}/.test(tl) && /\.cmc-w\[data-w="7"\]\{animation-range:contain 23\.2svh contain 44svh\}/.test(tl))
check("  one headline, in the stage, over the phone", (co.match(/<h2 /g) ?? []).length === 1 && /<h2 id="cmc-title"/.test(stage) && words(stage).includes("Checkout that turns a tap into a sale"))
// Changed on purpose (landing round 10): the cards are inside the track; their fallback overlap is their base rule.
check("without scroll timelines, or with reduced motion: the finished scene, nothing held, the headline simply there", /\.cmc-world\{[^}]*transform:translate3d\(0,var\(--down\),0\)\}/.test(base) && /\.cmc-rise\{position:relative;transform:scale\(var\(--ps\)\)\}/.test(base) && !/\.cmc-w\{[^}]*opacity/.test(base) && /\.cmc-cards\{position:relative;z-index:5;margin-top:-8svh\}/.test(base + css.slice(css.indexOf(" * The cards: no ground of their own"))))
check("  every timeline rule is inside prefers-reduced-motion: no-preference", css.lastIndexOf("@media (prefers-reduced-motion:no-preference){", css.indexOf("@supports (animation-timeline:view()){")) > css.indexOf(".cmc-face{display:block"))
// Changed on purpose (landing round 10): the overlap is written as the cards' start inside the track.
check("then the cards slide up over the phone, one after another (an observer and transitions)", /\.cmc-card\{transition:opacity \.7s ease,transform 1s cubic-bezier\(\.16,1,\.3,1\);transition-delay:calc\(var\(--ci\) \* \.09s\)\}/.test(css) && /margin-top:calc\(100svh - 56svh\)/.test(css))
check("nothing per frame in script: no scroll listener, no rAF, no layout read, no timers, no state", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop|setTimeout|setInterval|useState/.test(code(src)))
check("every keyframe in the section moves transform and opacity only", [...css.matchAll(/@keyframes ([\w-]+)\{([\s\S]*?\})\}/g)].filter((m) => /^(cm|cdx|cv|pc|ap|tp)/.test(m[1])).every((m) => onlyCompositor(m[2])))

console.log("\n2. The products go round the phone by themselves")
const turn = keyframes("cmc-orbit")
check("a whole turn round the phone's vertical axis, out to the ring, turned back to face the viewer", /rotateY\(calc\(var\(--a\) \+ 0deg\)\) translate3d\(0,calc\(var\(--pw\) \* var\(--y\)\),var\(--r\)\) rotateY\(calc\(var\(--a\) \* -1 - 0deg\)\)/.test(turn) && /rotateY\(calc\(var\(--a\) \+ 360deg\)\) translate3d\(0,calc\(var\(--pw\) \* var\(--y\)\),var\(--r\)\) rotateY\(calc\(var\(--a\) \* -1 - 360deg\)\)/.test(turn))
check("  running by itself, slowly and evenly (linear, 44s a turn), paused off screen and in a hidden tab", /\.cmc-o\{animation:cmc-orbit 44s linear infinite;animation-play-state:paused\}/.test(css) && /\.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css) && /const \[stageRef\] = useCommerceLive<HTMLDivElement>\("0px 0px", false\)/.test(src))
check("  will-change only while the stage is on screen", (css.match(/will-change:/g) ?? []).length === 1)
check("  each starts at its own place on the ring, spread round it", FLOATS.every((f) => f.d.p >= 0 && f.d.p < 1) && new Set(FLOATS.map((f) => f.d.p)).size === FLOATS.length && FLOATS.slice(1).every((f, i) => f.d.p - FLOATS[i].d.p > 0.1) && /--a:calc\(var\(--p\) \* 360deg\)/.test(css))
check("one 3D space for the phone and the ring, so the browser sorts them by depth: behind the phone, then in front", /\.cmc-phone-wrap\{[^}]*perspective:calc\(var\(--pw\) \* var\(--pp\)\)\}/.test(css) && /\.cmc-world\{[^}]*transform-style:preserve-3d/.test(css) && /\.cmc-orbit\{[^}]*transform-style:preserve-3d;transform:rotateX\(var\(--tilt\)\)\}/.test(css) && /\.cmc-o\{[^}]*transform-style:preserve-3d/.test(css) && /class="cmc-world"><div class="cmc-orbit" aria-hidden="true">[\s\S]*<div class="cmc-rise">/.test(stage))
check("  nothing on the 3D boxes that would flatten the space (opacity, overflow, filter, a mask)", !/\.cmc-(world|orbit|o)\{[^}]*(opacity|overflow|filter|mask)/.test(css) && !/\.cmc\[data-cmc-over\] \.cmc-(world|orbit|o)\b/.test(css))
check("  depth scale comes from the perspective; dimmer behind the phone, in step with the turn", /@keyframes cmc-depth\{0%,100%\{opacity:1\}22%,78%\{opacity:\.9\}50%\{opacity:\.38\}\}/.test(css) && /\.cmc-face\{animation:cmc-depth 44s linear infinite;animation-delay:calc\(var\(--p\) \* -44s\);animation-play-state:paused\}/.test(css))
// Changed on purpose (landing round 10): the face holds the blurred copy, so it is positioned.
check("  the ring leans, so a product in front passes low and one behind passes high; the face undoes the lean", /--tilt:-15deg/.test(css) && /\.cmc-face\{position:relative;display:block;transform:rotateX\(calc\(var\(--tilt\) \* -1\)\)\}/.test(css))
check("plus the scroll: it turns the ring 26 degrees either way over the scene, and the faces turn back", /\.cmc-orbit\{animation:cmc-spin linear both;animation-timeline:--cmc-t;animation-range:entry 0% exit 100%\}/.test(tl) && /rotateY\(-26deg\)\}to\{transform:rotateX\(var\(--tilt\)\) rotateY\(26deg\)/.test(keyframes("cmc-spin") + "}") && /\.cmc-face\{animation:cmc-unspin linear both,cmc-depth 44s linear infinite;animation-timeline:--cmc-t,auto;/.test(tl) && /animation-play-state:running,paused\}/.test(tl) && /\.cmc-stage\[data-commerce-live\] \.cmc-face\{animation-play-state:running,running\}/.test(tl))

console.log("\n3. Physical and digital products a creator sells")
const ids = FLOATS.map((f) => f.id)
check("three physical (a tee, a cap, a tote) and four digital (the LUT pack, a course, an e-book, a Notion template)", ids.join() === "tee,luts,cap,course,tote,ebook,notion" && FLOATS.filter((f) => f.kind === "physical").length === 3 && FLOATS.filter((f) => f.kind === "digital").length === 4 && (stage.match(/data-kind="digital"/g) ?? []).length === 4)
check("  mixed round the ring: no two physical products next to each other", FLOATS.every((f, i) => f.kind === "digital" || FLOATS[(i + 1) % FLOATS.length].kind === "digital"))
check("  the physical ones are photographs with their grounds cut away (webp with alpha, under 30 KB)", FLOATS.filter((f) => f.kind === "physical").every((f) => {
  const p = `public${f.img!.src}`
  if (!existsSync(p)) return false
  const b = readFileSync(p)
  return b.toString("ascii", 12, 16) === "VP8X" && (b[20] & 0x10) !== 0 && statSync(p).size < 30 * 1024
}))
check("  their width and height are set, they load lazily and decode off the main thread", (stage.match(/<img class="cmc-pic"[^>]*>/g) ?? []).length === 3 && (stage.match(/<img class="cmc-pic"[^>]*>/g) ?? []).every((t) => /width="\d+"/.test(t) && /height="\d+"/.test(t) && /loading="lazy"/.test(t) && /decoding="async"/.test(t)))
check("  the digital ones are drawn as objects: the LUT pack's box with the section's cover, an e-book, a course card, a Notion template", /class="cmt cmt-box"><span class="ebc /.test(stage) && /class="cmt cmt-book"/.test(stage) && /class="cmt cmt-course"/.test(stage) && /class="cmt cmt-notion"/.test(stage) && ["E-book", "Color Notes", "Editing for Story", "Course · 24 lessons", "Notion template", "Shoot Planner"].every((t) => words(stage).includes(t)))
check("the camera, plant, lamp, vase, cassette player and hat are gone, files and all", ["camera", "plant", "lamp", "vase", "cassette", "hat"].every((n) => !existsSync(`public/home/commerce/obj-${n}.webp`) && !new RegExp(`obj-${n}`).test(src)) && !/Poly Haven|Camera_01|potted_plant|desk_lamp|ceramic_vase|cassette|fishermans/.test(src))

console.log("\n4. The Cine Tones LUT Pack everywhere; no leftovers")
check("the phone, the window, the currencies and the ring show the LUT pack on its cover", LUTS.title === "Cine Tones LUT Pack" && (co.match(/class="ebc-tag">LUT Pack</g) ?? []).length >= 5 && words(stage).includes("Cine Tones LUT Pack"))
check("no Maren Holt, no Harbor yarn kit, none of the banned samples, in the code or the markup", !/Maren|Harbor|yarn|Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|[Ee]nthusiasts/.test(src + words(co)))
check("the reminder is for the black t-shirt", words(card("recover")).includes(`You left ${TEE.title} at checkout`) && card("recover").includes("/home/commerce/tee-thumb.webp") && words(card("recover")).includes(`Paid ${TEE.price}`) && !/Cine Tones/.test(words(card("recover"))))

console.log("\n5. Google Pay beside Apple Pay on the phone")
check("the phone's checkout has both express buttons, side by side", /class="pc-xp"><span class="pc-ap pc-ap-a">[\s\S]*?<\/span><span class="pc-ap pc-ap-g">/.test(stage) && ["#EA4335", "#4285F4", "#FBBC05", "#34A853"].every((c) => stage.includes(c)) && /\.pc-xp\{display:grid;grid-template-columns:1fr 1fr;gap:10px\}/.test(css))
check("  its label says so; the tap in the One-tap demo lands on Apple Pay", /with Apple Pay and Google Pay\."/.test(stage) && /\.pc-touch\{position:absolute;left:106px;/.test(css) && /\.cmc-card\[data-commerce-live\] \.pc-ap-a\{animation-name:pc-press\}/.test(css))

console.log("\n6. The phone mockup's content loads on an iPhone")
check("the screen's scale divides a registered length (computed to pixels first), not a raw viewport or container expression", /@property --cmc-len\{syntax:"<length>";inherits:true;initial-value:0px\}/.test(css) && /--cmc-len:calc\(var\(--pw\) \* \.915\);--k:tan\(atan2\(var\(--cmc-len\),393px\)\)/.test(css) && (css.match(/:tan\(atan2\(/g) ?? []).length === 1)

console.log("\n7. On a phone: the computer's pictures in 4:3, adapted, not shrunk")
// Changed on purpose (landing round 10): a computer's picture is capped in height (--vis-cap), so a phone sets its own height and grid box.
check("a 4:3 picture box drawn on a 32 unit grid (a computer's is 48), so type stays near a computer's size", /\.cmc-vis\{height:auto;aspect-ratio:4\/3;/.test(phoneCss) && /\.cmc-vis-in\{font-size:calc\(100cqw \/ 32\);width:32em;height:24em;margin-left:-16em\}/.test(phoneCss) && /\.cmc-vis\{[^}]*height:min\(calc\(100cqw \* 42 \/ 48\),var\(--vis-cap\)\)/.test(css))
check("Built to convert: the same desktop window, no phone layout; wider than the box and cut by it, laid out again at a design width of 640", !/mcx/.test(css + co) && /\.cdx\{left:5%;right:auto;top:8%;bottom:-12%;width:132%;aspect-ratio:auto;transform:none\}/.test(phoneCss) && /--u:calc\(100cqw \/ 640\)/.test(phoneCss) && /--u:calc\(100cqw \/ 880\)/.test(css))
check("  paid and the seller's notice sit in the part of the window the box shows", /\.cdx-paid\{right:auto;width:calc\(95% \/ 1\.32\)\}/.test(phoneCss) && /\.cmv-sale\{right:auto;/.test(phoneCss))
check("One-tap: the phone near a computer's scale, moved through the box as the payment goes", /\.cmv-phone\{left:1\.5em;top:1\.4em;--pw:calc\(100cqw \* 14\.4 \/ 32\);--pan:calc\(100cqw \* -8\.4 \/ 32\)\}/.test(phoneCss) && onlyCompositor(keyframes("cmv-pan")) && /@media \(max-width:899px\)\{\s*\.cmc-card\[data-commerce-live\] \.cmv-phone\{animation-name:cmv-pan/.test(css))
check("currencies: both tiles and all seven chips, the pictures wider than tall", /\.cv-pic\{aspect-ratio:4\/3\}/.test(phoneCss) && !/\.cv-chip\{flex-direction:column/.test(css))
check("the reminder: the rail, the email and the Recovered tile", /\.cmv-mail\{left:1\.2em;width:19em;/.test(phoneCss) && /\.cmv-got\{left:21em;right:1\.2em;/.test(phoneCss))

console.log("\n8. Shorter lines under the cards' titles")
const BEFORE: Record<string, number> = { convert: 93, tap: 94, currency: 74, recover: 113 }
const bodies = Object.keys(BEFORE).map((id) => [id, (card(id).match(/<p>([^<]*)<\/p>/)?.[1] ?? "").replace(/&#x27;/g, "'")] as const)
check("each is shorter than round 8's, 35% less in all", bodies.every(([id, b]) => b.length > 20 && b.length < BEFORE[id]) && bodies.reduce((a, [, b]) => a + b.length, 0) <= 0.66 * Object.values(BEFORE).reduce((a, b) => a + b, 0))
check("  none over 75 characters; still true of checkout", bodies.every(([, b]) => b.length <= 75) && words(card("convert")).includes("No account. Contact, delivery and payment on one page.") && words(card("recover")).includes("A reminder goes out an hour later, if they asked for emails."))

console.log("\n9. Smoother: One page, then paid, and the currencies")
check("One page: no placeholders to cross fade, values fade in place (opacity only)", !/cdx-ph/.test(css + co) && /@keyframes cdx-v-email\{0%,[\d.]+%\{opacity:0\}[\d.]+%,[\d.]+%\{opacity:1\}/.test(css))
check("  the two scrolls take a second each, eased in and out; the order's column keeps step", (keyframes("cdx-scroll").match(/cubic-bezier\(\.65,0,\.35,1\)/g) ?? []).length === 2 && /0%,19\.5%\{[^}]*\}29\.5%,34\.5%\{[^}]*\}44%,/.test(keyframes("cdx-scroll")) && /0%,19\.5%\{[^}]*\}29\.5%,34\.5%\{[^}]*\}44%,/.test(keyframes("cdx-stick")))
check("  the paid screen is opaque, so the page going back to its top under it is never seen; no large shadow on the window", /\.cdx-paid\{[^}]*background:#fff;opacity:0\}/.test(css) && !/\.cdx-win\{[^}]*60u rgba/.test(src))
check("currencies: intact (the tee and the LUT pack, seven chips, the marker), two seconds each", PRICES.length === 7 && (card("currency").match(/class="cv-chip"/g) ?? []).length === 7 && /animation-name:cv-cyc;animation-duration:14s;animation-delay:calc\(var\(--i\) \* 2s\);animation-timing-function:ease-in-out\}/.test(css) && /animation-name:cv-hl;animation-duration:14s;/.test(css))
check("  each reading cross fades into the next over half a second (in while the last goes out)", /@keyframes cv-cyc\{0%\{opacity:0;transform:translate3d\(0,\.32em,0\)\}3\.571%,14\.286%\{opacity:1;transform:translate3d\(0,0,0\)\}17\.857%,100%\{opacity:0;transform:translate3d\(0,-\.32em,0\)\}\}/.test(css))
check("  the marker glides in the same half second, and across the loop's seam", /^0%\{transform:translate3d\(300%,0,0\)\}3\.571%,14\.286%\{transform:translate3d\(0%,0,0\)\}17\.857%,28\.571%\{transform:translate3d\(100%,0,0\)\}/.test(keyframes("cv-hl")) && /100%\{transform:translate3d\(300%,0,0\)\}$/.test(keyframes("cv-hl")))
check("the loops' shared settings never outrank a demo's own (so its timing applies)", /\.cmc-card\[data-commerce-live\] :where\(\.cdx-v,/.test(css) && !/\.cmc-card\[data-commerce-live\] :is\(/.test(css))

console.log("\n10. The reminder: what it brought back")
const rec = card("recover")
check("a Recovered tile beside the email: an amount, a rising line, how many came back", /class="cmv-got"/.test(rec) && words(rec).includes("Recovered") && words(rec).includes("13 of 41 came back") && /<svg viewBox="0 0 120 56" preserveAspectRatio="none">/.test(rec) && /\.cmv-mail\{position:absolute;left:3\.2em;width:22\.4em;/.test(css) && /\.cmv-got\{position:absolute;left:26\.6em;right:3\.2em;/.test(css))
check("  the sums: thirteen $32.00 tees, this one the thirteenth", 12 * 3200 === 38400 && 13 * 3200 === 41600 && TEE.price === "$32.00" && words(rec).includes("$384.00") && words(rec).includes("$416.00") && words(rec).includes("+$32.00"))
check("  violet, never green, here or in the checks", /stroke="#a78bfa"/.test(rec) && !/#4ade80|#30d158|#22c55e|#16a34a|green/i.test(css + rec))
check("  the line is drawn by sliding its cover away (transform), the amount steps up once paid (opacity)", onlyCompositor(keyframes("cmv-wipe")) && onlyCompositor(keyframes("cmv-n0")) && onlyCompositor(keyframes("cmv-n1")) && !/stroke-dashoffset/.test(css))
check("  the email keeps the reminder's own words", read("lib/physical/email-templates.ts").includes("Still thinking it over?") && words(rec).includes("If the payment failed or something looked off, you can pick up where you left off."))

console.log("\n11. Orbs over the four cards, barely visible")
const orb = css.match(/\.cmc-card::before\{([^}]*)\}/)?.[1] ?? ""
check("two soft lights per card, a violet under 10% and a white under 4%", (orb.match(/radial-gradient\(/g) ?? []).length === 2 && /rgba\(139,92,246,\.085\)/.test(orb) && /rgba\(255,255,255,\.035\)/.test(orb))
// Changed on purpose (landing round 10): the card's rule goes on past overflow (a container, the picture cap).
check("  still gradients: no blur, no animation, under the card's words and picture, clipped to its corners", !/filter|animation|blur/.test(orb) && /pointer-events:none/.test(orb) && /\.cmc-card\{[^}]*overflow:hidden;/.test(css) && /\.cmc-card-copy\{position:relative;z-index:1\}/.test(css))
check("  each card's in its own corner", ["tap", "currency", "recover"].every((k) => new RegExp(`\\.cmc-card\\[data-k=${k}\\]\\{--ox:`).test(css)))

console.log("\n12. Lighter on a phone")
check("no shadow and no filter on anything in the stage", !/\.cmc-pic\{[^}]*(filter|shadow)/.test(css) && !/drop-shadow/.test(css) && !/\.cmc-phone\{[^}]*0 calc\(var\(--pw\) \* \.08\)/.test(css))
check("five products on a phone, each drawn smaller; two photographs, not four", FLOATS.filter((f) => f.m).length === 5 && FLOATS.filter((f) => f.m && f.img).length === 2 && FLOATS.filter((f) => f.m).every((f) => f.m!.s <= 0.34))
check("  the box's side is not drawn on a phone (one flat layer each)", /\.cmt-box::after\{display:none\}/.test(css))
check("the product pictures are small files: under 40 KB for the three", FLOATS.filter((f) => f.img).reduce((a, f) => a + statSync(`public${f.img!.src}`).size, 0) < 40 * 1024)

console.log("\nCopy and the push suite")
const all = words(co)
check("no banned words, no em dash", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite, after round 8's", /"tests\/home-landing-r8-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-checkout\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
