/**
 * ===========================================================================
 *  ASK STORELIB WRITES A SECTION IN AN IMPORTED THEME: THE SPOT AT ENTER, AND
 *  THE CANVAS GLIDES TO IT (round 18)
 * ===========================================================================
 * The owner: "as soon as I send the prompt, it should smoothly close the
 * modal, smoothly auto scroll me to that section that's coding, and show the
 * animation states with the coding fades", on every kind of theme. An
 * imported theme's canvas is a frame drawn from markup, and the spot drew
 * nothing in it, so nobody was taken anywhere.
 *
 * The real editor on the imported Materia store, the frame scrolled to its
 * foot, an ask the rules send to the writer, with the router taking DECIDE_MS
 * to answer (render-editor-probe.tsx PROBE_WRITER). Every 50ms from Enter:
 *
 *   SPOT     the spot ([data-writing-section]) is in the frame within 400ms
 *            of Enter, before the router answers
 *   TAKEN    the frame scrolls to it, over many samples (a glide), and it is
 *            in view
 *   MOVING   its lane of code is animating (CSS animations running in it)
 *
 *   npx tsx scripts/check-wb-write-imported-r18.mjs
 *   ONLY=phone|desktop   DECIDE_MS=1500   CPU=4   BUDGET=0
 */
process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep } = await import("./canvas-probe-kit.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const CPU = Number(process.env.CPU ?? 1)
const DECIDE_MS = Number(process.env.DECIDE_MS ?? 1500)
const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

const SOURCE = `<template><section class="pw"><h2>{{ settings.heading }}</h2><p>Written for the probe.</p></section></template>
<style scoped>.pw { padding: 96px 24px; background: #ecfdf5; text-align: center; }</style>
<schema>{"schema_version":1,"type":"probe_written","name":"Probe written","category":"content","settings":[{"type":"text","id":"heading","label":"Heading","default":"Written by Storelib AI"}],"presets":[{"name":"Probe written","settings":{"heading":"Written by Storelib AI"}}]}</schema>`
/* Slow steps, so the spot is held long enough to be glided to and watched. */
const WRITER = { gapMs: 600, steps: 8, path: "sections/probe_written.storelib", type: "probe_written", name: "Probe written", source: SOURCE, decideMs: DECIDE_MS }

async function run(device) {
  const phone = device === "phone"
  const ed = await openEditor({ kind: "imported", bundle, css, compat: await importedTheme({ store: true }), globals: `window.PROBE_WRITER=${JSON.stringify(WRITER)};`, cpu: CPU, width: phone ? 390 : 1440, height: phone ? 844 : 900, touch: phone, settle: 6000 })
  const page = ed.page
  try {
    console.log(`\n${device}, imported theme (router ${DECIDE_MS}ms, CPU ${CPU}x)`)
    if (phone) {
      await ed.js(() => [...document.querySelectorAll("button[aria-label='Ask Storelib']")].find((b) => b.getClientRects().length)?.click())
      await sleep(900)
    }
    const found = await ed.js(() => { const t = document.querySelector("[data-ask-pill] textarea") ?? [...document.querySelectorAll("[data-ask-view] textarea, [role=dialog] textarea")].filter((x) => x.getClientRects().length).pop(); if (!t) return false; t.focus(); return true })
    if (!found) throw new Error("no Ask box")
    await page.keyboard.type("Code a new section with a countdown timer")
    /* Where the person is reading: the foot of the page. */
    const inFrame = async (fn) => { const f = await ed.front(); return f ? f.evaluate(fn) : null }
    await inFrame(() => scrollTo(0, document.documentElement.scrollHeight))
    await sleep(600)
    /* The frame is another origin: read from inside it, timed by the probe (the frame swaps when the page is drawn again). */
    const start = Date.now()
    const sample = async () => {
      const got = await inFrame(() => {
        const spot = document.querySelector("[data-writing-section]")
        const r = spot?.getBoundingClientRect()
        const running = spot ? spot.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length : 0
        return { y: Math.round(scrollY), h: innerHeight, spot: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null, running }
      }).catch(() => null)
      return { t: Date.now() - start, ...(got ?? { y: 0, h: 0, spot: null, running: 0 }) }
    }
    const t0 = (await sample()).t
    await page.keyboard.press("Enter")
    const rows = []
    let shot = false
    for (let i = 0; i < 70; i++) {
      const r = await sample()
      rows.push(r)
      /* A picture of the spot once the glide has settled on it. */
      if (process.env.SHOTS && !shot && r.spot && r.spot.top > -200 && r.t - t0 > 1200) {
        shot = true
        await page.screenshot({ path: `${process.env.SHOTS}/write-imported-${device}-spot.png` })
      }
      await sleep(50)
    }
    const first = rows.find((r) => r.spot)
    const seen = rows.find((r) => r.spot && r.spot.top < r.h - 40 && r.spot.bottom > 40)
    let moves = 0, biggest = 0
    for (let i = 1; i < rows.length; i++) { const d = Math.abs(rows[i].y - rows[i - 1].y); if (d > 0) moves++; biggest = Math.max(biggest, d) }
    const distance = Math.abs(rows[rows.length - 1].y - rows[0].y)
    expect(!!first && first.t - t0 < Math.min(400, DECIDE_MS), "the spot is in the frame within 400ms of Enter, before the router answers", first ? Math.round(first.t - t0) : null)
    expect(!!seen, "the frame takes you to it", seen ? { at: Math.round(seen.t - t0), spot: seen.spot } : rows[rows.length - 1].spot)
    expect(moves >= 4 && (!distance || biggest / distance <= 0.5), "by a glide, not a jump", { samplesMoving: moves, distance, biggestStep: biggest })
    expect(!!seen && seen.running >= 3, "its lane of code is moving", seen?.running)
    /* Then the section takes the spot's place, in the frame, and is in view. */
    let landed = null
    for (let i = 0; i < 60 && !landed; i++) {
      await sleep(200)
      landed = await inFrame(() => { const el = document.querySelector("[data-section-type='probe_written']"); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, spot: !!document.querySelector("[data-writing-section]") } }).catch(() => null)
    }
    if (landed) await sleep(1200)
    const after = landed ? await inFrame(() => { const el = document.querySelector("[data-section-type='probe_written']"); const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, spot: !!document.querySelector("[data-writing-section]") } : null }).catch(() => null) : null
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/write-imported-${device}-landed.png` })
    expect(!!landed, "the written section takes the spot's place in the frame")
    expect(!!after && !after.spot && after.top < after.h - 40 && after.bottom > 40, "and is in view, the spot gone", after)
    expect(ed.errors.length === 0, "nothing thrown", ed.errors)
  } finally {
    await ed.close()
  }
}

for (const device of ["desktop", "phone"]) {
  if (ONLY && !ONLY.test(device)) continue
  try {
    await run(device)
  } catch (e) {
    console.log(`  FAIL  ${device} did not run: ${String(e).slice(0, 300)}`)
    broken++
  }
}
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
process.exit(broken && BUDGET ? 1 : 0)
