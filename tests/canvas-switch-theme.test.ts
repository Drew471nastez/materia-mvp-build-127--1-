/**
 * ===========================================================================
 *  AN IMPORTED THEME THROUGH THE EDITOR'S SIZE SWITCH
 * ===========================================================================
 *   npx tsx tests/canvas-switch-theme.test.ts
 *
 * The owner filmed his storefront going from the phone to the desktop: the
 * headline at the desktop's size in a strip as narrow as the phone, the
 * picture grey, the headline and stars gone and then fading in (round 35).
 * The theme's own scripts did it: a slider sized in pixels that measures
 * again only after a debounce, built again from its markup when the page
 * crosses the phone's width, with a picture that fades in once marked
 * loaded and an entrance on the current slide.
 *
 * Held here, in Chromium, with the canvas's head and bridge
 * (canvas-bridge.ts, CANVAS_SWITCH): while the builder says a switch is
 * under way, the slides follow the page's width in the frame it changes,
 * the breakpoint is told once, the slide's entrance is not seen again, and
 * the picture drawn before is drawn in full in the new slide. Without the
 * switch said, the same page behaves as the theme wrote it (the debounce
 * lags), so the check measures the switch and not the page.
 *
 * Measured end to end by scripts/check-view-switch-frames.mjs
 * tests/fixtures/shopify-materia.
 */
import { existsSync } from "node:fs"
import { CANVAS_BRIDGE, CANVAS_HEAD, CANVAS_SWITCH } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log("\nThe canvas's head carries it\n")
check("the switch script is in the canvas page's head", CANVAS_HEAD.includes(CANVAS_SWITCH))
check("the bridge hands the switch to it when the builder holds the view", /window\.__slSwitch\(!!on\)/.test(CANVAS_BRIDGE) && /window\.__slSwitch\(false\)/.test(CANVAS_BRIDGE))
check("pictures are kept by the page's own preloads, not the shared cache", /l\.rel = "preload"/.test(CANVAS_SWITCH) && /l\.as = "image"/.test(CANVAS_SWITCH))
check("what starts moving on screen during the switch is taken to its end, checked after each layout", /ro = new ResizeObserver\(laidOut\)/.test(CANVAS_SWITCH) && /a\.finish\(\)/.test(CANVAS_SWITCH))

const PICTURE = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#3a7"/></svg>`)

const THEME = `
  var phone = matchMedia("(max-width: 749px)");
  window.__rebuilt = 0;
  var el = document.querySelector("[data-slider]"), vp = el.querySelector("[data-viewport]"), markup = el.querySelector("[data-track]").innerHTML;
  var track, slides;
  var measure = function () { var w = vp.clientWidth; slides.forEach(function (s) { s.style.width = w + "px"; }); };
  var loaded = function () { track.querySelectorAll("img").forEach(function (img) { var on = function () { requestAnimationFrame(function () { img.classList.add("is-loaded"); }); }; if (img.complete && img.naturalWidth) on(); else img.addEventListener("load", on, { once: true }); }); };
  var build = function () {
    track = el.querySelector("[data-track]"); slides = Array.prototype.slice.call(track.querySelectorAll("[data-slide]"));
    slides.forEach(function (s) { s.classList.remove("is-active"); });
    measure(); loaded();
    requestAnimationFrame(function () { slides[0].classList.add("is-active"); });
  };
  build();
  var t = 0;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(measure, 250); });
  phone.addEventListener("change", function () { window.__rebuilt++; el.querySelector("[data-track]").innerHTML = markup; build(); });
`

async function inBrowser() {
  console.log("\nIn Chromium\n")
  const chrome = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: held to its source only")
    return
  }
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    const open = async () => {
      const page = await browser.newPage()
      await page.setViewport({ width: 1100, height: 700 })
      /* window.__name: what tsx compiles a named function in page.evaluate to. */
      await page.setContent(`<!doctype html><html><head><script>window.__name = function (f) { return f }</script>${CANVAS_HEAD}<style>
          body{margin:0}.slider{overflow:hidden}[data-track]{display:flex}[data-slide]{flex:none;position:relative;height:300px}
          img{display:block;width:100%;height:200px;opacity:0;transition:opacity .6s}img.is-loaded{opacity:1}
          h2{margin:0;font-size:56px;opacity:0}[data-slide].is-active h2{animation:up .9s both}
          @keyframes up{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
          @media (max-width:749px){h2{font-size:30px}}
        </style></head><body>
        <div class="shopify-section" id="shopify-section-hero" data-section-id="hero"><div class="slider" data-slider><div data-viewport><div data-track>
          <div data-slide><img src="${PICTURE}" alt=""><h2>Alimenta la tua concentrazione.</h2></div>
          <div data-slide><img src="${PICTURE}" alt=""><h2>Idratazione.</h2></div>
        </div></div></div></div>
        <div style="height:1400px"></div>
        <script>${THEME}</script>
        <script>window.__slInspect = false;${CANVAS_BRIDGE}</script>
      </body></html>`)
      await wait(1500)
      return page
    }
    const state = (page: import("puppeteer-core").Page) => page.evaluate(() => {
      const s = document.querySelector("[data-slide]") as HTMLElement
      const h = s.querySelector("h2") as HTMLElement
      const img = s.querySelector("img") as HTMLImageElement
      return {
        slide: Math.round(s.getBoundingClientRect().width),
        view: document.documentElement.clientWidth,
        heading: Number(getComputedStyle(h).opacity),
        moving: h.getAnimations().filter((a) => a.playState === "running").length,
        picture: Number(getComputedStyle(img).opacity),
        rebuilt: (window as unknown as { __rebuilt: number }).__rebuilt,
      }
    })
    /* Three frames after the page is laid out at the new width: what the person sees while the card is still moving. */
    const frames = (page: import("puppeteer-core").Page, n: number) => page.evaluate((n) => new Promise<void>((done) => { let k = 0; const f = () => (++k >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

    /* Without the switch said: the theme as it is written. */
    const plain = await open()
    await plain.setViewport({ width: 900, height: 700 })
    await frames(plain, 3)
    const lag = await state(plain)
    check("without the switch said, the slides keep the old width for the theme's debounce (the check can fail)", Math.abs(lag.slide - lag.view) > 50, lag)
    await plain.setViewport({ width: 600, height: 700 })
    await frames(plain, 3)
    const replay = await state(plain)
    check("  and crossing the breakpoint plays the slide's entrance again over a faded picture", replay.heading < 1 && replay.moving > 0 && replay.picture < 1, replay)
    await plain.close()

    const page = await open()
    await page.evaluate(() => window.postMessage({ storelib: 1, type: "hold-view", on: true }, "*"))
    await wait(50)
    await page.setViewport({ width: 600, height: 700 })
    await frames(page, 3)
    const mid = await state(page)
    check("the switch said: the slides are the page's width within the frames of the change", Math.abs(mid.slide - mid.view) <= 1, mid)
    check("  the slider was built again once, for the breakpoint it crossed", mid.rebuilt === 1, mid)
    check("  its headline is shown, not playing its entrance again", mid.heading === 1 && mid.moving === 0, mid)
    check("  the picture drawn before is drawn in full in the new slide", mid.picture === 1, mid)

    await page.setViewport({ width: 1100, height: 700 })
    await frames(page, 3)
    const back = await state(page)
    check("and back to the desktop's width: the same", Math.abs(back.slide - back.view) <= 1 && back.rebuilt === 2 && back.heading === 1 && back.moving === 0 && back.picture === 1, back)

    await page.evaluate(() => window.postMessage({ storelib: 1, type: "hold-view", on: false }, "*"))
    await wait(1300)
    const after = await page.evaluate(() => ({ lifted: Array.from(document.images).filter((i) => i.style.opacity).length }))
    check("once it is over, the theme's own style is back on its pictures", after.lifted === 0, after)
    await wait(400)
    const late = await state(page)
    check("  and the theme's own late measure, when it comes, changes nothing", Math.abs(late.slide - late.view) <= 1 && late.rebuilt === 2, late)
  } finally {
    await browser.close()
  }
}

async function main() {
  await inBrowser()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

void main()
