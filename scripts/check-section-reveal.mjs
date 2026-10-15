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
 * frame, as a thumb would, and read back. In the builder's canvas it is
 * also edited (a heading typed into, a section selected, one added) and
 * scrolled through again.
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

/*
  A SETTING CHANGED IN THE BUILDER PLAYS. The section being edited is on
  screen, and on screen is never hidden, so a new entrance only showed after
  scrolling it away and back. Now the sections in view play it once.
*/
async function changed(name, url, size, apply) {
  const page = await probe.open(url, size)
  await sleep(700)
  await page.evaluate(() => { window.__anims.length = 0 })
  await page.evaluate(apply)
  await sleep(1200)
  const anims = await page.evaluate(() => window.__anims)
  const state = await page.evaluate(STATE)
  await page.close()
  console.log(`        ${name}: animated ${[...new Set(anims.map((a) => a.key))].join(", ") || "nothing"}`)
  return { anims, state }
}
console.log("\nA setting changed while the page is open")
{
  const canvasSize = { width: 1080, height: 780 }
  const one = await changed("canvas, features set to zoom", "/?mode=canvas&w=1000&h=700", canvasSize, () => window.__setSection("features-b2", { animation: "zoom" }))
  check("in the canvas, the edited section plays its new entrance once", one.anims.length === 1 && one.anims[0].key === "features-b2" && one.anims[0].props.includes("scale"), one.anims)
  check("  and everything on screen is shown at the end", one.state.boxes.filter((b) => b.onScreen).every((b) => b.opacity === "1" && b.reveal === null), one.state.boxes.filter((b) => b.onScreen))
  const first = await changed("canvas, the first section set to zoom", "/?mode=canvas&w=1000&h=700", canvasSize, () => window.__setSection("intro-a1", { animation: "zoom" }))
  check("  the first section still never moves", first.anims.length === 0, first.anims)
  const all = await changed("canvas, the theme's style set to zoom", "/?mode=canvas&w=1000&h=700", canvasSize, () => window.__setTheme({ animation_style: "zoom-in" }))
  const inView = all.state.boxes.filter((b) => b.onScreen && !b.chrome).map((b) => b.key).filter((k) => k !== BODY_FIRST && k !== "quiet-d4" && k !== "faq-x1")
  check("  a theme change plays on every section in view that follows the theme", inView.length > 0 && inView.every((k) => all.anims.some((a) => a.key === k)) && all.anims.every((a) => a.key !== BODY_FIRST), { inView, animated: all.anims.map((a) => a.key) })
  const off = await changed("canvas, animations switched off", "/?mode=canvas&w=1000&h=700", canvasSize, () => window.__setTheme({ animations_enabled: false }))
  check("  switched off, nothing plays", off.anims.length === 0, off.anims)
  const live = await changed("live page, features set to zoom", "/", { width: 1280, height: 800 }, () => window.__setSection("features-b2", { animation: "zoom" }))
  check("on the live page a setting never changes under a visitor, and nothing replays", live.anims.length === 0, live.anims)
}

/*
  The builder's canvas while it is being edited: the reveal runs there as on
  the website, and an edit neither hides nor plays again anything already
  painted. Half the page is scrolled through and back, then a heading is
  typed into, a section selected and a section added at the end; then the
  rest of the page is scrolled through.
*/
const SCROLL_TO = (y) => `new Promise((resolve) => {
  const sc = document.getElementById("wb-preview-root")
  const step = () => {
    const d = ${y} - sc.scrollTop
    if (Math.abs(d) < 1) return resolve(sc.scrollTop)
    const before = sc.scrollTop
    sc.scrollTop += Math.sign(d) * Math.min(24, Math.abs(d))
    if (sc.scrollTop === before) return resolve(sc.scrollTop)
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
})`
const FRAMES = (n) => `new Promise((r) => { let i = 0; const f = () => (++i >= ${n} ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })`

console.log("\nThe builder's canvas, edited, 1000 x 700")
{
  const page = await probe.open("/?mode=canvas&w=1000&h=700", { width: 1080, height: 780 })
  const mid = await page.evaluate(`(() => { const sc = document.getElementById("wb-preview-root"); const b = document.querySelector('[data-section-key="story-c3"]'); return b.getBoundingClientRect().bottom - sc.getBoundingClientRect().top + sc.scrollTop - sc.clientHeight + 40 })()`)
  await page.evaluate(SCROLL_TO(Math.round(mid)))
  await sleep(1200)
  await page.evaluate(SCROLL_TO(0))
  await sleep(300)
  const played = [...new Set((await page.evaluate(() => window.__anims)).map((a) => a.key))]
  const marks = { reveal: (await page.evaluate(() => window.__reveal)).length, anims: (await page.evaluate(() => window.__anims)).length }
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__edit("type"))
    await page.evaluate(FRAMES(2))
  }
  await page.evaluate(() => window.__edit("select"))
  await page.evaluate(FRAMES(2))
  await page.evaluate(() => window.__edit("add"))
  await page.evaluate(FRAMES(4))
  await sleep(200)
  const after = await page.evaluate(STATE)
  const revealSince = (await page.evaluate(() => window.__reveal)).slice(marks.reveal)
  const animsSince = (await page.evaluate(() => window.__anims)).slice(marks.anims)
  const state = (k) => after.boxes.find((b) => b.key === k)
  console.log(`        played before the edits: ${played.join(", ")}; after: ${after.boxes.map((b) => `${b.key}${b.onScreen ? "*" : ""}=${b.reveal ?? "shown"}`).join(" ")}`)
  check("the sections scrolled through first came in", played.includes("pricing") && played.includes("story-c3"), played.join(","))
  check("typing, selecting and adding play nothing again and hide nothing painted",
    animsSince.length === 0 && revealSince.every((r) => r.key === "added-e5" && r.value === "pending"), JSON.stringify({ animsSince, revealSince }))
  check("what is on screen stays as it is", after.boxes.filter((b) => b.onScreen).every((b) => b.reveal === null && b.opacity === "1"))
  check("a section already played is not armed again", state("pricing")?.reveal === null && state("story-c3")?.reveal === null)
  check("those still below wait as they did", state("faq-x1")?.reveal === "pending" && state("cta-z9")?.reveal === "pending")
  check("the section added below the screen waits for its scroll", state("added-e5")?.reveal === "pending" && !state("added-e5")?.onScreen)
  await page.evaluate(SCROLL_DOWN)
  await sleep(1500)
  const anims = await page.evaluate(() => window.__anims)
  const end = await page.evaluate(STATE)
  const count = (k) => anims.filter((a) => a.key === k).length
  check("scrolled to, it comes in like the others, once", count("added-e5") === 1 && count("faq-x1") === 1 && count("cta-z9") === 1 && count("pricing") === 1 && count("story-c3") === 1, anims.map((a) => a.key).join(","))
  check("and at the end every section is there", end.boxes.every((b) => b.reveal === null && b.opacity === "1"))
  await page.close()
}

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
