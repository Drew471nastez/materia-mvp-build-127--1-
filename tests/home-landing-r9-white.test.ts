/**
 * ===========================================================================
 *  HOME, LANDING ROUND 9: THE WHITE SHEET (AUDIENCE, AI TOOLS, EARNINGS)
 * ===========================================================================
 *   audience   "too much text ... it looks like just text", the picture "too
 *              much text and complex", and "glitchy, bumpy, stuttery" as it
 *              comes on screen. Three lines of five words (15 words, were
 *              62). The picture is the list with a new person joining at
 *              the top: one strip moved by transform on one CSS clock, a
 *              wash by opacity, no timer, no React state, a box of a fixed
 *              height, and a wait before the first move.
 *   AI tools   the line under the heading 35% shorter; under 640px the
 *              terminal is 16 lines, not 18, set a little closer.
 *   earnings   the sliders cannot be grabbed by a finger scrolling the page:
 *              the range takes no pointer; a guard decides the axis after
 *              8px, drags only sideways, and leaves the rest to the page.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership, AUDIENCE_PEOPLE, AUDIENCE_POINTS, AUDIENCE_ROWS } from "@/components/marketing/home/audience-ownership"
import { AiToolsSection, AI_TOOLS_SCRIPT, AI_TOOLS_STYLES, AI_TOOLS_PHONE_LINES } from "@/components/marketing/home/ai-tools-section"
import { EarningsCalculator, EARNINGS_STYLES, EARN_SLIDER_SLOP_PX, earnSliderAxis } from "@/components/marketing/home/earnings-calculator"

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
const count = (s: string) => s.split(/\s+/).filter(Boolean).length
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i
const GONE = /nadia brooks|the loop\b|lasalle at dusk|nails by bea|nordline coffee|charla circle|static bloom|maren holt|harbor yarn|enthusiasts|\bfans\b/i
const block = (css: string, sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] ?? ""

console.log("\n── audience: fewer words ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  /* What the owner quoted in round 9, the copy as it stood. */
  const WAS = "One list from every sign-up Forms, checkouts and free downloads all add to it. Email it from Storelib, with opens and clicks counted. Already on an email platform? Sync with Klaviyo, Omnisend, Brevo, MailerLite or Kit. Unsubscribes come back. Download every contact, any time Names, emails, tags and where each person came from, as a CSV. No lock-in: if you ever leave, your list leaves with you."
  const now = AUDIENCE_POINTS.join(" ")
  check("three points of a few words each", AUDIENCE_POINTS.length === 3 && AUDIENCE_POINTS.every((p) => count(p) <= 6), AUDIENCE_POINTS)
  check("under half the words it had", count(now) <= count(WAS) / 2, [count(now), count(WAS)])
  check("each is one line in the markup, no heading over a sentence", (html.match(/<li>[^<]+<\/li>/g) ?? []).length === 3 && !/<h3/.test(html) && !/<p[ >]/.test(html))
  check("the sentences the owner quoted are gone", !/Forms, checkouts|opens and clicks|Unsubscribes come back|No lock-in|Names, emails, tags/.test(words))
  check("the heading stays, with no subheading", html.includes("Your audience belongs to you.") && /<StoryHeading id="audience-ownership-title"[^>]*\/>\s*<ul className=\{s\.points\}>/.test(src))
  check("no banned words, em dashes or retired samples", !BANNED.test(words) && !GONE.test(words) && !GONE.test(html))
}

console.log("\n── audience: one picture, one moving idea ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  check("the chart, the export file and the scene names are gone", !/<path d="M0 88|contacts\.csv|Downloaded|Writing|last 30 days|data-scene/.test(html) && !/growthPath|AUDIENCE_SCENES|Growth\(|Export\(\)/.test(src))
  check("no email addresses, times or product names in the rows", !/@[a-z]+\.(com|me)|\b\d+m\b|\b\d+h\b|hoodie|LUT pack|Footer form/.test(words))
  check("a row is a face, a name and the door they came in by", AUDIENCE_PEOPLE.every((p) => Object.keys(p).sort().join() === "name,photo,via") && ["OnePage", "Checkout", "Free download", "Website"].every((w) => AUDIENCE_PEOPLE.some((p) => p.via === w)))
  check("at most four rows show; the strip ends on the people it began with", AUDIENCE_ROWS === 4 && (html.match(/<li class="[^"]*row[^"]*"/g) ?? []).length === AUDIENCE_PEOPLE.length + AUDIENCE_ROWS && /const STRIP = \[\.\.\.AUDIENCE_PEOPLE, \.\.\.AUDIENCE_PEOPLE\.slice\(0, AUDIENCE_ROWS\)\]/.test(src))
  check("bigger: 44px faces and 68px rows (40 and 62 on a phone, three rows)", /width=\{44\} height=\{44\}/.test(src) && /--rh: 68px;\s*--rows: 4;/.test(block(css, ".mock")) && /@media \(max-width: 639px\) \{\s*\.mock \{\s*--rh: 62px;\s*--rows: 3;/.test(css))
  check("every face has its size and decodes off the main thread", (html.match(/<img [^>]*width="44" height="44"[^>]*decoding="async"/g) ?? []).length === AUDIENCE_PEOPLE.length + AUDIENCE_ROWS && AUDIENCE_PEOPLE.every((p) => existsSync(join(root, "public/home/audience/people", `${p.photo}.webp`))))
  check("the list is a box of a fixed height that clips and contains", /height: calc\(var\(--rh\) \* var\(--rows\)\);\s*overflow: hidden;\s*contain: layout paint;/.test(block(css, ".window")) && /height: var\(--rh\);/.test(block(css, ".row")))
  check("Export CSV and Synced with stay, the five marks without names under them", words.includes("Export CSV") && words.includes("Synced with") && (html.match(/class="[^"]*mark[^"]*"><svg/g) ?? []).length === 5 && !/>(Klaviyo|Omnisend|Brevo|MailerLite|Kit)</.test(html))
  check("the picture's label still names the platforms and the doors", /aria-label="Contacts: 18,240 people, synced with Klaviyo, Omnisend, Brevo, MailerLite and Kit[^"]*OnePage[^"]*checkout[^"]*free download[^"]*website\."/.test(html))
}

console.log("\n── audience: smooth as it comes on screen ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const frames = [...css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n\}/g)]
  const props = frames.flatMap((m) => [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]))
  check("two keyframes, transform and opacity only", frames.length === 2 && frames.map((m) => m[1]).join() === "aud-roll,aud-fresh" && props.every((p) => p === "transform" || p === "opacity"), [...new Set(props)])
  check("nothing transitions: no cross fade, no cover, no hairline filling", !/transition/.test(css))
  check("the strip comes down a row at a time and ends where it began", /0% \{\s*transform: translate3d\(0, calc\(var\(--rh\) \* -5\), 0\);/.test(css) && /85%,\s*100% \{\s*transform: translate3d\(0, 0, 0\);/.test(css) && /transform: translate3d\(0, calc\(var\(--rh\) \* -5\), 0\);\s*\/\*[^*]*\*\/\s*animation: aud-roll 16s/.test(block(css, ".track")))
  check("it waits before the first move, so it never starts in the frames the section arrives in", /animation: aud-roll 16s cubic-bezier\(0\.3, 0, 0\.1, 1\) 1\.4s infinite both paused;/.test(css) && /animation: aud-fresh 3\.2s linear 1\.4s infinite both paused;/.test(css))
  check("paused until the card is on screen and the tab visible", /\.mock\[data-live\] \.track,\s*\.mock\[data-live\] \.fresh \{\s*animation-play-state: running;/.test(css) && /seen && !document\.hidden\) el\.setAttribute\("data-live", ""\)/.test(src) && /threshold: 0\.35/.test(src))
  check("no timer, no React state, no render when it comes on screen", !/setInterval|setTimeout|requestAnimationFrame|useState|usePlatformSection|startTransition/.test(src))
  check("nothing is written into the page after the first draw", !/textContent|innerHTML|dataset\.|\.style\./.test(src))
  check("still under reduced motion", /@media \(prefers-reduced-motion: reduce\) \{\s*\.track,\s*\.fresh \{\s*animation: none;/.test(css))
  check("no blur and no big shadow layer", !/filter|backdrop/.test(css) && /0 18px 36px -28px/.test(block(css, ".mock")))
  check("in the page's one width, the words set in", /className=\{`\$\{s\.grid\} home-wrap`\}/.test(src) && /padding-left: var\(--home-head-inset, 0px\);/.test(block(css, ".words")))
}

console.log("\n── AI tools: a shorter line, a shorter terminal on a phone ──")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("")
  const html = renderToStaticMarkup(createElement(AiToolsSection))
  const lede = html.match(/<p class="ait-lede">([^<]+)<\/p>/)?.[1] ?? ""
  const WAS = "Connect Claude Code, Codex or Cursor to your site and build with them. Every change waits as a draft until you publish."
  check("the line is at least 35% shorter, in letters and in words", lede.length <= WAS.length * 0.65 && count(lede) <= count(WAS) * 0.65, [lede.length, WAS.length, count(lede), count(WAS)])
  check("and still true to a connection: the three tools, drafts, the creator publishes", /Claude Code, Codex or Cursor/.test(lede) && /drafts/.test(lede) && /you publish/.test(lede) && !BANNED.test(lede), lede)
  const phone = css.match(/@media \(max-width:639px\)\{([\s\S]*?)\n\}\n@media/)?.[1] ?? ""
  check("under 640px two lines are left out: 16, not 18", AI_TOOLS_SCRIPT.length === 18 && AI_TOOLS_PHONE_LINES === 16 && (html.match(/ ait-nophone"/g) ?? []).length === 2 && /\.ait-nophone\{display:none\}/.test(phone))
  check("a call and its answer, never one without the other", AI_TOOLS_SCRIPT.filter((l) => l.phone === false).map((l) => l.kind).join() === "call,ok")
  check("its lines sit closer there", /\.ait-body\{padding:12px 14px 14px;font-size:11\.5px;line-height:1\.62\}/.test(phone) && /\.ait-line\{min-height:1\.62em\}/.test(phone))
  const last = AI_TOOLS_SCRIPT.map((l) => l.phone === false).lastIndexOf(true)
  check("the lines after the gap come 1.2s earlier there, on their own keyframes", AI_TOOLS_SCRIPT.every((_, i) => (i > last) === new RegExp(`\\.ait-l${i}\\{animation-name:ait-m${i}\\}`).test(phone)) && /@keyframes ait-m12\{0%,47\.50%\{/.test(phone), phone.slice(0, 300))
  check("desktop keeps all 18 lines and its own timing", /@keyframes ait-l12\{0%,55\.00%\{/.test(css) && !/ait-nophone\{display:none\}/.test(css.replace(phone, "")))
  check("every keyframe still moves transform and opacity only", [...css.matchAll(/@keyframes ait-[\w-]+\{([\s\S]*?\})\}/g)].every((m) => !/(width|height|top|left|margin|padding|filter|clip|background)\s*:/.test(m[1])))
}

console.log("\n── earnings: a scrolling finger cannot grab a slider ──")
{
  const src = read(`${DIR}/earnings-calculator.tsx`)
  const css = EARNINGS_STYLES.map((s) => s.css).join("")
  const html = renderToStaticMarkup(createElement(EarningsCalculator))
  check("both sliders sit in the guard", (html.match(/<div class="cme-slide" data-earn-slider="">/g) ?? []).length === 2 && (html.match(/type="range"/g) ?? []).length === 2)
  check("the range takes no pointer; the guard lets the page pan up and down", /\.cme-slide\{touch-action:pan-y;[^}]*\}/.test(css) && /\.cme-slide \.cmk-range\{pointer-events:none\}/.test(css))
  check("the range stays a native one for the keyboard and screen readers", /<input id="[^"]*" type="range"[^>]*aria-valuetext="\$19"/.test(html) && /<label for=/.test(html))
  check("the axis is decided after 8px", EARN_SLIDER_SLOP_PX === 8 && earnSliderAxis(5, 6) === "wait" && earnSliderAxis(-7, 7) === "wait")
  check("mostly sideways drags", earnSliderAxis(9, 2) === "drag" && earnSliderAxis(-40, 30) === "drag")
  check("mostly up or down scrolls, and so does a tie", earnSliderAxis(2, -9) === "page" && earnSliderAxis(30, 60) === "page" && earnSliderAxis(12, 12) === "page" && earnSliderAxis(0, 200) === "page")
  check("a finger landing changes nothing; capture only once it drags", /if \(e\.pointerType === "touch"\) return\n/.test(src) && /g\.mode = "drag"\n\s*g\.x = e\.clientX\n\s*e\.currentTarget\.setPointerCapture\(e\.pointerId\)/.test(src))
  check("a drag moves the thumb from where it stood, never a jump", /set\(g\.from \+ \(\(e\.clientX - g\.x\) \/ Math\.max\(1, g\.width - THUMB_PX\)\) \* \(max - min\)\)/.test(src))
  check("a scroll drops the gesture with the value as it was", /if \(axis === "page"\) \{\s*gesture\.current = null\s*return\s*\}/.test(src))
  check("a tap is the browser's click, only after a touch that never moved", /if \(!touched\.current \|\| !g \|\| g\.mode !== "wait"\) return/.test(src) && /onClick=\{click\}/.test(src))
  check("a mouse takes the thumb at once and focuses the range", /g\.mode = "mouse"\s*e\.currentTarget\.setPointerCapture\(e\.pointerId\)\s*hit\.range\.focus\(\{ preventScroll: true \}\)/.test(src))
  check("measured once, when the pointer lands, not while it moves", (src.match(/getBoundingClientRect/g) ?? []).length === 1 && !/getBoundingClientRect/.test(src.match(/const move = \(e: ReactPointerEvent[\s\S]*?const end = /)?.[0] ?? "x getBoundingClientRect"))
  check("the calculator is as it was: its heading and its default month", html.includes("See what your work could earn.") && html.includes("$2,850"))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 8 suites", /"tests\/home-landing-r8-[\w-]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-white\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
