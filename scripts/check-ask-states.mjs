/**
 * ===========================================================================
 *  ASK STORELIB'S STEPS AND THE CANVAS SHEEN, MEASURED
 * ===========================================================================
 * The real StepsTimeline and ActivityLine (components/website-builder/
 * ask-activity.tsx), fed line by line through the chat's own reducer, and
 * the real AiWorkingOverlay over a scrolling canvas of stand in sections,
 * mounted by scripts/render-ask-states.tsx in headless Chromium with the
 * app's stylesheet.
 *
 *   STEPS     a scripted run, one stream line at a time. After every line,
 *             once its animation is over, the top of every row that was
 *             already listed is compared with where it was: each must be
 *             0 px from where it was. Layout shift entries are counted too.
 *             Then the durations of every animation a row runs, and the
 *             fold when the run ends.
 *   SHEEN     the overlay laid over a section: where it sits against the
 *             section, that it and its sheen are pointer-events none, that
 *             a press at its centre reaches the section's own button and a
 *             wheel over it scrolls the canvas, the sheen's opacity range
 *             sampled across a whole sweep, the gradient's strongest stop,
 *             and that the sweep moves by transform only.
 *   SETTLE    the ring a changed section gets when the run ends, and its
 *             duration.
 *   REDUCED   the same under prefers-reduced-motion: no animation runs, the
 *             sheen is a still tint.
 *
 *   node scripts/check-ask-states.mjs        (PROBE_CSS=source without a build)
 *
 * Exits 1 when a number is out of bounds, and says which.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the page ───────────────────────────────────────────────────────────── */
const stubs = join(root, ".ask-states-probe")
mkdirSync(stubs, { recursive: true })
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face)")
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-ask-states.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": "." },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const PRELUDE = `window.__shifts = [];
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) window.__shifts.push(e.value) }) }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}`
writeFileSync(
  join(stubs, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;display:flex;gap:24px;padding:16px;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style><script>${PRELUDE}</script></head><body><div id="chat" style="background:#fff;border-radius:16px;align-self:flex-start"></div><div id="canvas"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
)
const url = `file://${join(stubs, "index.html")}`

/* ── a run, line by line ────────────────────────────────────────────────── */
const FILE = "faq_accordion_custom.storelib"
const STREAM = [
  { type: "progress", phase: "reading", label: "Reading the page" },
  { type: "progress", phase: "planning", label: "Planning" },
  { type: "plan", text: "Read the Questions section.\nSoften its open animation in its code.\nCheck it compiles." },
  { type: "step", id: "c1", label: "Reading the Questions section", state: "running", sections: ["faq"] },
  { type: "step", id: "c1", label: "Reading the Questions section", state: "done" },
  { type: "step", id: "c2", label: `Reading ${FILE}`, state: "running" },
  { type: "step", id: "c2", label: `Reading ${FILE}`, state: "done" },
  { type: "step", id: "c3", label: `Editing ${FILE}`, state: "running", sections: ["faq"] },
  { type: "progress", phase: "writing", label: `Writing ${FILE}` },
  { type: "step", id: "c3:check", label: "Checking it compiles", state: "running", sections: ["faq"] },
  { type: "step", id: "c3:check", label: "Checking it compiles", state: "failed", sections: ["faq"] },
  { type: "step", id: "c3", label: `Editing ${FILE}`, state: "failed", sections: ["faq"] },
  { type: "thinking", text: "Line 41 needs its tag closed. Fixing that." },
  { type: "step", id: "c4", label: `Fixing ${FILE}`, state: "running", sections: ["faq"] },
  { type: "step", id: "c4:check", label: "Checking it compiles", state: "running", sections: ["faq"] },
  { type: "step", id: "c4:check", label: "Checking it compiles", state: "done", sections: ["faq"] },
  { type: "progress", phase: "saving", label: `Saving ${FILE}` },
  { type: "code", path: `sections/${FILE}`, source: "<template>\n<section class=\"s\">\n  …\n</section>\n</template>\n<style>\n.qa { transition: grid-template-rows 320ms ease; }\n</style>" },
  { type: "step", id: "c4", label: `Fixing ${FILE}`, state: "done", sections: ["faq"] },
  { type: "step", id: "c5", label: "Adding to the Questions section", state: "running", sections: ["faq"] },
  { type: "op", op: { kind: "add_block", sectionId: "faq", blockId: "b1", blockType: "question" }, label: "Added to Questions" },
  { type: "step", id: "c5", label: "Adding to the Questions section", state: "done", sections: ["faq"] },
  { type: "step", id: "c6", label: "Adding to the Questions section", state: "running", sections: ["faq"] },
  { type: "step", id: "c6", label: "Adding to the Questions section", state: "done", sections: ["faq"] },
  { type: "progress", phase: "checking", label: "Checking contrast" },
  { type: "progress", phase: "done", label: "Done", detail: "Calmed the questions.", sections: ["Questions"] },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  /* ── STEPS ──────────────────────────────────────────────────────────── */
  console.log("\nSTEPS  (a scripted run of " + STREAM.length + " lines)")
  {
    const p = await browser.newPage()
    await p.setViewport({ width: 1180, height: 900 })
    await p.goto(url, { waitUntil: "load" })
    await p.waitForFunction(() => typeof window.__push === "function")
    const rowsNow = () =>
      p.evaluate(() =>
        [...document.querySelectorAll("[data-ask-steps] > li")].map((li) => ({ key: li.getAttribute("data-row"), top: li.getBoundingClientRect().top, h: li.getBoundingClientRect().height })),
      )
    let before = []
    let worst = 0
    const moved = []
    const durations = new Map()
    const heights = new Set()
    for (const [i, line] of STREAM.entries()) {
      await p.evaluate((l) => window.__push(l), line)
      /* Every animation a row runs, as it starts. */
      const anims = await p.evaluate(() =>
        document.getAnimations().map((a) => ({ name: a.animationName ?? a.transitionProperty ?? "", ms: Number(a.effect?.getTiming?.().duration) || 0, iter: a.effect?.getTiming?.().iterations })),
      )
      for (const a of anims) if (a.name) durations.set(a.name, { ms: a.ms, iterations: a.iter })
      await sleep(320)
      const after = await rowsNow()
      for (const row of after) if (row.key && !row.key.startsWith("code:") && row.key !== "plan") heights.add(Math.round(row.h * 100) / 100)
      for (const was of before) {
        const now = after.find((r) => r.key === was.key)
        if (!now) {
          moved.push(`line ${i + 1}: row ${was.key} disappeared`)
          continue
        }
        const d = Math.abs(now.top - was.top)
        worst = Math.max(worst, d)
        if (d > 0) moved.push(`line ${i + 1} (${line.type}): ${was.key} moved ${d.toFixed(2)}px`)
      }
      before = after
    }
    const shifts = await p.evaluate(() => window.__shifts.reduce((a, b) => a + b, 0))
    expect(worst === 0, "no row already listed moves when a line arrives (largest jump, px)", worst)
    if (moved.length) console.log(`        ${moved.slice(0, 6).join("\n        ")}`)
    expect(shifts === 0, "layout shift score while the run streams", Number(shifts.toFixed(4)))
    expect(heights.size === 1, "every step row is the same height, whatever it says (px)", [...heights])
    const final = await rowsNow()
    const labels = await p.evaluate(() => [...document.querySelectorAll("[data-ask-steps] .ask-step-label")].map((l) => l.textContent))
    expect(labels.every((l) => !/_[a-z]/.test(l.replace(/[a-z0-9_]+\.storelib/g, ""))), "no row is a raw tool name", labels)
    expect(labels.filter((l) => l === "Adding to the Questions section").length === 1, "a repeated step is one row that counts", await p.evaluate(() => document.querySelector(".ask-step-count")?.textContent ?? null))
    expect(final.length >= 10, "rows listed by the end", final.length)
    const marks = await p.evaluate(() => ({
      checks: document.querySelectorAll('.ask-step-mark[data-state="done"] svg').length,
      running: document.querySelectorAll('.ask-step-mark[data-state="running"]').length,
      failed: document.querySelectorAll('.ask-step[data-step="failed"]').length,
      colour: getComputedStyle(document.querySelector('.ask-step-mark[data-state="done"]')).color,
    }))
    expect(marks.running <= 1, "one step running at a time", marks)
    expect(marks.colour === "rgb(139, 92, 246)", "the check is the builder's violet", marks.colour)
    const want = { "ask-step-in": 240, "ask-check-in": 260, "ask-step-breathe": 1600, "ask-line-in": 280 }
    for (const [name, ms] of Object.entries(want)) {
      const got = durations.get(name)
      expect(!!got && got.ms === ms, `${name} runs ${ms}ms`, got ?? "never ran")
    }
    const fold = await p.evaluate(() => getComputedStyle(document.querySelector("[data-ask-steps-fold]")).transitionDuration)
    expect(/0\.28s/.test(fold), "the fold animates its own height over 280ms", fold)

    /* The run ends: the list folds away. */
    const foldStart = await p.evaluate(() => document.querySelector("[data-ask-steps-fold]").getBoundingClientRect().height)
    await p.evaluate(() => window.__finish())
    const samples = []
    for (let t = 0; t <= 420; t += 60) {
      samples.push(Math.round(await p.evaluate(() => document.querySelector("[data-ask-steps-fold]")?.getBoundingClientRect().height ?? -1)))
      await sleep(60)
    }
    expect(samples[samples.length - 1] === 0 && samples.some((h) => h > 0 && h < foldStart), "when it ends the steps fold away smoothly (height samples, px)", [Math.round(foldStart), ...samples])
    await p.close()
  }

  /* ── SHEEN ──────────────────────────────────────────────────────────── */
  console.log("\nSHEEN  (the overlay on the section being worked on)")
  {
    const p = await browser.newPage()
    await p.setViewport({ width: 1180, height: 900 })
    await p.goto(url, { waitUntil: "load" })
    await p.waitForFunction(() => typeof window.__work === "function")
    await p.evaluate(() => document.getElementById("wb-preview-root").scrollTo(0, 300))
    await p.evaluate(() => window.__work(["faq"]))
    await p.waitForSelector('[data-ai-work="working"]')
    await sleep(80)
    const fit = await p.evaluate(() => {
      const box = document.querySelector('[data-ai-work="working"]').getBoundingClientRect()
      const sec = document.getElementById("wb-section-faq").getBoundingClientRect()
      return [box.left - sec.left, box.top - sec.top, box.width - sec.width, box.height - sec.height].map((n) => Math.round(n * 100) / 100)
    })
    expect(fit.every((n) => n === 0), "laid exactly over the section (dx, dy, dw, dh in px)", fit)
    const pe = await p.evaluate(() => {
      const box = document.querySelector('[data-ai-work="working"]')
      return { layer: getComputedStyle(box.parentElement).pointerEvents, box: getComputedStyle(box).pointerEvents, sheen: getComputedStyle(box, "::before").pointerEvents }
    })
    expect(pe.layer === "none" && pe.box === "none" && pe.sheen === "none", "pointer-events none on the layer, the box and the sheen", pe)
    const hit = await p.evaluate(() => {
      const sec = document.getElementById("wb-section-faq").getBoundingClientRect()
      const el = document.elementFromPoint(sec.left + sec.width / 2, sec.top + sec.height / 2)
      return el?.closest("[data-hit]")?.getAttribute("data-hit") ?? el?.tagName
    })
    expect(hit === "faq", "a press at its centre reaches the section's own button", hit)
    const scrolled = await p.evaluate(() => document.getElementById("wb-preview-root").scrollTop)
    const sec = await p.evaluate(() => {
      const r = document.getElementById("wb-section-faq").getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await p.mouse.move(sec.x, sec.y)
    await p.mouse.wheel({ deltaY: 160 })
    await sleep(250)
    const scrolledAfter = await p.evaluate(() => document.getElementById("wb-preview-root").scrollTop)
    expect(scrolledAfter > scrolled, "a wheel over it scrolls the canvas (scrollTop before, after)", [scrolled, scrolledAfter])
    const sheen = await p.evaluate(() => {
      const box = document.querySelector('[data-ai-work="working"]')
      const anim = document.getAnimations().find((a) => a.effect?.target === box && a.effect?.pseudoElement === "::before")
      const frames = anim?.effect?.getKeyframes?.() ?? []
      return {
        name: anim?.animationName,
        ms: Number(anim?.effect?.getTiming?.().duration),
        /* Infinity does not survive the trip back as JSON: said here as a boolean. */
        forever: anim?.effect?.getTiming?.().iterations === Infinity,
        props: [...new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k))))],
        background: getComputedStyle(box, "::before").backgroundImage,
      }
    })
    expect(sheen.name === "wb-ai-sheen" && sheen.ms === 2400 && sheen.forever, "the sheen sweeps every 2.4s while it works", { name: sheen.name, ms: sheen.ms, forever: sheen.forever })
    expect(sheen.props.every((k) => k === "transform" || k === "opacity"), "and moves by transform and opacity only", sheen.props)
    const alphas = [...sheen.background.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => Number(m[1].split(",")[3] ?? 1))
    const strongest = Math.max(...alphas)
    expect(strongest <= 0.25, "the strongest stop of its gradient (alpha)", strongest)
    const opacities = []
    for (let t = 0; t < 2600; t += 50) {
      opacities.push(await p.evaluate(() => Number(getComputedStyle(document.querySelector('[data-ai-work="working"]'), "::before").opacity)))
      await sleep(50)
    }
    const lo = Math.min(...opacities)
    const hi = Math.max(...opacities)
    /* Sampled every 50ms, so the 0 at each end of a sweep is caught within a frame of it. */
    expect(lo < 0.02 && hi > 0.4 && hi <= 0.5, "its opacity across one sweep (min, max)", [Number(lo.toFixed(3)), Number(hi.toFixed(3))])
    expect(strongest * hi <= 0.12, "so at most this much of anything is laid over the section (alpha x opacity)", Number((strongest * hi).toFixed(3)))

    /* ── SETTLE ── */
    console.log("\nSETTLE  (the section it changed, when the run ends)")
    await p.evaluate(() => {
      window.__work([])
      window.__settle(["faq"])
    })
    await p.waitForSelector('[data-ai-work="settled"]')
    const ring = await p.evaluate(() => {
      const box = document.querySelector('[data-ai-work="settled"]')
      const anim = document.getAnimations().find((a) => a.effect?.target === box && a.effect?.pseudoElement === "::after")
      return { name: anim?.animationName, ms: Number(anim?.effect?.getTiming?.().duration), shadow: getComputedStyle(box, "::after").boxShadow, sheen: document.getAnimations().some((a) => a.effect?.target === box && a.effect?.pseudoElement === "::before") }
    })
    expect(ring.name === "wb-ai-settle" && ring.ms === 1400, "a violet ring fades out once over 1.4s", ring)
    expect(/139, 92, 246/.test(ring.shadow) && !ring.sheen, "in the builder's violet, with the sheen gone", ring.shadow)
    await p.close()
  }

  /* ── REDUCED ────────────────────────────────────────────────────────── */
  console.log("\nREDUCED MOTION")
  {
    const p = await browser.newPage()
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.setViewport({ width: 1180, height: 900 })
    await p.goto(url, { waitUntil: "load" })
    await p.waitForFunction(() => typeof window.__work === "function")
    await p.evaluate(() => window.__work(["faq"]))
    for (const line of STREAM.slice(0, 8)) await p.evaluate((l) => window.__push(l), line)
    await p.waitForSelector('[data-ai-work="working"]')
    await sleep(120)
    const still = await p.evaluate(() => ({
      running: document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName ?? a.transitionProperty),
      sheen: Number(getComputedStyle(document.querySelector('[data-ai-work="working"]'), "::before").opacity),
    }))
    expect(still.running.filter((n) => /^(ask-step|ask-check|wb-ai)/.test(n)).length === 0, "no step or sheen animation runs", still.running)
    expect(still.sheen === 0.35, "the sheen is a still tint", still.sheen)
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} out of bounds` : "\nall in bounds")
process.exit(broken ? 1 : 0)
