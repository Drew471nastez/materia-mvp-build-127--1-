/**
 * ===========================================================================
 *  HOME, LANDING ROUND 8 (EVERYTHING): "SELL WHAT YOU MAKE. GET PAID WORLDWIDE."
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx, the globe files
 * (everything-globe*.ts(x)) and public/home/everything.
 *
 * The owner, round 8:
 *   - The store strip "at some point ends really weird" on real phones, after
 *     round 7 said it was fixed: it must never end, and keep looping.
 *   - Ollie Brandt and Remy Vale sell other things than a cup, tees and a
 *     cap; Kaia Moon gets a natural profile photo, other products and a line
 *     under her name; Static Bloom goes for a more realistic store; another
 *     OnePage like Satori Studio's, an invented person; profile photos.
 *   - The globe lighter: no lag, smooth and clean.
 *   - The support card keeps a bold gradient, without orange, pink or red.
 *
 * Measured in a browser (dev server, Playwright, iPhone 13 emulation and
 * 1440) when this was written:
 *   - the strip, at 390 and at 1440: 3 minutes of drift at 10x (18s), the tab
 *     hidden for 2.5s and shown, scrolled 2500px away and back, a touch swipe
 *     (phone) or a mouse flick (1440), resizes to 375/430/360/390 and to
 *     1280/1600/1920/1024/1440 while drifting, and a fresh load with every
 *     strip picture held back 2.5 to 5.5s: 0 of 881 samples with any of the
 *     picture uncovered, neighbouring pages never more than 0.007px off their
 *     pitch, 14 page animations running on screen and 0 off screen or hidden,
 *     a 0px jump on hiding and on showing again. A sideways swipe moved the
 *     strip 200px with the page still; an upward swipe scrolled the page 370px.
 *   - the globe's engine alone at 4x CPU, a drawn frame with its raster:
 *     22.7 to 25.6ms on a phone sized card at 2x with 7957 dots before, 10.4ms
 *     at 1.5x with 3635 dots now (15.1ms at 2x); a 1440 card keeps every dot.
 *     In the page (iPhone 13, 4x CPU, the worker drawing): the worker busy
 *     11.5% idle and 8.8% while dragged before, 6.2% and 5.1% now; frames over
 *     33ms in 3s: 17 idle and 6 dragged before, 1 and 0 now.
 *   - the section's height did not change: 2048px on a phone, 1502px at 1440.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import { landFor, LAND_MIN_GAP_PX } from "@/components/marketing/home/everything-globe-draw"
import { EVERYTHING_LAND_MASK, EVERYTHING_GLOBE_GROUND } from "@/components/marketing/home/everything-globe"
import { EVERYTHING_LAND_COUNT } from "@/components/marketing/home/everything-globe-land"

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
const src = read("components/marketing/home/everything-in-one-place.tsx")
const globe = read("components/marketing/home/everything-globe.tsx")
const engine = read("components/marketing/home/everything-globe-draw.ts")
const worker = read("components/marketing/home/everything-globe-worker.ts")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const css = EVERYTHING_STYLES[0]?.css ?? ""
const rule = (sel: string) => css.match(new RegExp(`(^|\\n|\\})${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*\\}`))?.[0] ?? ""

console.log("\n── 1. The strip never ends ──")
check("no wide moving track any more: the track stands, each page is its own layer", !/will-change/.test(rule(".ev-s-track")) && /will-change:transform/.test(rule(".ev-s-slot")))
check("where a page stands is one sum, wrapped into one turn of all the pages", /const leftOf = \(i: number, at: number\) => mod\(i \* pitch - at \+ pitch, turn\) - pitch/.test(src) && /turn = pitch \* n/.test(src))
check("one compositor loop a page, from the right end to one pitch off the left, linear and infinite", /\[\{ transform: `translate3d\(\$\{\(turn - pitch - base\[i\]\)\.toFixed\(2\)\}px,0,0\)` \}, \{ transform: `translate3d\(\$\{\(-pitch - base\[i\]\)\.toFixed\(2\)\}px,0,0\)` \}\]/.test(src) && /iterations: Infinity, easing: "linear"/.test(src))
check("every page shares one start time on the document's clock", /a\.startTime = now - into/.test(src) && /document\.timeline\?\.currentTime/.test(src))
check("stopping reads the offset from the clock, never from an animation", /x = x0 \+ \(\(clock\(\) - t0\) \/ 1000\) \* DRIFT_PX_S/.test(src) && !/currentTime\) \|\| 0/.test(src))
check("off screen and in a hidden tab the animations are taken off; back on, they carry on from x", /if \(on && !document\.hidden\) startDrift\(\)\s*else stopDrift\(\)/.test(src) && /visibilitychange/.test(src))
check("the pitch read from the laid out slots with transforms off, on any resize of the strip or a slot", /for \(const s of slots\) s\.style\.transform = "none"/.test(src) && /ro\?\.observe\(vp\)\s*ro\?\.observe\(slots\[0\]\)/.test(src))
check("a slot's width is CSS, never a picture's", /width:var\(--card-w\)/.test(rule(".ev-s-slot")) && /aspect-ratio:4\/5/.test(rule(".ev-mc-img")))
check("the strip's pictures load with the section, so none arrives blank", (html.match(/<img class="ev-(mc-img|lp-ground|lp-av|lp-img|ms-hero|pf-photo)"[^>]*loading="eager"/g) ?? []).length > 0 && !/<img class="ev-(mc-img|lp-img)"[^>]*loading="lazy"/.test(html))
/* Changed on purpose (landing round 9): the axis is read by swipeAxis (everything-globe.tsx). */
check("touch leaves vertical swipes to the page", /touch-action:pan-y/.test(rule(".ev-s")) && /if \(axis === "y"\) \{\s*drag = null/.test(src))
{
  /* The loop's arithmetic for the narrowest pages (170px + 12px) and the widest pictures: any offset covers the picture. */
  const n = EVERYTHING_STORES.length * 2
  const pitch = 182
  const turn = pitch * n
  const widest = Math.max(((2020 - 2 * 84) * 11) / 24, 767 - 2 * 0.0515 * 767)
  const mod = (v: number, m: number) => ((v % m) + m) % m
  let worst = Infinity
  for (let x = -5000; x < 5000; x += 7.3) {
    const lefts = Array.from({ length: n }, (_, i) => mod(i * pitch - x + pitch, turn) - pitch).sort((a, b) => a - b)
    let reach = 0
    for (const l of lefts) if (l <= reach + 1e-6) reach = Math.max(reach, l + pitch)
    worst = Math.min(worst, reach - widest)
  }
  check("simulated at every offset, the pages cover the widest picture", worst >= 0, { worst, n, widest })
}

console.log("\n── 2. The pages ──")
const ids = EVERYTHING_STORES.map((s) => s.key)
check("Static Bloom is gone, Slow Form stays, Fieldwork in its place", !/Static Bloom|static-bloom|Half Light/.test(JSON.stringify(EVERYTHING_STORES) + html) && ids.includes("slow-form") && ids[0] === "fieldwork")
const fw = EVERYTHING_STORES.find((s) => s.key === "fieldwork")
check("Fieldwork laid out as a Storelib store: menu, centred wordmark, cart, a wide photo, the drop, four priced pieces", fw?.kind === "merch" && !!fw.hero && /<span class="ev-ms-nav">Shop all<\/span><span class="ev-ms-mark">Fieldwork<\/span><span class="ev-ms-nav">Cart \(0\)<\/span>/.test(html) && /class="ev-ms-hero"/.test(html) && fw.products.length === 4 && fw.products.every((p) => /^\$\d+$/.test(p.price)))
const link = (k: string) => EVERYTHING_STORES.find((s) => s.key === k)
const ollie = link("ollie")
const remy = link("remy")
const kaia = link("kaia")
check("Ollie Brandt: no cup and no tees, a record and a tape", ollie?.kind === "link" && !/mug|tees/.test(ollie.products.join()) && /vinyl/.test(ollie.products[0]) && /tape/.test(ollie.products[1]))
check("Remy Vale: no tee and no cap, a journal and a planner", remy?.kind === "link" && !/tee|cap/.test(remy.products.join()) && /journal/.test(remy.products[0]) && /planner/.test(remy.products[1]))
check("Kaia Moon: her own photo, a line under her name, other products", kaia?.kind === "link" && /kaia-av/.test(kaia.avatar) && !!kaia.bio && !/hood|tee/.test(kaia.products.join()) && html.includes(`<span class="ev-lp-bio">${kaia.bio}</span>`))
check("every link page shows its creator's photo, round, over the name", EVERYTHING_STORES.every((s) => s.kind !== "link" || /-av\.webp$/.test(s.avatar)) && /border-radius:50%/.test(rule(".ev-lp-av")))
const pf = EVERYTHING_STORES.find((s) => s.kind === "profile")
check("a seventh page: a dark OnePage like Satori Studio's for an invented person", pf?.kind === "profile" && pf.name === "Idris Kane" && /background:#0a0a0b/.test(rule(".ev-pf")) && /class="ev-pf-tick"/.test(html) && (html.match(/class="ev-pf-link"/g) ?? []).length === pf.links.length * 2 && !/Stefan|Satori/.test(JSON.stringify(EVERYTHING_STORES)))
check("its photo fades into the black under the words", /z-index:1/.test(rule(".ev-pf::before")) && /z-index:2/.test(rule(".ev-pf-name,.ev-pf-bio,.ev-pf-icons,.ev-pf-link")))
check("no two stores side by side, round the loop too", EVERYTHING_STORES.every((s, i) => s.kind !== "merch" || EVERYTHING_STORES[(i + 1) % EVERYTHING_STORES.length].kind !== "merch"))
const pics = EVERYTHING_STORES.flatMap((s) => (s.kind === "merch" ? [...s.products.map((p) => p.src), ...(s.hero ? [s.hero] : [])] : s.kind === "link" ? [s.ground, s.avatar, ...s.products] : [s.photo]))
check("every picture local, a real webp, under 120KB", pics.every((u) => u.startsWith("/home/everything/stores/") && existsSync(join(root, "public", u)) && statSync(join(root, "public", u)).size < 120_000 && readFileSync(join(root, "public", u)).subarray(8, 12).toString() === "WEBP"), pics)
check("the pictures the strip no longer shows are gone", ["half-peace", "half-trail", "half-night", "half-blank", "ollie-mug", "ollie-tees", "remy-cap", "remy-tee", "kaia-hood", "kaia-tee"].every((f) => !existsSync(join(root, `public/home/everything/stores/${f}.webp`))))

console.log("\n── 3. The globe, lighter ──")
const full = landFor(EVERYTHING_LAND_MASK, EVERYTHING_LAND_MASK.step)
check("laid out at the bitmask's own step, the land is every dot it holds", full.length / 3 === EVERYTHING_LAND_COUNT, full.length / 3)
const phoneR = Math.min(350 * 0.45, 335 * 0.57)
const phoneStep = Math.ceil(((LAND_MIN_GAP_PX / phoneR) / (Math.PI / 180)) * 20) / 20
const phone = landFor(EVERYTHING_LAND_MASK, phoneStep)
check("on a phone sized ball about half the dots", phone.length / 3 < EVERYTHING_LAND_COUNT * 0.55 && phone.length / 3 > EVERYTHING_LAND_COUNT * 0.35, { phone: phone.length / 3, phoneStep })
check("a 1440 ball keeps the full grid", (LAND_MIN_GAP_PX / Math.min(580 * 0.45, 475 * 0.57)) / (Math.PI / 180) <= EVERYTHING_LAND_MASK.step)
check("every laid out dot on the unit sphere", (() => { for (let k = 0; k < phone.length; k += 3) if (Math.abs(Math.hypot(phone[k], phone[k + 1], phone[k + 2]) - 1) > 1e-5) return false; return true })())
check("the land sent as its bitmask, the engine laying it out once per size step", /worker\.postMessage\(\{ type: "init", canvas: off, pts, cities, home, land, ground \}, \[off\]\)/.test(globe) && /if \(want !== landStep\)/.test(engine))
check("an opaque canvas on the card's ground: no clear, cheaper to composite", EVERYTHING_GLOBE_GROUND === "#060608" && /background:#060608/.test(css) && /getContext\("2d", \{ alpha: !m\.ground \}\)/.test(worker) && /if \(!host\.ground\) ctx\.clearRect/.test(engine))
check("the rim fade stamped over the ball's square only", /ctx\.drawImage\(st\.fade, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0\)/.test(engine))
check("a phone draws at 1.5x (1.25x low end)", /if \(phone\) return lowEnd \? 1\.25 : 1\.5/.test(globe))
check("drawn only while some of it is on screen", /\{ rootMargin: "0px" \}/.test(globe))
check("the analytics globe, which shares the engine, still passes its own points", /createGlobeEngine\(host: GlobeEngineHost, given: Float32Array, cities: V3\[\], home: V3, land\?: GlobeLand \| null\)/.test(engine))

console.log("\n── 4. Support ──")
const ground = rule(".ev-c")
/* Changed on purpose (landing round 9): "keep the colour of the Real support card as the pink/orange/red gradient": round 7's raspberry to peach, the teal gone. */
check("a still raspberry to peach gradient, no teal", /linear-gradient\(168deg,#9d1640 0%,#c03560 36%,#dc6476 64%,#f1a283 100%\)/.test(ground) && !/animation/.test(ground) && !/#053c4a|#12999b|#5fd6c2/.test(ground))
{
  const hues = [...ground.matchAll(/#([0-9a-f]{6})/g)].map((m) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max === min) return 0
    const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
    return (h * 60 + 360) % 360
  })
  /* Changed on purpose (landing round 9): the owner wants the pink, orange and red back; every hue from raspberry round to peach, still no purple, green or blue. */
  check("pink, orange and red again: every hue from raspberry round to peach", hues.length >= 4 && hues.every((h) => h > 335 || h < 25), hues)
}
check("the thread white and its answer black on it, readable", /background:#fff/.test(rule(".ev-c-thread")) && /\.ev-c-dark\{background:#111113;color:#fff\}/.test(css))

console.log("\n── The words ──")
const words = [JSON.stringify(EVERYTHING_STORES), html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")].join(" ")
check("no em dashes, no banned words, no fans, none of the round's banned names", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|fans?|enthusiasts)\b/i.test(words) && !/Nadia Brooks|The Loop\b|Nordline|Charla|Static Bloom|Nails by Bea/.test(words))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
