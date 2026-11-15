/**
 * ===========================================================================
 *  HOME, LANDING ROUND 4: THE SHOWCASE, "MAKE THE WORK" AND THE POSSIBILITIES
 * ===========================================================================
 * components/marketing/build-showcase.tsx and use-showcase-motion.ts,
 * components/marketing/home/everything-in-one-place.tsx and
 * components/marketing/product-marquee.tsx.
 *
 * The owner, round 4:
 *   - The showcase under the hero keeps Pinch Grip Club; no yoga "for real
 *     mornings", no Hemi Walker the surf coach, no Lowtide beats, nothing
 *     about sourdough; Gia Romano and Nails by Bea made again, truer.
 *   - A short swipe with the mouse or a finger is a whole step.
 *   - Make the work: a clearer heading in the same two tones; colourful
 *     gradients that cross fade behind the product card, which still leans;
 *     no Wheel Throwing course, no Saturday Run Club; a real looking
 *     community card.
 *   - Build a store that looks like you: wider cards (about 2.3 a row),
 *     whole, a mix of stores, OnePages with share and subscribe, and a
 *     community on a phone; it drifts and can be dragged; nothing inside is
 *     hoverable or clickable.
 *   - Real support: the UI of before, no From buyers / Storelib switch, no
 *     payout or bank request.
 *   - Unlimited possibilities: a hovered pill's shadow is not cut, two rows.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SHOWCASE_EXAMPLES, SHOWCASE_HEADING } from "@/components/marketing/build-showcase"
import { SHOWCASE_RAIL } from "@/components/marketing/use-showcase-motion"
import { chooseSwipeTarget, SHOWCASE_MOTION } from "@/lib/ui/rail-motion"
import {
  EverythingInOnePlace,
  EVERYTHING_HEADING,
  EVERYTHING_SLIDES,
  EVERYTHING_STORES,
  EVERYTHING_STYLES,
  EVERYTHING_SUPPORT,
} from "@/components/marketing/home/everything-in-one-place"
import { MARQUEE_ROWS } from "@/components/marketing/product-marquee"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector}{`)
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at) + 1)
}
const showcaseSrc = read("components/marketing/build-showcase.tsx")
const evSrc = read("components/marketing/home/everything-in-one-place.tsx")
const marqueeSrc = read("components/marketing/product-marquee.tsx")
const everything = renderToStaticMarkup(createElement(EverythingInOnePlace))
const evCss = EVERYTHING_STYLES[0]?.css ?? ""
const BANNED = /weeknight pasta|heavyweight|sourdough|golden hour|wheel throwing|drawing basics|saturday run club|dust & tape|dust &amp; tape|elena ruiz|real mornings|hemi walker|surf coach|lowtide|payout|bank/i

console.log("\n── The showcase under the hero ──")
const all = SHOWCASE_EXAMPLES.map((e) => `${e.src} ${e.label} ${e.alt}`).join(" ")
check("twelve pictures, four groups of a wide, a OnePage and a wide", SHOWCASE_EXAMPLES.length === 12 && SHOWCASE_EXAMPLES.every((e, i) => e.format === (i % 3 === 1 ? "portrait" : "wide")))
check("Pinch Grip Club stays", /pinchgrip/.test(all))
check("no yoga, surf coach, sample packs or sourdough", !/stillwater|yoga|hemi|surf|lowtide|slowrise|sourdough/i.test(all))
check("Gia Romano and Nails by Bea are there, and Gia's ebook is not Weeknight Pasta", /a-gia\.webp/.test(all) && /a-bea\.webp/.test(all) && !/weeknight/i.test(all + showcaseSrc))
check("the new creators are there: Kai Moreno's prints, Northline Coffee, The Long Draft, Charla Circle", ["kai", "northline", "draft", "charla"].every((k) => all.includes(`/home/showcase/a-${k}.webp`)))
check("every picture exists at its size's budget", SHOWCASE_EXAMPLES.every((e) => existsSync(join(root, "public", e.src)) && statSync(join(root, "public", e.src)).size < 120_000))
check("the retired pictures are gone", ["stillwater", "hemi", "lowtide", "slowrise"].every((k) => !existsSync(join(root, `public/home/showcase/a-${k}.webp`))))
check("captions are three words at most", SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3))
check("the heading is unchanged", SHOWCASE_HEADING === "Build your page, sell your products, and manage everything in one place.")

console.log("\n── A short swipe is a whole step ──")
check("the showcase's swipe distance is 10 to 14px (it was 20 to 40px)", SHOWCASE_RAIL.swipeDistanceMin === 10 && SHOWCASE_RAIL.swipeDistanceMax === 14 && SHOWCASE_RAIL.swipeDistanceRatio <= 0.06)
check("a release at 110px/s is a flick (it was 180px/s)", SHOWCASE_RAIL.swipeVelocity === 110)
check("the shared tuning is untouched for the other rails", SHOWCASE_MOTION.swipeDistanceMin === 20 && SHOWCASE_MOTION.swipeDistanceMax === 40 && SHOWCASE_MOTION.swipeVelocity === 180)
check("the press still waits 6px before it is a drag, so a finger going down the page scrolls it", SHOWCASE_RAIL.dragThreshold === 6)
{
  const desktop = [0, 1316, 2632, 3948]
  const phone = [0, 292, 398, 690, 796]
  check("desktop: a slow 16px pull goes to the next group", chooseSwipeTarget(0, 16, 0, desktop, 0, SHOWCASE_RAIL) === 1316)
  check("desktop: an 8px nudge settles back", chooseSwipeTarget(0, 8, 0, desktop, 0, SHOWCASE_RAIL) === 0)
  check("phone: a short flick at 150px/s goes to the next card", chooseSwipeTarget(0, 9, 150, phone, 0, SHOWCASE_RAIL) === 292)
  check("phone: a slow 15px drag goes to the next card", chooseSwipeTarget(0, 15, 0, phone, 0, SHOWCASE_RAIL) === 292)
  check("the glide and momentum are kept", !!SHOWCASE_RAIL.glideSettle && SHOWCASE_RAIL.swipeMaxSteps === 3)
}

console.log("\n── Make the work: the heading ──")
/* Changed on purpose (landing round 5): the owner called "Sell anything, anywhere. Support included." really bad; the new line is pinned in tests/home-landing-r5-top. */
check("a specific line in the two tones", EVERYTHING_HEADING.lead === "Sell what you make." && EVERYTHING_HEADING.rest === "Get paid worldwide." && /<span class="ev-h-mute">Get paid worldwide\.<\/span>/.test(everything))

console.log("\n── Make the work: the product card ──")
check("merch, digital, course, community", EVERYTHING_SLIDES.map((s) => s.tab).join() === "Merch,Digital,Course,Community")
/* Changed on purpose (landing round 6): the pack is "Cine Tones LUT Pack", no count (the owner). */
check("the merch and the LUT pack are kept", EVERYTHING_SLIDES[0].name === "Midnight Studio Tee" && EVERYTHING_SLIDES[1].name === "Cine Tones LUT Pack")
/* Changed on purpose (landing round 5): the owner found the knitting course "really bad"; a home Pilates course in its place. */
/* Changed on purpose (landing round 7): the owner wanted the book club gone for a modern community: the AI Builders Masterclass. */
check("a new course and a new community", EVERYTHING_SLIDES[2].name === "28 Day Mat Pilates" && EVERYTHING_SLIDES[3].name === "AI Builders Masterclass")
check("every product's numbers add up", [32 * 214 === 6848, 29 * 386 === 11194, 39 * 412 === 16068, 29 * 860 === 24940].every(Boolean) && EVERYTHING_SLIDES[2].stats[2][1] === "$16,068.00" && EVERYTHING_SLIDES[3].stats[2][1] === "$24,940.00")
/* Changed on purpose (landing round 7): the masterclass card: the next live session and the member count in place of Members, Online and Admins. */
check("the community is a community card: cover, name, address, the next session, faces and members", ["ev-cm-cover", "ev-cm-name", "ev-cm-url", "ev-cm-next", "ev-cm-faces"].every((c) => everything.includes(`class="${c}"`)) && /860 members/.test(everything) && /Live Thursday/.test(everything))
const grounds = [0, 1, 2, 3].map((i) => rule(evCss, `.ev-p-bg${i}`))
check("four colourful gradient grounds, each its own", grounds.every((g) => /radial-gradient/.test(g) && /linear-gradient/.test(g)) && new Set(grounds).size === 4)
check("they cross fade (opacity) and drift slowly (a transform), nothing else", /\.ev-p-bg\{[^}]*transition:opacity 1\.4s/.test(evCss) && /@keyframes ev-bg-drift\{from\{transform:[^}]*\}to\{transform:[^}]*\}\}/.test(evCss))
check("only the ground on show drifts, and only while the section is live", /\.ev-p-bg\{animation-play-state:paused\}/.test(evCss) && /\.ev\[data-platform-live="true"\] \.ev-p-bg\[data-on\]\{animation-play-state:running\}/.test(evCss))
check("reduced motion stops the drift", /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.ev-p-bg\{animation:none !important\}/.test(evCss))
check("the card still leans under the mouse", /usePressTilt\(card\)/.test(evSrc) && /data-press-tilt=""/.test(everything))
/* Changed on purpose (landing round 5): the course photo is pilates.webp (the knitting course is gone). */
/* Changed on purpose (landing round 7): the community picture is ai-builders.webp. */
check("the course and community pictures exist and are small", ["pilates", "ai-builders"].every((k) => statSync(join(root, `public/home/everything/${k}.webp`)).size < 60_000))

console.log("\n── Make the work: Build a store that looks like you ──")
/* Changed on purpose (landing round 6): the owner's reference picture replaced the creator pages, OnePages and community in the strip with merch stores and creators' link pages taking turns, tall cards that run off the picture's foot (tests/home-landing-r6-everything pins them). */
check("merch stores and link pages", EVERYTHING_STORES.filter((s) => s.kind === "merch").length >= 3 && EVERYTHING_STORES.filter((s) => s.kind === "link").length >= 3)
check("every merch store shows four pieces, each with a name and a price", EVERYTHING_STORES.every((s) => s.kind !== "merch" || (s.products.length === 4 && s.products.every((p) => p.name && /^\$\d+$/.test(p.price)))))
check("no wheel throwing, no sourdough in the stores", !BANNED.test(JSON.stringify(EVERYTHING_STORES)))
/* Changed on purpose (landing round 7): the cap grows with a taller picture (58% of its height once over 270px). */
check("every card is drawn at a phone's 390px, its width following the picture's, as tall as the picture and set a fixed inset down", /--card-w:clamp\(170px,56cqw,max\(270px,58cqh\)\)/.test(rule(evCss, ".ev-s")) && /container-type:size/.test(rule(evCss, ".ev-s")) && /top:var\(--top\)/.test(rule(evCss, ".ev-s-track")) && /height:100cqh/.test(rule(evCss, ".ev-s-track")) && /height:100%/.test(rule(evCss, ".ev-st")))
check("each card is rounded, and runs off the picture's foot as in the reference", /border-radius:calc\(30 \* var\(--r\)\)/.test(rule(evCss, ".ev-st")))
check("the strip can be dragged: it takes the pointer, leaves vertical swipes to the page", /cursor:grab/.test(rule(evCss, ".ev-s")) && /touch-action:pan-y/.test(rule(evCss, ".ev-s")) && /addEventListener\("pointerdown", down\)/.test(evSrc) && /setPointerCapture/.test(evSrc))
check("the cards inside take no pointer, and there is no hover anywhere in the strip", /pointer-events:none/.test(rule(evCss, ".ev-s-slot")) && !/\.ev-(s|st|op)[\w-]*[^{}]*:hover/.test(evCss))
/* Changed on purpose (landing round 8): each page wraps round on its own, one compositor loop a page from one offset on the document's clock (tests/home-landing-r8-everything). */
check("it drifts as a Web Animation, paused off screen and in a hidden tab", /slot\.animate\(/.test(evSrc) && /else stopDrift\(\)/.test(evSrc) && /visibilitychange/.test(evSrc) && /<Storefronts live=\{live\} \/>/.test(evSrc))
/* Changed on purpose (landing round 8): each page wraps round on its own, one compositor loop a page from one offset on the document's clock (tests/home-landing-r8-everything). */
check("a release glides from the hand's speed back to the drift", /Math\.exp\(-\(now - g0\) \/ 380\)/.test(evSrc))
/* Changed on purpose (landing round 8): link pages carry their creator's photo, and the strip has a OnePage of a third kind (a profile with one photo). */
check("every picture in the strip exists and is small", EVERYTHING_STORES.flatMap((s) => (s.kind === "merch" ? s.products.map((p) => p.src) : s.kind === "link" ? [s.ground, s.avatar, ...s.products] : [s.photo])).every((u) => existsSync(join(root, "public", u)) && statSync(join(root, "public", u)).size < 120_000))
/* Changed on purpose (landing round 8): a seventh page, a profile OnePage, so the pages no longer strictly take turns; no two stores ever stand side by side. */
check("a store, then a link page, taking turns", EVERYTHING_STORES.every((item, i) => item.kind !== "merch" || EVERYTHING_STORES[(i + 1) % EVERYTHING_STORES.length].kind !== "merch"))

console.log("\n── Make the work: Real support ──")
check("no inbox switch: no From buyers / Storelib buttons", !/ev-c-tabs|Support inboxes|From buyers<\/span>/.test(everything) && !/<button[^>]*ev-c-tab/.test(everything))
check("the card of before: a thread with photos and Storelib's mark, the other side typing", /class="ev-c-thread ev-loop"/.test(everything) && /class="ev-c-bubble ev-c-light"/.test(everything) && /class="ev-c-typing ev-loop"/.test(everything) && /StorelibLogo size=\{96\}/.test(evSrc))
check("three true requests, none about a payout or a bank", EVERYTHING_SUPPORT.length === 3 && !/payout|bank|\$\d/i.test(JSON.stringify(EVERYTHING_SUPPORT)))
check("the photos exist", ["av-creator", "av-buyer"].every((k) => existsSync(join(root, `public/home/everything/${k}.webp`))))
check("one clock for all three, a third apart, paused off screen", /animation-delay:calc\(var\(--k,0\) \* 10s\)/.test(evCss) && /\.ev\[data-platform-live="false"\] \.ev-loop/.test(evCss))

console.log("\n── Unlimited possibilities ──")
check("two rows", MARQUEE_ROWS.length === 2)
check("a row clips sideways only, so a photo's shadow is not cut", /\.um-row\{[^}]*overflow:hidden;overflow:clip visible/.test(marqueeSrc))
/* Changed on purpose (landing round 7): no pills any more; a row has just enough room for a diamond's corners, and its fades reach past it by the shadow's room. */
check("and has room for a diamond's corners, its fades past its edges", /\.um-row\{[^}]*padding-block:calc\(var\(--pic\) \* \.1\)\}/.test(marqueeSrc) && /\.um-row::before,\.um-row::after\{[^}]*top:-30px;bottom:-30px/.test(marqueeSrc))

console.log("\n── The words ──")
const words = [EVERYTHING_HEADING.lead, EVERYTHING_HEADING.rest, ...EVERYTHING_SLIDES.map((s) => s.name), JSON.stringify(EVERYTHING_SUPPORT), JSON.stringify(EVERYTHING_STORES), all].join(" ")
check("none of this round's banned examples", !BANNED.test(words), words.match(BANNED))
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income|fans?)\b/i.test(words))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
