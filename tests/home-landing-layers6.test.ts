/**
 * HOME PAGE, LANDING ROUND 11 PERF (layers and animations): one safety net for loops off screen, and fewer compositor
 * layers (finished fills, backface-visibility, overlap chains, the rim light's square), no layout read per wheel event.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { NEAR_MARGIN } from "@/components/marketing/home/near-gate"

let failed = 0
function check(name: string, ok: boolean) {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const gate = read("components/marketing/home/near-gate.tsx")
const page = read("app/(storelib)/(marketing)/page.tsx")
const how = read("components/marketing/home/how-it-works.tsx")
const integ = read("components/marketing/home/integrations-section.module.css")
const marquee = read("components/marketing/product-marquee.tsx")
const ait = read("components/marketing/home/ai-tools-section.tsx")
const biz = read("components/marketing/home/business-carousel.tsx")
const bizMocks = read("components/marketing/home/showcase-mocks/business-mocks.tsx")

console.log("\n── one gate for loops off screen ──")
check("mounted once on the home page", /import \{ NearGate \} from "@\/components\/marketing\/home\/near-gate"/.test(page) && (page.match(/<NearGate \/>/g) || []).length === 1)
check("one IntersectionObserver over every lazy section box, a screen of margin each way", /querySelectorAll\("\[data-lazy-section\]"\)/.test(gate) && NEAR_MARGIN === "100% 0px 100% 0px" && (gate.match(/new IntersectionObserver/g) || []).length === 1)
check("a far box is marked data-far", /toggleAttribute\("data-far", !e\.isIntersecting\)/.test(gate))
check("only running, infinite, document-timeline CSS animations are paused", /a\.playState !== "running"/.test(gate) && /iterations === Infinity/.test(gate) && /a\.timeline !== document\.timeline/.test(gate) && /instanceof CSSAnimation/.test(gate))
check("they are played again only where the stylesheet still says running", /wantsRunning\(a\)/.test(gate) && /animationPlayState/.test(gate))
check("not a CSS rule over a whole section (that restyles every element at each crossing)", !/animation-play-state/.test(gate.replace(/\/\*[\s\S]*?\*\//g, "")))
check("a section built after the first report is caught", /data-lazy-mounted/.test(gate) && /MutationObserver/.test(gate))

console.log("\n── fewer layers ──")
check("how it works: the bars fill backwards, so a finished rise holds no layer", /\.cmh-o\{animation-duration:\.7s;[^\n]*animation-fill-mode:backwards/.test(how) && !/\.cmh-o\{[^\n]*animation-fill-mode:both/.test(how))
check("business: the slide and the cards fill backwards", /animation:biz-in \.6s cubic-bezier\(\.2,\.7,\.2,1\) backwards\}/.test(biz) && (bizMocks.match(/bz-rise \.\d+s \$\{E\} [\d.]+s backwards\}/g) || []).length === 2)
check("integrations: the icon's face has no backface-visibility (its turn never shows the back)", !/backface-visibility: hidden/.test(integ.replace(/\/\*[\s\S]*?\*\//g, "")))
check("the possibilities rows: paint containment on the track, with room kept for the hover ring", /\.um-track\{[^}]*padding-block:24px;margin-block:-24px;contain:paint/.test(marquee))
/* Changed on purpose (landing round 12, merged in round 6 perf): round 12 made the same fix its own way (no will-change, 26s a turn). */
check("the rim light: a square as long as the box's diagonal, turning only while live", /hypot\(100cqw,100cqh\)/.test(ait) && /container-type:size/.test(ait) && /\.ait-tw\[data-live\] \.ait-spin\{animation:ait-spin 26s linear infinite\}/.test(ait) && !/\.ait-spin\{[^}]*animation:ait-spin [^}]*paused\}/.test(ait))

/* Changed on purpose (landing round 12, merged in round 6 perf): the wheel glide is gone (the owner found it "too smooth and delayed"); the page scrolls natively, so nothing here is left to check about it. */
console.log("\n── the page scrolls natively ──")
check("no wheel handler of its own on the home page", !existsSync(join(process.cwd(), "components/marketing/smooth-wheel.tsx")) && !/SmoothWheel/.test(read("app/(storelib)/(marketing)/page.tsx")))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
