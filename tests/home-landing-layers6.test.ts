/**
 * HOME PAGE, LANDING ROUND 11 PERF (layers and animations): one safety net for loops off screen, and fewer compositor
 * layers (finished fills, backface-visibility, overlap chains, the rim light's square), no layout read per wheel event.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

let failed = 0
function check(name: string, ok: boolean) {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("app/(storelib)/(marketing)/page.tsx")
const how = read("components/marketing/home/how-it-works.tsx")
const integ = read("components/marketing/home/integrations-section.module.css")
const marquee = read("components/marketing/product-marquee.tsx")
const ait = read("components/marketing/home/ai-tools-section.tsx")
const biz = read("components/marketing/home/business-carousel.tsx")
const bizMocks = read("components/marketing/home/showcase-mocks/business-mocks.tsx")

/*
 * Changed on purpose (landing round 13, the owner: carousels "don't autoplay at all, it's fully blocked"): the one
 * gate for loops off screen (near-gate.tsx) is gone. It paused CSS loops through the Animations API, and once a
 * loop is paused that way the browser stops following the section's own animation-play-state switches; a loop whose
 * section gate still said paused at the moment it came back near was never played again (the apps rows, the
 * possibilities, How it works, Make the work). Each section's own gate (data-commerce-live, data-live...) and
 * LandingStory's rest are what hold loops off screen.
 */
console.log("\n── no gate that pauses loops through the Animations API ──")
check("near-gate.tsx is gone and not mounted", !existsSync(join(process.cwd(), "components/marketing/home/near-gate.tsx")) && !/NearGate/.test(page))

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
