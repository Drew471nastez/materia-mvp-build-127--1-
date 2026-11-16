/**
 * LANDING ROUND 14, TRACK PURPLE: the world map's carousel and the audience
 * section's sequence.
 *
 * The owner:
 *   map        "the product carousel sits a little too far left; centre it
 *              properly". The stack centres in the room between the flags
 *              and the map, one width (--cmm-col) read by both. On a phone,
 *              not full width any more: the inset card with the page's edges
 *              and its rounded corners, as before round 12.
 *   audience   an autoplaying sequence: the contacts (about 3s), then synced
 *              (people coming in from a form, a checkout and an import, each
 *              turning Synced), then an email sent to a segment, then a
 *              carousel of the email layouts in the creator's logo and
 *              colors. A step every ~5s; a tap, click or swipe stays on the
 *              visitor's choice and lets them swipe between the steps and
 *              layouts; the autoplay picks up after a pause. Every layout
 *              name and feature real. Transform and opacity only, paused off
 *              screen, cheap on a phone.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  AudienceOwnership,
  AUDIENCE_FRAMES,
  AUDIENCE_IDLE_MS,
  AUDIENCE_LAYOUTS,
  AUDIENCE_POINTS,
  AUDIENCE_STEPS,
  LAYOUT_MS,
  layoutOffset,
} from "@/components/marketing/home/audience-ownership"
import { SellEverywhereMap, SELL_EVERYWHERE_STYLES } from "@/components/marketing/home/sell-everywhere-map"
import { STARTERS, starterDraft } from "@/lib/email-campaigns/starters"
import { BUTTON_ON_CARD, CARD, contrast, textOn } from "@/lib/email-campaigns/brand"
import { describeRules, NO_RULES } from "@/lib/email-campaigns/segments"

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
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i
/** The page-wide list from the round 14 brief. */
const NEVER =
  /Nadia Brooks|The Loop|LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Maren Holt|Harbor yarn kit|enthusiasts|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind|Idris Kane|Ruben Linde|Five ways to get paid|What sellers ask us|Juno Kada|junokada|Shopify|Liquid/i

console.log("\n── the map: the carousel centred, the phone card inset ──")
{
  const css = SELL_EVERYWHERE_STYLES[0].css
  const phone = css.slice(css.indexOf("@media (max-width:639px)"))
  check("one column width, read by the map and by the flags and stack", /\.cmm-card\{--cmm-col:clamp\(500px,calc\(24vw \+ 160px\),640px\)\}/.test(css) && /\.cmm-world\{[^}]*left:var\(--cmm-col\);/.test(css))
  check("from 1024px the side spans that column and the stack centres in what the flags leave", /@media \(min-width:1024px\)\{\s*\.cmm-side\{box-sizing:border-box;width:calc\(var\(--cmm-col\) - clamp\(28px,2\.6vw,44px\)\);gap:0\}\s*\.cmm-stage\{margin:0 auto\}/.test(css))
  check("the narrow laptop keeps its column (440px, was the map's left:400px)", /@media \(min-width:1024px\) and \(max-width:1279px\)\{[^@]*\.cmm-card\{--cmm-col:440px\}/.test(css) && !/\.cmm-world\{left:400px\}/.test(css))
  /* The room either side of the stack at the widths the owner looks at: the column, less the flags' inset and the flags, less the stack (two peeks and a card). */
  const room = (vw: number, cardW: number, peek: number) => {
    const col = Math.min(640, Math.max(500, 0.24 * vw + 160))
    const inset = Math.min(44, Math.max(28, 0.026 * vw))
    return (col - inset - 48 - (cardW + 2 * peek)) / 2
  }
  const r1440 = room(1440, 204, 72)
  const r1920 = room(1920, 220, 78)
  check("at 1440 and 1920 there is room on both sides of the stack (not hugging the flags)", r1440 >= 20 && r1920 >= 20, { r1440, r1920 })
  check("on a phone: the inset card with its corners again, not the screen's width", /\.cmm-card\{border-radius:21px\}/.test(phone) && !/margin:0 calc\(var\(--home-edge/.test(phone) && !/box-shadow:none/.test(phone))
  check("on a phone the map's window keeps its inset and rounded clip (from the 1023px rule)", /@media \(max-width:1023px\)\{[^@]*\.cmm-world\{[^}]*margin:0 10px;[^}]*overflow:hidden;border-radius:16px\}/.test(css) && /\.cmm-world\{aspect-ratio:1\/0\.62\}/.test(phone))
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  check("still the heading and the copy, no banned words", html.includes("Sell to buyers") && !BANNED.test(text(html)) && !NEVER.test(text(html)))
}

console.log("\n── the audience: four steps, every one real ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  check("four steps in the owner's order: contacts, synced, an email sent, the layouts", AUDIENCE_STEPS.map((s) => s.id).join() === "contacts,synced,send,layouts")
  check("the contacts about 3s, the next two about 5s, each layout 3s", AUDIENCE_STEPS[0].ms === 3000 && AUDIENCE_STEPS[1].ms === 5000 && AUDIENCE_STEPS[2].ms === 5000 && LAYOUT_MS === 3000)
  check("one frame per step and one per layout, in order", AUDIENCE_FRAMES.length === 3 + AUDIENCE_LAYOUTS.length && AUDIENCE_FRAMES.map((f) => `${f.step}.${f.t}`).join() === "0.0,1.0,2.0,3.0,3.1,3.2,3.3,3.4")
  check("the lines beside the picture are the steps, a few words each, no banned words", AUDIENCE_POINTS.length === 4 && AUDIENCE_POINTS.every((p) => p.split(" ").length <= 6 && !BANNED.test(p)) && AUDIENCE_POINTS.every((p) => words.includes(p)), AUDIENCE_POINTS)
  check("each line is a button that names its step, pressed while it plays", (html.match(/<button type="button" class="[^"]*" data-step-btn="\d" [^>]*aria-pressed="(true|false)"/g) ?? []).length === 4 && /data-step-btn="0" data-on="" aria-pressed="true"/.test(html))
  check("four panes, each its own picture with a label, the contacts first", (html.match(/data-pane="\d"/g) ?? []).length === 4 && /data-pane="0" data-on="" role="img"/.test(html) && (html.match(/role="img" aria-label="[^"]+"/g) ?? []).length === 4)

  /* The layouts are the composer's own five. */
  const starterNames = STARTERS.map((s) => s.name).sort().join()
  check("the five layouts are the composer's five, by name", AUDIENCE_LAYOUTS.map((l) => l.name).sort().join() === starterNames && AUDIENCE_LAYOUTS.every((l) => STARTERS.some((s) => s.id === l.id && s.name === l.name)), starterNames)
  check("every layout name shows under the stack", AUDIENCE_LAYOUTS.every((l) => new RegExp(`data-nm="\\d"[^>]*>${l.name}<`).test(html)))
  const sale = starterDraft("sale", { name: "Hollow Pines", storeUrl: "https://example.com" })
  check("the sale says what the Sale starter writes: the subject, the code, the button, the line under it", sale.subject === "20% off until Sunday" && words.includes("20% off until Sunday") && words.includes("20% off everything") && words.includes("THANKYOU20") && words.includes("Shop the sale") && words.includes("One code per order."))
  const ann = starterDraft("announcement", { name: "x" })
  const prod = starterDraft("product", { name: "x" })
  check("the other layouts' buttons and headings are the starters' own", JSON.stringify(ann.blocks).includes("Find out more") && words.includes("Find out more") && JSON.stringify(prod.blocks).includes("Just released") && words.includes("Just released") && words.includes("View product") && /cta: "View product"/.test(read("lib/email-campaigns/blocks.ts")) && words.includes("This month"))
  check("each brand color is one a button can wear (WCAG, as brand.ts checks it) with white words", AUDIENCE_LAYOUTS.every((l) => contrast(l.accent, CARD) >= BUTTON_ON_CARD && textOn(l.accent) === "#ffffff"), AUDIENCE_LAYOUTS.map((l) => [l.accent, contrast(l.accent, CARD).toFixed(2)]))
  check("five brand colors, five different ones, a swatch each and one ring that slides", new Set(AUDIENCE_LAYOUTS.map((l) => l.accent)).size === 5 && (html.match(/<i style="background:#[0-9a-f]{6}"><\/i>/g) ?? []).length === 5 && /<b data-ring=""><\/b>/.test(html))
  check("the sent email's look: the logo, a white card, the name and Unsubscribe", (html.match(/Hollow Pines · Unsubscribe/g) ?? []).length === 6 && /#f4f5f7/.test(css) && /border: 1px solid #eceef1;/.test(css))
  check("the logo is drawn in each brand's color", AUDIENCE_LAYOUTS.every((l) => html.includes(`<rect width="20" height="20" rx="5" fill="${l.accent}">`)))

  /* The send and the sync, in the app's own words. */
  const status = read("components/email/compose/send-status.tsx")
  check("the send says what the send status says", /Getting ready to send/.test(status) && /Sending to \{total, plural/.test(status) && /Sent to \{out, plural/.test(status) && words.includes("Getting ready to send") && words.includes("Sending to 2,318 people") && words.includes("Sent to 2,318 people"))
  check("to a segment, in the picker's words", describeRules({ ...NO_RULES, purchased: "bought" }) === "Bought something" && words.includes("Bought something"))
  const sync = read("lib/integrations/marketing/sync-server.ts")
  check("Klaviyo syncs every 15 minutes, as the cron does", /every quarter hour per connected store/.test(sync) && words.includes("Syncs every 15 minutes"))
  const source = read("lib/contacts/contact-source.ts")
  check("the doors are Contacts' own: a OnePage form, a checkout, an import, the website", /"onepage"/.test(source) && /"import"/.test(source) && /"checkout"/.test(source) && /"website"/.test(source) && ["OnePage form", "Checkout", "Imported from a CSV file", "Website form"].every((w) => words.includes(w)) && /Email me news and offers/.test(read("lib/contacts/checkout-contact.ts")))
  check("every picture used is in the repo", ["/home/audience/ridge-hoodie-hero.webp", "/home/sell-map/trail-cap.webp"].every((p) => html.includes(p) && existsSync(join(root, "public", p))))
  check("no banned words, retired names or em dashes", !BANNED.test(words) && !NEVER.test(words) && !NEVER.test(html))
}

console.log("\n── the audience: how it moves ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const frames = [...css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n\}/g)]
  const props = frames.flatMap((m) => [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]))
  check("keyframes move transform and opacity only", frames.length >= 2 && props.every((p) => p === "transform" || p === "opacity"), [...new Set(props)])
  const transitions = [...css.matchAll(/transition:([^;]+);/g)].map((m) => m[1])
  check("transitions move transform and opacity only (no colour, no shadow)", transitions.length > 0 && transitions.every((t) => t.split(/,(?![^(]*\))/).every((x) => /^\s*(transform|opacity|none)\b/.test(x))), transitions)
  check("the lines are dimmed by opacity, not a colour change", /\.pointBtn \{[^}]*opacity: 0\.6;[^}]*transition: opacity 400ms/.test(css) && /\.pointBtn\[data-on\] \{\s*opacity: 1;/.test(css))
  check("every animation waits paused until the section is live", (css.match(/animation: [^;]*;/g) ?? []).every((a) => /paused;$|none;$|none !important;$/.test(a)) && /\.mock\[data-live\] \.pane:is\(\[data-on\], \[data-was\]\) :is\(\.syncing, \.synced, \.send, \.sendA, \.sendB, \.sendC, \.meter i\) \{\s*animation-play-state: running;/.test(css))
  check("the clock is one Web Animation on the line's hairline (transform), its end the next step", /bar\.animate\(\[\{ transform: `scaleX\(/.test(src) && /clock\.onfinish = \(\) => go\(frame \+ 1, 1, false\)/.test(src) && !/setInterval|requestAnimationFrame/.test(src))
  check("paused off screen and in a background tab: the clock pauses and plays", /else if \(on\) clock\.play\(\)\s*else clock\.pause\(\)/.test(src) && /rootMargin: LIVE_AHEAD/.test(src) && /document\.addEventListener\("visibilitychange", apply\)/.test(src))
  check("a step writes attributes, never renders", !/useState|useReducer|textContent|innerHTML|dataset\./.test(src) && /put\(p, "data-on"/.test(src) && /put\(c, "data-o"/.test(src))
  check("a tap, click or swipe holds the choice, and the autoplay comes back after a pause", /const hold = \(\) => \{\s*held = true\s*stop\(\)/.test(src) && /setTimeout\(\(\) => \{\s*held = false/.test(src) && AUDIENCE_IDLE_MS >= 5000 && AUDIENCE_IDLE_MS <= 10000)
  check("a swipe: horizontal only past 8px, the page still scrolls (pan-y), a flick or 48px turns", /Math\.abs\(mx\) < 8 \|\| Math\.abs\(mx\) < Math\.abs\(my\)/.test(src) && /touch-action: pan-y;/.test(css) && /Math\.abs\(dx\) > 48/.test(src))
  check("the swipe moves the layouts whole and a pane a little, by transform", /el\.style\.transform = `translate3d\(\$\{el === deck \? dx : dx \* 0\.4\}px,0,0\)`/.test(src) && /\.mock\[data-drag\] \.pane,\s*\.mock\[data-drag\] \.deck \{\s*transition: none;/.test(css))
  check("a layout beside the front one can be tapped to bring it forward (found by where it is, on a tap only)", /const inFront = cards\.some/.test(src) && /Math\.abs\(layoutOffset\(num\(c, "data-t"\), front\)\) === 1 && hit\(c\)/.test(src))
  check("a turn restyles the panes, not what is in them: no inherited value changes with a pane's state", !/--enter|--leave/.test(css) && !/\.pane\[data-on\] \{[^}]*pointer-events/.test(css) && !/\.pane:is\(\[data-on\], \[data-was\]\) \* \{/.test(css))
  check("the layouts' places loop: 0 in front, one each side, the rest behind", layoutOffset(0, 0) === 0 && layoutOffset(1, 0) === 1 && layoutOffset(4, 0) === -1 && layoutOffset(2, 0) === 2 && layoutOffset(3, 0) === -2 && layoutOffset(0, 4) === 1)
  check("one 3D stack: depth decides the front, not z-index", /\.deck \{[^}]*transform-style: preserve-3d;/.test(css) && !/z-index:/.test(css))
  check("the card never changes size: the head, the rows and the foot", /\.panes \{\s*position: relative;\s*height: calc\(var\(--head\) \+ var\(--rh\) \* var\(--rows\) \+ var\(--foot\)\);/.test(css))
  check("the layouts drawn at one size, scaled once on a phone", /--th: 268px;/.test(css) && /scale: var\(--fit\);/.test(css))
  check("reduced motion: no autoplay, nothing moves, the finished states shown", /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(src) && /if \(reduce \|\| held \|\| !live\) return/.test(src) && /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.mock \.pane \* \{\s*animation: none !important;[\s\S]*\.synced,\s*\.sendC \{\s*opacity: 1;/.test(css))
  check("no picture decoded async (Safari drew them blank, wave 17)", !/decoding="async"/.test(src))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 13 landing suites", /"tests\/home-landing-r13-pricing\.test\.ts",[\s\S]{0,8000}"tests\/home-landing-r14-purple\.test\.ts"/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
