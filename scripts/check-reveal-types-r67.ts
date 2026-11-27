/**
 * ===========================================================================
 *  EVERY "WHEN A SECTION SCROLLS INTO VIEW" TYPE, MEASURED (round 67)
 * ===========================================================================
 *   npx tsx scripts/check-reveal-types-r67.ts
 *     TEMPLATE=clothing   which Materia template's home page
 *     TYPES=a,b           only these types (default: every option of the schema)
 *
 * The options are read from the theme's own settings_schema.json (Animations
 * > scroll_animation), so a type added there is measured here without an
 * edit. For each, the live site's own handler draws the home page, the page
 * is scrolled down a screen at a time like a wheel, and every element that
 * waits for its reveal (and every part or word of it) is read on every frame:
 *
 *   hidden first   below the first screen it waits at its first frame (armed)
 *   once           its reveal keyframes start once, never twice
 *   final state    afterwards opacity 1, no transform, filter or clip left,
 *                  nothing waiting
 *   no jump        the last frame it moved and the first frame at rest are
 *                  within 0.04 opacity and 1.5px
 *   properties     what its keyframes move: opacity and transform only
 *                  (filter for the blur types and Cinematic, clip-path for
 *                  the mask on pictures, named in the report)
 *   reduced motion with prefers-reduced-motion: reduce nothing is armed,
 *                  nothing moves and everything shows
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { serveLive } from "./check-builder-nav19"

const TEMPLATE = process.env.TEMPLATE ?? "clothing"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== "" ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}
const schema = JSON.parse(readFileSync("theme-packages/materia/base/config/settings_schema.json", "utf8")) as { settings?: { id?: string; options?: { value: string }[] }[] }[]
const ALL = schema.flatMap((g) => g.settings ?? []).find((s) => s.id === "scroll_animation")!.options!.map((o) => o.value).filter((v) => v !== "none")
const TYPES = process.env.TYPES ? process.env.TYPES.split(",") : ALL

async function zipWith(settings: Record<string, unknown>): Promise<JSZip> {
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${TEMPLATE}`))
  const data = JSON.parse(await zip.file("config/settings_data.json")!.async("string")) as { current: Record<string, unknown> }
  Object.assign(data.current, settings)
  zip.file("config/settings_data.json", JSON.stringify(data))
  return zip
}

/** Every frame: each element that waits for a reveal, and its parts and words. */
const WATCH = `(() => {
  const w = window; w.__rt = { els: new Map(), starts: new Map(), props: new Set(), shifts: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.__rt.shifts += e.value }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}
  document.addEventListener("animationstart", (e) => {
    if (!/^reveal/i.test(e.animationName)) return;
    const t = e.target; if (!(t instanceof Element)) return;
    try { for (const a of t.getAnimations()) if (a.animationName === e.animationName) for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) w.__rt.props.add(p) } catch (x) {}
  }, true);
  const num = (m) => { if (!m || m === "none") return [0, 0, 1]; const v = m.match(/-?[\\d.e]+/g).map(Number); return v.length === 6 ? [v[4], v[5], Math.hypot(v[0], v[1])] : [v[12] || 0, v[13] || 0, Math.hypot(v[0], v[1])]; };
  const tick = () => {
    const list = document.querySelectorAll(".scroll-trigger--armed, .scroll-trigger--armed [data-reveal-part], .scroll-trigger--armed .mt-word, [data-rt-seen]");
    for (const el of list) {
      if (el.classList.contains("reveal-parts") || el.getAttribute("data-reveal-part") === "words") continue;
      el.setAttribute("data-rt-seen", "");
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const on = b.bottom > 0 && b.top < innerHeight && b.width > 0;
      let s = w.__rt.els.get(el);
      if (!s) w.__rt.els.set(el, s = { what: el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40), frames: [], armedSeen: false, runs: 0, lastPlaying: false });
      const armed = el.closest(".scroll-trigger--armed");
      const waiting = !!(armed && armed.classList.contains("scroll-trigger--offscreen"));
      const playing = !!armed && !waiting;
      if (waiting) s.armedSeen = true;
      if (playing && !s.lastPlaying) s.runs++;
      s.lastPlaying = playing;
      const [x, y, sc] = num(cs.transform);
      if (on) s.frames.push({ o: +cs.opacity, x, y, sc, f: cs.filter, c: cs.clipPath, playing, waiting, done: !armed });
      if (s.frames.length > 400) s.frames.shift();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`

async function wheelDown(page: Page, steps: number, dy: number) {
  for (let i = 0; i < steps; i++) { await page.mouse.wheel({ deltaY: dy }); await sleep(110) }
}

type Frame = { o: number; x: number; y: number; sc: number; f: string; c: string; playing: boolean; waiting: boolean; done: boolean }
type El = { what: string; frames: Frame[]; armedSeen: boolean; runs: number }

async function one(browser: Browser, type: string, reduced: boolean) {
  const { server, base } = await serveLive(undefined, await zipWith({ scroll_animation: type, zoom_image: false }))
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 1440, height: 900 })
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    await page.evaluateOnNewDocument(WATCH)
    await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 60000 })
    await sleep(700)
    const armed = await page.evaluate(() => document.querySelectorAll(".scroll-trigger--armed").length)
    await page.mouse.move(720, 450)
    await wheelDown(page, 40, 160)
    await sleep(3200)
    const r = await page.evaluate(() => {
      const rt = (window as unknown as { __rt: { els: Map<Element, El>; props: Set<string>; shifts: number } }).__rt
      const els = [...rt.els.values()]
      const left = [...document.querySelectorAll(".scroll-trigger--armed, .scroll-trigger--offscreen, [data-reveal-part], .mt-word, [data-reveal-zoom]")].length
      const notFinal = [...document.querySelectorAll<HTMLElement>("[data-rt-seen]")].filter((e) => { const cs = getComputedStyle(e); return +cs.opacity < 0.999 || (cs.filter !== "none" && cs.filter !== "") || cs.clipPath !== "none" || (cs.transform !== "none" && !e.style.transform && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(cs.transform)) }).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)} o=${getComputedStyle(e).opacity} t=${getComputedStyle(e).transform}`)
      const jumps: string[] = []
      for (const s of els) {
        const fr = s.frames
        for (let i = 1; i < fr.length; i++) {
          if (fr[i - 1].playing && fr[i].done) {
            const a = fr[i - 1], b = fr[i]
            const d = Math.max(Math.abs(a.o - b.o) / 0.04, Math.abs(a.x - b.x) / 1.5, Math.abs(a.y - b.y) / 1.5, Math.abs(a.sc - b.sc) / 0.01)
            if (d > 1) jumps.push(`${s.what} o ${a.o.toFixed(2)}->${b.o.toFixed(2)} y ${a.y.toFixed(1)}->${b.y.toFixed(1)} s ${a.sc.toFixed(3)}->${b.sc.toFixed(3)}`)
          }
        }
      }
      const moved = els.filter((s) => s.frames.some((f) => f.playing))
      const minO = moved.length ? Math.min(...moved.flatMap((s) => s.frames.filter((f) => f.playing).map((f) => f.o))) : 1
      return {
        tracked: els.length, moved: moved.length, armedSeen: els.filter((s) => s.armedSeen).length,
        twice: els.filter((s) => s.runs > 1).map((s) => `${s.what} x${s.runs}`).slice(0, 3),
        left, notFinal: notFinal.slice(0, 3), notFinalCount: notFinal.length, jumps: jumps.slice(0, 3), jumpCount: jumps.length,
        props: [...rt.props].sort(), minO: +minO.toFixed(2), cls: +rt.shifts.toFixed(3),
        anims: document.getAnimations().filter((a) => /^reveal/i.test((a as CSSAnimation).animationName ?? "")).length,
      }
    })
    return { armed, ...r }
  } finally {
    await page.close()
    server.close()
  }
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  console.log(`${TEMPLATE}, 1440x900, types from the schema: ${ALL.join(", ")}`)
  for (const type of TYPES) {
    const r = await one(browser, type, false)
    const allowed = new Set(["opacity", "transform", ...(/blur|cinematic/.test(type) ? ["filter"] : []), ...(/mask/.test(type) ? ["clipPath"] : [])])
    const extra = r.props.filter((p) => !allowed.has(p))
    console.log(`\n${type}: ${r.armed} armed, ${r.moved} moved, moves ${r.props.join("+") || "nothing"}, lowest opacity ${r.minO}, CLS ${r.cls}`)
    check(`${type}: starts hidden below the first screen and reveals as it is scrolled to`, r.armed > 0 && r.moved > 0 && r.armedSeen > 0, { armed: r.armed, moved: r.moved })
    check(`${type}: reveals once`, r.twice.length === 0, r.twice)
    check(`${type}: ends at its final state, nothing left waiting`, r.left === 0 && r.notFinalCount === 0 && r.anims === 0, { left: r.left, notFinal: r.notFinal, anims: r.anims })
    check(`${type}: no jump at the end`, r.jumpCount === 0, r.jumps)
    check(`${type}: moves ${[...allowed].join(" and ")} only`, extra.length === 0, extra)
    check(`${type}: no layout shift`, r.cls < 0.02, r.cls)
    const q = await one(browser, type, true)
    check(`${type}: reduced motion, nothing waits or moves and all shows`, q.armed === 0 && q.moved === 0 && q.notFinalCount === 0, { armed: q.armed, moved: q.moved, notFinal: q.notFinal })
  }
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
