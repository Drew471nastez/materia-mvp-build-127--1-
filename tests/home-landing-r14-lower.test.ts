/**
 * HOME, LANDING ROUND 14, THE LOWER PAGE (track 6).
 *
 * The owner, after round 13:
 *   how       each picture covers its whole card (no outlined frame inside
 *             it), the cards an extremely subtle depth; the same shape and
 *             look on a phone as on a laptop. Take tips: not Ruben Linde,
 *             another creator with a real cover. Understand your business:
 *             the dashboard covers the card, live figures kept. Use your own
 *             domain: /pricing's domain reel, imported, filling the card.
 *             The dots a little more visible, toward the right corner,
 *             subtle on the left.
 *   close     the dots a little more visible, the pointer smoother and
 *             cleaner, the section a bit taller on a phone.
 *   footer    the white S a little smaller in the dark square.
 *
 * Measured in Chromium (scripts in the round's scratchpad): the cards 0.8 and
 * 1.6 to 1.667 wide for their height at 390, 1440 and 1920, every picture
 * flush with its card on all four sides.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_DASH_FIT, HOW_DOMAIN, HOW_DOMAIN_STYLE, HOW_IT_WORKS_STYLES, HOW_SHOP } from "@/components/marketing/home/how-it-works"
import { DOMAIN_CSS, DOMAIN_NAME } from "@/app/(storelib)/(marketing)/pricing/domain-reel"
import { DOT_FIELD_CALM, DOT_FIELD_CONFIGS, DOT_FIELD_TONES, HOW_FIELD, HOW_FIELD_LEFT, howFieldFade } from "@/components/marketing/home/dot-field-engine"
import { StorelibLogo, STORELIB_SOLID, STORELIB_SOLID_S } from "@/components/brand/storelib-logo"
import { FinalCta } from "@/components/marketing/home/final-cta"
import { cleanHostname, hostnameProblem } from "@/lib/custom-domains/hostname"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const src = strip(read("components/marketing/home/how-it-works.tsx"))
const text = how.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")
const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""

console.log("\n1. The cards: the picture is the card, a faint depth, one shape everywhere")
check("no grey ground: the card is white with an 18px corner, clipped", /background:#fff/.test(rule(".cmh-stage")) && /border-radius:18px/.test(rule(".cmh-stage")) && /overflow:hidden/.test(rule(".cmh-stage")) && !/\.cmh-stage\[data-ground=\w+\]\{background/.test(css))
{
  const shadow = /box-shadow:([^;}]+)/.exec(rule(".cmh-stage"))?.[1] ?? ""
  const alphas = [...shadow.matchAll(/rgba\(24,24,27,(\.\d+)\)/g)].map((m) => Number(m[1]))
  check("an extremely subtle depth: a hairline and a soft low shadow, no alpha over 0.16", alphas.length === 3 && alphas.every((a) => a <= 0.16) && /0 0 0 1px/.test(shadow), shadow)
}
check("one shape on every screen: narrow 4:5, wide 5:3; from 1100px the row is a narrow card's 4:5 height", /aspect-ratio:4\/5/.test(rule(".cmh-stage")) && /\.cmh-wide \.cmh-stage\{aspect-ratio:5\/3\}/.test(css) && css.includes("height:calc((100cqw - 2 * var(--cmh-gap)) / 4 * 1.25)") && /container-type:inline-size;--cmh-gap:clamp\(16px,1\.5vw,28px\)/.test(css))
check("no phone only shape any more (round 13's 16:10 dashboard stage, the 440 and 360px phone heights)", !/aspect-ratio:16\/10/.test(css) && !/height:440px|height:360px/.test(css))
check("no outlined frame inside a card: no tip page inset, no dashboard corner or shadow, no store front", /inset:0/.test(rule(".cmh-tp-page")) && !/border-radius|box-shadow/.test(rule(".cmh-tp-page")) && !/border-radius|box-shadow/.test(rule(".cmh-db")) && !how.includes("cmh-dm-"))

console.log("\n2. Take tips: Ines Duarte, edge to edge")
check("a different creator: Ines Duarte, no Ruben Linde anywhere", HOW_SHOP.creator === "Ines Duarte" && text.includes("Ines Duarte") && text.includes("Good morning, Ines") && !/Ruben|Linde/.test(how + src))
/* Changed on purpose (landing round 15): her cover is drawn in reds, not a photograph; her face stays a file. */
check("her cover and her face are local webp files under 30 KB, drawn lazily", [HOW_SHOP.avatar].every((p) => existsSync(`public${p}`) && statSync(`public${p}`).size < 30 * 1024 && how.includes(`src="${p}"`)) && !existsSync("public/home/how/linde-turning.webp") && !existsSync("public/home/how/linde-avatar.webp"))
check("the page is sized by the card's width alone, so a phone shows what a laptop does", /font-size:3\.5cqw/.test(rule(".cmh-tp")) && /left:0;right:0;bottom:0/.test(rule(".cmh-tp-sheet")))

console.log("\n3. Understand your business: covering its card")
check("laid out at the computer's width, scaled from the card's top left by one transform, as tall as the card at that scale", /width:var\(--db-w,1040px\);height:var\(--db-h,650px\)/.test(rule(".cmh-db-fit")) && /transform-origin:0 0;transform:scale\(var\(--db-s,\.6\)\)/.test(rule(".cmh-db-fit")) && /const s = sw \/ w/.test(src) && /setProperty\("--db-h", `\$\{\(sh \/ s\)/.test(src))
check("the chart takes the height left over, so nothing is cut and nothing is empty", /flex:1/.test(rule(".cmh-db-plot")) && /flex:1/.test(rule(".cmh-db-chart")) && /flex:1/.test(rule(".cmh-db-card")) && /height:100%/.test(rule(".cmh-db")))
{
  /* The cards measured in Chromium at 390, 1440 and 1920: the dashboard layout width, its scale and its height. */
  const fit = (sw: number, sh: number) => {
    const w = Math.round(Math.min(HOW_DASH_FIT.max, Math.max(HOW_DASH_FIT.min, sw * HOW_DASH_FIT.perStage)))
    const s = sw / w
    return { w, s, h: sh / s }
  }
  const cases = [[349.8, 209.9], [624.3, 390.1], [848, 530]].map(([sw, sh]) => ({ sw, sh, ...fit(sw, sh) }))
  check("never shorter than the dashboard's own content (about 525px with the rail), never laid out narrower than 1040", cases.every((c) => c.h >= 600 && c.w >= 1040), cases)
}
check("still the live figures: odometers and the ticker", /data-odo="visitors"/.test(how) && /data-odo="revenue"/.test(how) && /function useDashLive/.test(src))

console.log("\n4. Use your own domain: /pricing's reel, filling the card")
check("imported from /pricing, not copied", /import \{ DomainReel, DOMAIN_CSS, DOMAIN_NAME \} from "@\/app\/\(storelib\)\/\(marketing\)\/pricing\/domain-reel"/.test(read("components/marketing/home/how-it-works.tsx")) && how.includes('class="ev-vis pz-d"') && !/@keyframes pz-reel/.test(css))
check("its own sheet drawn beside the section's", HOW_DOMAIN_STYLE.css === DOMAIN_CSS && /<style href=\{HOW_DOMAIN_STYLE\.href\} precedence="default">/.test(src))
check("it fills the card, and its loops stop with the card off screen and under reduced motion", /position:absolute;inset:0;height:auto;border-radius:0/.test(rule(".cmh-stage .pz-d")) && css.includes(".cmh-card:not([data-commerce-live]) .ev-loop{animation-play-state:paused}") && /\.cmh-stage \.ev-loop\{animation:none!important\}/.test(css))
check("the address it starts on is one Storelib accepts", HOW_DOMAIN.host === `${DOMAIN_NAME}.com` && hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null)

console.log("\n5. The dots behind the heading: a little more, toward the right")
check("the ink a little stronger: 0.18 (was 0.15)", HOW_FIELD.rest === 0.18 && DOT_FIELD_CONFIGS.how.rest === 0.18)
{
  const f = (x: number) => howFieldFade(x, 40, 1440, 640)
  check("subtle on the left, full toward the right corner, smooth between", HOW_FIELD_LEFT === 0.25 && f(1180) > 0.95 && f(200) < 0.35 && f(720) > f(360) && f(360) > f(200))
}
check("its light wanders on the right, toward the top", DOT_FIELD_CONFIGS.how.pathX[0] >= 0.6 && DOT_FIELD_CONFIGS.how.pathY[0] <= 0.32)
check("the purple sheet unchanged", JSON.stringify(DOT_FIELD_TONES.purple) === JSON.stringify({ rgb: "255,255,255", rest: 0.17, lit: 0.4, r: 0.95, ride: 0.5 }) && DOT_FIELD_CONFIGS.purple.radius === 180 && DOT_FIELD_CONFIGS.purple.follow === 0.075 && !DOT_FIELD_CONFIGS.purple.soft)

console.log("\n6. The closing call")
check("the dots a little more visible: 0.28 and 0.56 (was 0.24 and 0.5)", DOT_FIELD_TONES.dark.rest === 0.28 && DOT_FIELD_TONES.dark.lit === 0.56)
{
  const engine = strip(read("components/marketing/home/dot-field-engine.ts"))
  check("a smoother, cleaner pointer: a soft light with no point (1 - d²/R²)², a slower glide, a smaller parting that opens from the middle", DOT_FIELD_CONFIGS.dark.soft && DOT_FIELD_CALM.follow < 0.085 && DOT_FIELD_CALM.part < 4 && DOT_FIELD_CALM.radius > 180 && /const q = 1 - d2 \/ r2/.test(engine) && /push = c\.part \* k \* Math\.min\(1, dd \/ \(c\.radius \* 0\.4\)\)/.test(engine))
  check("the worker string is up to date", /\.soft\b/.test(read("components/marketing/home/dot-field-worker-source.ts")))
}
{
  const cta = read("components/marketing/home/final-cta.tsx")
  check("a bit taller on a phone: 108px above and 100px below (was 76 and 68)", /@media\(max-width:639px\)\{\s*\.fcta\{padding-top:108px;padding-bottom:100px\}/.test(cta))
  check("the email field stays", /class="fcta-form"/.test(renderToStaticMarkup(createElement(FinalCta))))
}

console.log("\n7. The footer's logo: the S a little smaller")
{
  const mark = renderToStaticMarkup(createElement(StorelibLogo, { size: 40, variant: "solid" }))
  check("the S's box at 0.9 of the picture's, centred", STORELIB_SOLID.letter === 0.9 && STORELIB_SOLID_S.w === 102.06 && STORELIB_SOLID_S.h === 123.12 && Math.abs(STORELIB_SOLID_S.x * 2 + STORELIB_SOLID_S.w - 200) < 0.05 && Math.abs(STORELIB_SOLID_S.y * 2 + STORELIB_SOLID_S.h - 200) < 0.05)
  check("drawn that way", mark.includes(`x="${STORELIB_SOLID_S.x}" y="${STORELIB_SOLID_S.y}" width="${STORELIB_SOLID_S.w}" height="${STORELIB_SOLID_S.h}"`))
}

console.log("\nCopy and registration")
check("no em dash, none of the banned words, none of the never list", !/—/.test(text) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text) && !/Ruben Linde|Nadia Brooks|Mara Lind|Fernlyn/.test(text))
check("registered after the round 13 suites", /"tests\/home-landing-r13-[\w-]+\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r14-lower\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\nhome-landing-r14-lower: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
