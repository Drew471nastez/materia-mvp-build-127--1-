/**
 * ===========================================================================
 *  HOME, LANDING ROUND 8: THE CLOSE OF THE PAGE, AS THE OWNER ASKED
 * ===========================================================================
 *   apps      "Connect your favorite apps": extremely subtle light grey dots
 *             in two corners, circling out and fading, one canvas paused off
 *             screen; TikTok drawn as TikTok draws it (cyan and red notes,
 *             white where they overlap); Google Calendar its four colour icon;
 *             exactly the apps a store can connect today.
 *   pricing   the heading stated left aligned; Scale a deep teal, not the
 *             violet that read as pink; the pictures lifted with contrast
 *             above 1, the grain a quarter of what it was, sent at quality 90.
 *   faq       no light grey box: the section is the white sheet itself.
 *   close     the closing call's dots a little more visible, round, moving
 *             by themselves and after the mouse, 60 a second; the field fades
 *             out before the foot; the footer starts on the same black with a
 *             top edge of its own (a hairline faded at both ends).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { PLATFORM_INTEGRATION_APPS, CORNER_DOT_ALPHA, cornerDot } from "@/components/marketing/home/integrations-section"
import { TikTokMark, GoogleCalendarMark, TIKTOK_NUDGE } from "@/components/marketing/home/integration-marks"
import { PLAN_ART } from "@/components/billing/plan-cards"
import { DOT_FIELD_CSS, DOT_FIELD_TONES } from "@/components/marketing/home/dot-field"

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
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge)\b|—/i

console.log("\n── apps: the real list, true marks, corner dots ──")
{
  const src = read("components/marketing/home/integrations-section.tsx")
  const css = read("components/marketing/home/integrations-section.module.css")
  /* Every third party app a store can connect today (not Coming soon, not a Storelib feature). */
  const connectable = INTEGRATIONS.filter((i) => !i.comingSoon && !i.builtIn && i.logo).map((i) => i.name)
  const shown = PLATFORM_INTEGRATION_APPS.map((a) => a.name)
  const alias: Record<string, string> = { "Google Tag Manager": "Tag Manager" }
  const missing = connectable.filter((n) => !shown.includes(alias[n] ?? n))
  check("every app a store can connect is on the page", missing.length === 0, missing)
  const coming = INTEGRATIONS.filter((i) => i.comingSoon).map((i) => i.name)
  check("nothing marked Coming soon is shown", !shown.some((n) => coming.includes(n)), shown.filter((n) => coming.includes(n)))
  check("the others are the payments and the two the catalog connects through", ["Stripe", "Apple Pay", "Google Pay", "PostHog", "Google Calendar"].every((n) => shown.includes(n)) && shown.length === new Set(shown).size)

  const tt = renderToStaticMarkup(createElement(TikTokMark))
  check("TikTok: cyan note up and left, red down and right, white clipped to their overlap", /fill="#25F4EE"[^>]*transform="translate\(-0\.6 -0\.6\)"/.test(tt) && /fill="#FE2C55"[^>]*transform="translate\(0\.6 0\.6\)"/.test(tt) && /fill="#FFFFFF"[^>]*clip-path="url\(#tt[^"]+\)"/.test(tt) && TIKTOK_NUDGE > 0 && TIKTOK_NUDGE < 1)
  const ttIds = [renderToStaticMarkup(createElement("div", null, createElement(TikTokMark), createElement(TikTokMark)))].map((h) => [...h.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]))[0]
  check("each TikTok tile has its own clip id (every tile is drawn twice)", ttIds.length === 2 && ttIds[0] !== ttIds[1], ttIds)
  check("TikTok no longer the icon set's glyph with an echo", /mark: TikTokMark/.test(src) && !/SiTiktok|echo/.test(src) && !/echoA|echoB/.test(css))
  const cal = renderToStaticMarkup(createElement(GoogleCalendarMark))
  check("Google Calendar in its own colours", ["#4285F4", "#1967D2", "#FBBC04", "#34A853", "#188038", "#EA4335"].every((c) => cal.includes(c)) && /mark: GoogleCalendarMark/.test(src) && !/SiGooglecalendar/.test(src))

  check("corner dots: light grey, at most 16%", CORNER_DOT_ALPHA <= 0.16 && /const DOT_RGB = "24,24,27"/.test(src))
  const cloud = { ax: 1000, ay: 0, reach: 400 }
  const samples = Array.from({ length: 400 }, (_, i) => cornerDot(7, i * 97, cloud))
  check("a dot fades in and out of its trip, never beyond its cloud", samples.every((d) => d.a >= 0 && d.a <= CORNER_DOT_ALPHA && Math.hypot(d.x - cloud.ax, (d.y - cloud.ay) / 0.72) <= cloud.reach + 0.01) && samples.some((d) => d.a < 0.01) && samples.some((d) => d.a > CORNER_DOT_ALPHA * 0.3))
  const a = cornerDot(3, 1000, cloud)
  const b = cornerDot(3, 1016, cloud)
  check("a dot moves smoothly: under a pixel a frame", Math.hypot(a.x - b.x, a.y - b.y) < 1 && Math.hypot(a.x - b.x, a.y - b.y) > 0)
  // Changed on purpose (landing round 9): the canvas was redrawn on the page's thread every frame and made the heading and the rows stutter; the dots are still SVG layers now, moved by CSS.
  check("one box behind the section, no canvas, no pointer, no state", /<div className=\{s\.dots\} aria-hidden="true" data-corner-dots="">/.test(src) && !/<canvas|getContext/.test(src) && /\.dots \{\s*position: absolute;\s*inset: 0;\s*z-index: -1;[^}]*pointer-events: none;/.test(css))
  const loop = src.slice(src.indexOf("function CornerDots"), src.indexOf("One turn, landing"))
  // Changed on purpose (landing round 9): no script loop at all; the layers carry platform's .loop, which pauses them off screen and in a background tab and stills them under reduced motion.
  check("no frame loop: the layers move by CSS, paused off screen with every other loop, no layout read", !/requestAnimationFrame|getBoundingClientRect|useState|useEffect|ResizeObserver/.test(loop) && /className=\{`\$\{s\.cloud\} \$\{m\.loop\}`\}/.test(loop) && /\.cloud \{[^}]*animation: breathe 28s linear infinite;/.test(css))
}

console.log("\n── pricing: left, teal, clean pictures ──")
{
  const pricing = read("components/marketing/pricing-section.tsx")
  const cards = read("components/billing/plan-cards.tsx")
  check("the heading stated left aligned on the home page", /"story-section-heading !mx-0 !mb-10 w-full pl-\[var\(--home-head-inset\)\] !text-left"/.test(pricing))
  check("the small print starts at the same edge on the home page", /editorial \? "pl-\[var\(--home-head-inset\)\] text-left" : "text-center"/.test(pricing))
  const scale = PLAN_ART.pro
  // Changed on purpose (landing round 9): the owner did not want Scale green either, so the teal is gone (tests/home-landing-r9-close.test.ts pins the new colour).
  check("Scale is not teal, violet or pink", !/hue-rotate\(-80deg\)|#0f6b66/.test(Object.values(scale).join(" ")) && !/#7c3aed|#6d28d9|#5b21b6|#2a0f63|#1c0a45/.test(Object.values(scale).join(" ")))
  const contrast = (f: string) => Number(/contrast\(([\d.]+)\)/.exec(f)?.[1] ?? 0)
  // Changed on purpose (landing round 11): the owner found the contrast too high, so it is a hair over 1 now (1.04 to 1.05), still not below.
  check("every picture's contrast above 1, no longer dimmed below half", Object.values(PLAN_ART).every((a) => contrast(a.filter) > 1 && Number(/brightness\(([\d.]+)\)/.exec(a.filter)?.[1]) >= 0.5), Object.values(PLAN_ART).map((a) => a.filter))
  // Changed on purpose (landing round 9): the owner asked for a little more grain (0.05 to 0.08), still under half of the 0.2 it was.
  check("the grain under half of what it was", Object.values(PLAN_ART).every((a) => a.grain <= 0.08))
  check("the pictures sent at quality 90, a quality next.config serves", /quality=\{90\}/.test(cards) && /qualities: \[[^\]]*\b90\b/.test(read("next.config.mjs")))
}

console.log("\n── questions: no grey box ──")
{
  const faq = read("components/marketing/faq-section.tsx")
  // Changed on purpose (landing round 9): the home page's questions have their own branch, so the style is stated outright; and the owner's reference is one centred column, so the heading no longer starts at the inset.
  check("transparent over the grey ground globals.css gives the section", /style=\{\{ background: "transparent" \}\}/.test(faq) && /!rounded-none/.test(faq))
  check("in the page's one width, one centred column inside it", /home-wrap !max-w-\[var\(--home-max\)\] !px-\[var\(--home-edge\)\]/.test(faq) && /data-faq-column="" className="!mx-auto w-full !max-w-\[880px\] !px-0"/.test(faq) &&!/!px-\[clamp\(20px,4\.4vw,80px\)\]/.test(faq))
}

console.log("\n── the close: dots, motion, the footer's edge ──")
{
  const dots = read("components/marketing/home/dot-field.tsx")
  const cta = read("components/marketing/home/final-cta.tsx")
  check("a little more visible, only a little", DOT_FIELD_TONES.dark.rest === 0.19 && DOT_FIELD_TONES.dark.lit === 0.46 && DOT_FIELD_TONES.purple.rest === 0.12)
  check("round dots in 32 levels", /ctx\.arc\(b\[j\], b\[j \+ 1\], DOT_R, 0, Math\.PI \* 2\)/.test(dots) && /const LEVELS = 32/.test(dots) && !/ctx\.rect\(/.test(dots))
  check("moves by itself, follows the mouse while it is over the field", /const WANDER = 0\.6/.test(dots) && /goal = tone === "dark" \? WANDER/.test(dots) && /hasAim && mx > -40 && my > -40 && mx < w \+ 40 && my < h \+ 40/.test(dots))
  check("60 a second whenever it runs, paused off screen and in a hidden tab", /if \(last && t - last < 12\) return/.test(dots) && /IntersectionObserver/.test(dots) && /visibilitychange/.test(dots))
  check("the field fades out before the call's foot", /<DotField fade="close" \/>/.test(cta) && /\.dotf\[data-fade="close"\]\{-webkit-mask-image:radial-gradient\(115% 80% at 50% 38%,#000 32%,transparent 76%\)/.test(DOT_FIELD_CSS))
  check("the footer starts on the call's black and has a top edge: a hairline faded at both ends", /footer\.storelib-footer\{background-color:#050506;background-image:radial-gradient\([^;]*linear-gradient\(180deg,#050506 0%/.test(cta) && /footer\.storelib-footer::before\{content:"";background:linear-gradient\(90deg,transparent 4%,rgba\(255,255,255,\.07\) 22%,rgba\(255,255,255,\.16\) 50%/.test(cta))
  check("no banned words or em dashes in what changed", [cta, dots, read("components/marketing/faq-section.tsx"), read("components/marketing/home/integrations-section.tsx")].every((s) => !BANNED.test(s)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
