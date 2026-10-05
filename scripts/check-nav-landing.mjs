/**
 * THE LANDING, FILMED FRAME BY FRAME.
 *
 *   node scripts/check-nav-landing.mjs        (after pnpm build)
 *
 * The real compiled stylesheet, the real markers, and each surface stepped
 * through its own animation a frame at a time with the pixels read off a
 * screenshot, so "it eases in" is a list of numbers rather than an opinion.
 *
 * Five things it has to show:
 *
 *   a client navigation lands        opacity climbs over 180ms, and on the
 *                                   profile centre's own box the 2px rise
 *                                   goes with it
 *   a document load does not         no animation exists at all without the
 *                                   class a navigation puts on <html>
 *   a move inside one page does not  the same, since the class is keyed to
 *                                   the pathname (held in the suite)
 *   reduced motion does not          nothing animates with the media feature
 *                                   emulated
 *   nothing shifts                   the page is the same height and the
 *                                   surface's neighbours are in the same
 *                                   places with the landing as without
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build. Run pnpm build first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-landing-"))

/*
  THE THREE SURFACES, each with the marker the real page carries and the real
  class the real code puts on it. Plain markup on purpose: what is under test
  is the stylesheet's landing, and the wiring that decides when it runs is
  held in tests/elastic-and-landings.test.ts against the source.
*/
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>
  body { margin: 0; background: #ffffff }
  .bar { height: 57px; background: #ffffff }
  .filler { height: 600px }
  #sibling { height: 40px; background: #e5e7eb }
</style></head><body>
  <!-- a person's page, or a creator's -->
  <div id="profile" data-storefront-root="" data-member-profile="" style="min-height:100vh;background:#1a1a2e">
    <div class="bar"></div><div class="filler"></div>
  </div>
  <!-- Explore -->
  <main id="explore" class="explore-ground" style="min-height:100vh;background:#1a1a2e">
    <div class="filler"></div>
  </main>
  <!-- the profile centre's own box, which the router swaps its pages inside -->
  <div id="shell">
    <div id="navfade" class="library-content-enter min-w-0" style="background:#1a1a2e;height:300px"></div>
    <div id="sibling"></div>
  </div>
</body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 780 })
const url = `file://${join(out, "index.html")}`

let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }

/** The pixel at the middle of an element, off a real screenshot. */
async function pixelOf(id) {
  const box = await page.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(Math.min(Math.max(r.top + 80, r.top + r.height / 2), 740)) }
  }, id)
  const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: 2, height: 2 }, encoding: "base64" })
  const p = await browser.newPage()
  const rgb = await p.evaluate(async (data) => {
    const img = new Image()
    img.src = "data:image/png;base64," + data
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    c.getContext("2d").drawImage(img, 0, 0)
    const d = c.getContext("2d").getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
  }, shot)
  await p.close()
  return rgb
}

/**
 * Step one element's animation a frame at a time and read, at each step, the
 * computed opacity and offset AND the pixel the compositor produced. The
 * animation is paused and its clock set by hand so the film is the same every
 * run instead of whatever the machine managed that second.
 */
async function film(id, setup, stops = [0, 45, 90, 135, 180]) {
  await page.goto(url)
  await page.evaluate(setup)
  const frames = []
  for (const t of stops) {
    await page.evaluate((i, time) => {
      const el = document.getElementById(i)
      for (const a of el.getAnimations()) {
        a.pause()
        a.currentTime = time
      }
    }, id, t)
    const style = await page.evaluate((i) => {
      const el = document.getElementById(i)
      const cs = getComputedStyle(el)
      return { opacity: Number(cs.opacity), top: cs.top, animations: el.getAnimations().map((a) => a.animationName) }
    }, id)
    frames.push({ t, ...style, pixel: await pixelOf(id) })
  }
  return frames
}

/* The class the real NavLanding puts on <html> for a client navigation. */
const LAND_HTML = `document.documentElement.classList.add("nav-landing")`
/* The class the profile centre's own box takes on a client navigation. */
const LAND_BOX = `document.getElementById("navfade").classList.add("page-land")`

console.log("\nA client navigation onto somebody's profile\n")
{
  const frames = await film("profile", LAND_HTML)
  for (const f of frames) console.log(`    ${String(f.t).padStart(3)}ms  opacity ${f.opacity.toFixed(3)}  pixel ${f.pixel.join(",")}  ${f.animations.join(",")}`)
  say(frames[0].animations.includes("app-page-enter"), "the landing is running on the page's own root")
  say(frames[0].opacity === 0, `it starts from nothing  (${frames[0].opacity})`)
  say(frames.at(-1).opacity === 1, `and ends settled  (${frames.at(-1).opacity})`)
  const rising = frames.every((f, i) => i === 0 || f.opacity >= frames[i - 1].opacity)
  say(rising, "every frame is at least as far along as the one before it")
  say(new Set(frames.map((f) => f.opacity)).size === frames.length, "and no two frames are the same, so it is a curve and not a step")
  const brighter = frames.every((f, i) => i === 0 || f.pixel[0] <= frames[i - 1].pixel[0])
  say(brighter, "the pixels the compositor produced follow it, dark page over white from nothing to solid")
}

console.log("\nA client navigation onto Explore\n")
{
  const frames = await film("explore", LAND_HTML)
  for (const f of frames) console.log(`    ${String(f.t).padStart(3)}ms  opacity ${f.opacity.toFixed(3)}  pixel ${f.pixel.join(",")}`)
  say(frames[0].animations.includes("app-page-enter"), "Explore lands on the same animation")
  say(frames[0].opacity === 0 && frames.at(-1).opacity === 1, "from nothing to settled over 180ms")
}

console.log("\nLanding on Settings, and coming back from it: the profile centre's own box\n")
{
  const frames = await film("navfade", LAND_BOX)
  for (const f of frames) console.log(`    ${String(f.t).padStart(3)}ms  opacity ${f.opacity.toFixed(3)}  top ${f.top}  ${f.animations.join(",")}`)
  say(frames[0].animations.includes("community-land"), "the box lands on the app's own landing, the one a community uses")
  say(!frames[0].animations.includes("skeleton-reveal"), "and the 220ms hand over from loading.tsx does not run on top of it")
  say(frames[0].opacity === 0 && frames.at(-1).opacity === 1, "opacity from nothing to settled")
  say(frames[0].top === "2px" && frames.at(-1).top === "0px", `the 2px rise goes with it  (${frames[0].top} to ${frames.at(-1).top})`)
}

console.log("\nA document load lands nothing\n")
{
  await page.goto(url)
  const none = await page.evaluate(() => ({
    profile: document.getElementById("profile").getAnimations().length,
    explore: document.getElementById("explore").getAnimations().length,
    navfadeNames: document.getElementById("navfade").getAnimations().map((a) => a.animationName),
    htmlClass: document.documentElement.className,
  }))
  say(none.profile === 0, `nothing is animating on the profile  (${none.profile})`)
  say(none.explore === 0, `nothing is animating on Explore  (${none.explore})`)
  say(!none.navfadeNames.includes("community-land"), `and the profile centre's box has only its hand over  (${none.navfadeNames.join(",") || "nothing"})`)
  say(!none.htmlClass.includes("nav-landing"), "no landing class on <html>")
}

console.log("\nComing back to Explore from a product, where the scroll restore owns the arrival\n")
{
  await page.goto(url)
  const names = await page.evaluate(() => {
    const html = document.documentElement
    html.classList.add("nav-landing", "explore-scroll-settling")
    return document.getElementById("explore").getAnimations().map((a) => a.animationName)
  })
  say(!names.includes("app-page-enter"), `the landing stands aside  (${names.join(",") || "nothing"})`)
  say(names.includes("explore-return"), "and Explore's own return fade is what runs")
}

console.log("\nReduced motion\n")
{
  await page.goto(url)
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const counts = await page.evaluate(() => {
    document.documentElement.classList.add("nav-landing")
    document.getElementById("navfade").classList.add("page-land")
    return {
      profile: document.getElementById("profile").getAnimations().length,
      explore: document.getElementById("explore").getAnimations().length,
      navfade: document.getElementById("navfade").getAnimations().length,
      opacity: Number(getComputedStyle(document.getElementById("profile")).opacity),
    }
  })
  say(counts.profile === 0 && counts.explore === 0 && counts.navfade === 0, `nothing animates  (${counts.profile}/${counts.explore}/${counts.navfade})`)
  say(counts.opacity === 1, "and the page is simply there")
  await page.emulateMediaFeatures([])
}

console.log("\nNothing shifts\n")
{
  await page.goto(url)
  const before = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    sibling: document.getElementById("sibling").getBoundingClientRect().top,
    explore: document.getElementById("explore").getBoundingClientRect().top,
  }))
  const after = await page.evaluate(() => {
    document.documentElement.classList.add("nav-landing")
    document.getElementById("navfade").classList.add("page-land")
    for (const el of [document.getElementById("profile"), document.getElementById("explore"), document.getElementById("navfade")]) {
      for (const a of el.getAnimations()) { a.pause(); a.currentTime = 0 }
    }
    return {
      height: document.documentElement.scrollHeight,
      sibling: document.getElementById("sibling").getBoundingClientRect().top,
      explore: document.getElementById("explore").getBoundingClientRect().top,
    }
  })
  say(before.height === after.height, `the page is the same height  (${before.height} then ${after.height})`)
  say(before.sibling === after.sibling, `the box below the landing one has not moved  (${before.sibling} then ${after.sibling})`)
  say(before.explore === after.explore, `nor has Explore under the profile  (${before.explore} then ${after.explore})`)
}

await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nthe landing runs on a navigation, never on a load, and moves nothing\n")
process.exit(bad ? 1 : 0)
