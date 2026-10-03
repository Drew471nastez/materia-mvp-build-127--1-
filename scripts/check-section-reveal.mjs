/**
 * ===========================================================================
 *  SECTIONS ARRIVING AS THEY SCROLL INTO VIEW, MEASURED
 * ===========================================================================
 * "Never animate the header, footer, or announcement bar; never animate the
 * first section of the page on load; animate other sections as they scroll
 * into view (once), opacity and transform only, no layout shift, no content
 * hidden if JS fails, reduced motion respected."
 *
 * The page from scripts/render-anchor-motion.tsx, with the theme set to fade
 * up, one section set to zoom and one set to none. Recorded from before the
 * page's script runs: every change of a section's `data-reveal`, every
 * animation started on a section box (and which properties it moves), and
 * every layout shift. Then the page is scrolled to the bottom a little each
 * frame, as a thumb would, and read back.
 *
 *   node scripts/check-section-reveal.mjs
 */
import { reporter, sleep, startProbe } from "./anchor-motion-probe.mjs"

const { check, finish } = reporter()
const probe = await startProbe()

const STATE = `(() => {
  const sc = document.getElementById("wb-preview-root")
  const bottom = sc ? sc.getBoundingClientRect().bottom : innerHeight
  const root = document.querySelector("[data-storelib-theme]")
  const header = root.querySelector(":scope > [data-section][data-chrome]")
  return {
    boxes: [...root.querySelectorAll(":scope > [data-section-box]")].map((b) => ({
      key: b.getAttribute("data-section-key"),
      type: b.getAttribute("data-section-type"),
      chrome: b.hasAttribute("data-chrome"),
      reveal: b.getAttribute("data-reveal"),
      onScreen: b.getBoundingClientRect().top < bottom,
      opacity: getComputedStyle(b).opacity,
    })),
    headerAnimations: header.getAnimations().length,
  }
})()`

const SCROLL_DOWN = `new Promise((resolve) => {
  const sc = document.getElementById("wb-preview-root")
  const max = () => (sc ? sc.scrollHeight - sc.clientHeight : document.documentElement.scrollHeight - innerHeight)
  const get = () => (sc ? sc.scrollTop : scrollY)
  const set = (y) => (sc ? (sc.scrollTop = y) : scrollTo(0, y))
  const step = () => {
    if (get() >= max() - 1) return resolve(get())
    set(Math.min(max(), get() + 24))
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
})`

const BODY_FIRST = "intro-a1"

async function run(label, url, view, scrollerless = true) {
  console.log(`\n${label}`)
  const page = await probe.open(url, view)
  const atLoad = await page.evaluate(STATE)
  const body = atLoad.boxes.filter((b) => !b.chrome)
  const pendingAtLoad = atLoad.boxes.filter((b) => b.reveal === "pending").map((b) => b.key)
  console.log(`        at load: ${atLoad.boxes.map((b) => `${b.key}${b.onScreen ? "*" : ""}=${b.reveal ?? "shown"}`).join(" ")}   (* on screen)`)
  check("nothing on screen at load is hidden or animated", atLoad.boxes.filter((b) => b.onScreen).every((b) => b.reveal === null && b.opacity === "1"))
  check("the first section is never hidden", body[0]?.key === BODY_FIRST && body[0].reveal === null)
  check("the footer is never hidden", atLoad.boxes.filter((b) => b.chrome).every((b) => b.reveal === null))
  check("sections below the screen wait, hidden", pendingAtLoad.length >= 3, pendingAtLoad.join(","))

  const scrolledTo = await page.evaluate(SCROLL_DOWN)
  await sleep(1500)
  const end = await page.evaluate(STATE)
  const log = await page.evaluate(() => window.__reveal)
  const anims = await page.evaluate(() => window.__anims)
  const shifts = await page.evaluate(() => window.__shifts)
  const cls = shifts.reduce((n, s) => n + s.value, 0)
  const animated = [...new Set(anims.map((a) => a.key))]
  const props = [...new Set(anims.flatMap((a) => a.props))].sort()
  const revealedOnce = animated.every((k) => anims.filter((a) => a.key === k).length === 1)
  console.log(`        scrolled to ${Math.round(scrolledTo)}px; animated: ${animated.join(", ") || "none"}; properties: ${props.join(", ") || "none"}; CLS ${cls.toFixed(4)} (${shifts.length} shifts)`)

  check("the header, the footer and the first section never animate",
    !animated.includes(BODY_FIRST) && !animated.some((k) => /^(header|footer)/.test(k)) && end.headerAnimations === 0 &&
      !log.some((r) => r.key === BODY_FIRST || r.type === "header" || r.type === "footer"))
  check("every waiting section came in as it scrolled into view", pendingAtLoad.every((k) => animated.includes(k)), pendingAtLoad.filter((k) => !animated.includes(k)))
  check("each once", revealedOnce)
  check('the section set to "none" never moves', !animated.includes("quiet-d4") && !pendingAtLoad.includes("quiet-d4"))
  check("the section set to zoom zooms; the theme's fade up rises",
    (anims.find((a) => a.key === "faq-x1")?.props ?? []).includes("scale") && anims.filter((a) => a.key !== "faq-x1").every((a) => a.props.includes("translate")))
  check("opacity and transforms only", props.every((p) => ["opacity", "translate", "scale"].includes(p)), props.join(","))
  check("at the theme's speed", anims.every((a) => a.duration === 600))
  check("no layout shift: CLS 0", cls === 0, cls.toFixed(4))
  check("and at the end every section is there", end.boxes.every((b) => b.reveal === null && b.opacity === "1"))
  await page.close()
  return { animated, cls }
}

await run("A computer, 1280 x 800", "/", { width: 1280, height: 800 })
await run("A phone, 390 x 844", "/", { width: 390, height: 844, phone: true })
await run("The builder's canvas, 1000 x 700", "/?mode=canvas&w=1000&h=700", { width: 1080, height: 780 })
await run("The builder's canvas, phone, 390 x 700", "/?mode=canvas&w=390&h=700", { width: 470, height: 780 })

console.log("\nReduced motion")
{
  const page = await probe.open("/", { width: 1280, height: 800, reduced: true })
  await page.evaluate(SCROLL_DOWN)
  await sleep(800)
  const log = await page.evaluate(() => window.__reveal)
  const anims = await page.evaluate(() => window.__anims)
  console.log(`        ${log.length} reveal changes, ${anims.length} animations`)
  check("nothing is hidden and nothing moves", log.length === 0 && anims.length === 0)
  await page.close()
}

console.log("\nWithout the runtime: nothing can be hidden")
{
  const page = await probe.open("/", { width: 1280, height: 800 })
  const hiddenWithoutMark = await page.evaluate(() => {
    const root = document.querySelector("[data-storelib-theme]")
    return [...root.querySelectorAll(":scope > [data-section-box]")].filter((b) => !b.hasAttribute("data-reveal") && getComputedStyle(b).opacity !== "1").length
  })
  const css = await page.evaluate(() => [...document.querySelectorAll("[data-storelib-theme] style")].map((s) => s.textContent).join("\n"))
  check("the stylesheet hides only what the runtime marked", hiddenWithoutMark === 0 && /\[data-reveal="pending"\]\{opacity:0;\}/.test(css) && !/storelibSectionIn/.test(css))
  await page.close()
}

await probe.close()
finish()
