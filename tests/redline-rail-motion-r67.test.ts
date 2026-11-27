/**
 * Round 67, the owner on the Redline template (Kurb Club, templates/rail):
 * "really weird animations that are bugging, glitching and flashing, too
 * complex". The garment must open into the focus view smoothly, go back to
 * its place and turn back to its side smoothly when the view closes, the size
 * options must look and work right, and Fleece / Jersey must switch cleanly.
 *
 * This measures theme-packages/materia/base/sections/boutique-rail.liquid in
 * Chromium with the CPU slowed 4x, every animation frame sampled:
 *
 *   open      the copy that flies starts on the garment as it hangs and lands
 *             on the view's picture (within 2 px); in no frame is the garment
 *             missing (the copy, the hanger or the view's picture is always
 *             drawn at full opacity); its path never turns back
 *   close     it flies back onto its own hanger (within 2 px), and in the
 *             frame it lands the hanger shows it facing you, so nothing pops;
 *             then it turns to its side and stays there (no turn left stuck,
 *             no name left under the rail, focus coming back does not turn it)
 *   phone     side on, the garment cross-fades into the flying copy: in every
 *             frame one of the two is drawn at 90% or more
 *   switch    Fleece / Jersey: the section and what is under the rail do not
 *             move (0 px, every frame); the rail dips once and comes back, the
 *             garments of the new rail never drop or bounce one by one; a
 *             second press during the fade turns it round
 *   options   a size press always selects (the closest variant when the exact
 *             combination does not exist); the pieces it is worn with are 8 px
 *             apart
 *   reduced   with reduced motion nothing flies or fades
 *   source    the view opens as a popover (the page is not made inert, which
 *             restyled every element before the first frame), a modal dialog
 *             where popovers are missing; WAAPI keyframes animate transform and
 *             opacity only; the drop has no bounce and is not replayed; the
 *             scroll lock keeps the page's width
 *
 *   Run: tests/redline-rail-motion-r67.test.ts (needs Chromium at /opt/pw-browsers/chromium or $CHROMIUM for the browser part)
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer, { type Page } from "puppeteer-core"

import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { importTemplate, serve } from "../scripts/theme-templates/site"
import { auditSite } from "../scripts/theme-templates/fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : `\n       ${JSON.stringify(detail).slice(0, 600)}`}`)
}

const FILE = "theme-packages/materia/base/sections/boutique-rail.liquid"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
type Box = [number, number, number, number]
type Frame = { t: number; open: boolean; fly: Box | null; flyO: number; flyK: Box[] | null; flyP: number | null; hang: Box | null; media: Box | null; mediaVis: boolean; mediaO: number; picVis: boolean; picO: number; front: number; side: number; sideT: string; trackO: number; gO: number[]; gT: string[]; h: number; foot: number; track: string }

function source() {
  const src = readFileSync(FILE, "utf8")
  const script = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n")
  check("source: the focus view opens as a popover in the top layer, a modal dialog only where popovers are missing", /d\.showPopover\(\)/.test(script) && /setAttribute\('popover', 'manual'\)/.test(script) && /if \(this\._modal\) \{ d\.showModal\(\); return; \}/.test(script) && /aria-modal/.test(script))
  check("  Escape closes it and Tab stays inside it", /e\.key === 'Escape'/.test(script) && /e\.key !== 'Tab'/.test(script))
  const keys = [...script.matchAll(/\.animate\((\[[^\]]*\])/g)].flatMap((m) => [...m[1].matchAll(/(\w+):/g)].map((k) => k[1]))
  check("  every scripted animation moves transform and opacity only", keys.length > 10 && keys.every((k) => ["opacity", "transform", "offset"].includes(k)), [...new Set(keys)])
  check("  the garments' first drop has no bounce and is not replayed when a tab is opened", !/cubic-bezier\(\.34, 1\.4/.test(src) && !/is-leaving/.test(src) && /is-dropped/.test(src))
  check("  the scroll lock gives the scroll bar's width back instead of reserving a gutter (the page keeps its width)", !/scrollbar-gutter: stable/.test(src) && /innerWidth - document\.documentElement\.clientWidth/.test(script))
  check("  only the garment pointed at swings; its neighbours keep still", !/this\.push\(li\.previousElementSibling/.test(script) && !/will-change: rotate/.test(src))
  check("  a garment put in its facing pose while hidden takes it at once (is-snap), and coming back into focus does not turn it", /\.is-snap \.brail__pic img \{ transition: none !important; \}/.test(src) && /if \(!this\._refocus\) this\.hot\(li\)/.test(script))
  check("  reduced motion: transitions off in the section and no scripted motion", /@media \(prefers-reduced-motion: reduce\)/.test(src) && /if \(this\.calm\(\) \|\| !d\.animate\)/.test(script))
}

/* Every animation frame: the flying copy, the view's first picture, the garment on its hanger, the rail and what is under it. */
async function sampler(p: Page) {
  await p.evaluate(() => {
    const W = window as unknown as { __s: unknown[]; __on: boolean; __li: Element | null; __lt: number }
    W.__s = []; W.__on = false; W.__li = null; W.__lt = 0
    try { new PerformanceObserver((l) => { if (W.__on) W.__lt += l.getEntries().length }).observe({ type: "longtask" }) } catch { /* not measured */ }
    const rail = document.querySelector("boutique-rail")!, d = rail.querySelector("dialog")!
    const box = (r: DOMRect): [number, number, number, number] => [r.x, r.y, r.width, r.height]
    /* Where the copy's animation starts and ends, from its keyframes (translate(x, y) scale(s) from its top left corner):
       the compositor runs it to the end even while the page's own thread is busy, so this is what the screen shows. */
    const hangBox = (li: Element): [number, number, number, number] => {
      const pic = li.querySelector(".brail__pic")!, im = li.querySelector<HTMLImageElement>(".brail__front")!
      const pr = pic.getBoundingClientRect(), bw = im.offsetWidth, bh = im.offsetHeight, s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight)
      return [pr.left + im.offsetLeft + (bw - im.naturalWidth * s) / 2, pr.top + im.offsetTop, im.naturalWidth * s, im.naturalHeight * s]
    }
    const keys = (el: HTMLElement) => {
      const a = el.getAnimations()[0]; if (!a) return null
      const w = parseFloat(el.style.width), h = parseFloat(el.style.height)
      return (a.effect as KeyframeEffect).getKeyframes().filter((k) => k.transform).map((k) => { const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(String(k.transform))!; const sc = +m[3]; return [+m[1], +m[2], w * sc, h * sc] as [number, number, number, number] })
    }
    const tick = (t: number) => {
      if (W.__on) {
        const fly = d.querySelector(".bf__fly"), img = d.querySelector<HTMLImageElement>(".bf__slide img")!, li = W.__li
        const pic = li?.querySelector(".brail__pic"), track = rail.querySelector<HTMLElement>(".brail__track:not([hidden])")!
        const st = (e: Element | null | undefined) => (e ? getComputedStyle(e) : null)
        const gs = [...track.querySelectorAll(".brail__g")].slice(0, 6)
        W.__s.push({
          t, open: d.open, fly: fly ? box(fly.getBoundingClientRect()) : null, flyO: fly ? +st(fly)!.opacity : 0, flyK: fly ? keys(fly as HTMLElement) : null, flyP: fly ? (fly.getAnimations()[0]?.effect?.getComputedTiming().progress ?? null) : null,
          media: img.naturalWidth ? box(img.getBoundingClientRect()) : null, mediaVis: d.open && st(img)!.visibility === "visible", mediaO: +st(d.querySelector(".bf__media"))!.opacity,
          hang: li ? hangBox(li) : null, picVis: !!pic && st(pic)!.visibility === "visible", picO: pic ? +st(pic)!.opacity : 0,
          front: li ? +st(li.querySelector(".brail__front"))!.opacity : 0, side: li ? +st(li.querySelector(".brail__side"))!.opacity : 0, sideT: li ? st(li.querySelector(".brail__side"))!.transform : "",
          trackO: +st(track)!.opacity, gO: gs.map((g) => +st(g)!.opacity), gT: gs.map((g) => st(g)!.transform),
          h: rail.getBoundingClientRect().height, foot: rail.querySelector(".brail__foot")!.getBoundingClientRect().top - rail.getBoundingClientRect().top, track: track.dataset.track ?? "",
        })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
const record = (p: Page) => p.evaluate(() => { const W = window as unknown as { __s: unknown[]; __on: boolean; __lt: number }; W.__s = []; W.__lt = 0; W.__on = true })
const stop = (p: Page) => p.evaluate(() => { const W = window as unknown as { __s: Frame[]; __on: boolean; __lt: number }; W.__on = false; return { s: W.__s, lt: W.__lt } })
const near = (a: Box | null | undefined, b: Box | null | undefined, px = 2) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= px)
/* The garment as the rail draws it: its front view's box, the picture placed in it (object-fit: contain, from the top). */
const hangs = (p: Page) => p.evaluate(() => {
  const li = (window as unknown as { __li: Element }).__li, pic = li.querySelector(".brail__pic")!, im = li.querySelector<HTMLImageElement>(".brail__front")!
  const pr = pic.getBoundingClientRect(), bw = im.offsetWidth, bh = im.offsetHeight, s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight)
  return [pr.left + im.offsetLeft + (bw - im.naturalWidth * s) / 2, pr.top + im.offsetTop, im.naturalWidth * s, im.naturalHeight * s] as Box
})
const viewPicture = (p: Page) => p.evaluate(() => {
  const im = document.querySelector<HTMLImageElement>("boutique-rail .bf__slide img")!, r = im.getBoundingClientRect(), s = Math.min(r.width / im.naturalWidth, r.height / im.naturalHeight)
  const top = /(^|\s)0(%|px)?$/.test(getComputedStyle(im).objectPosition.trim())
  return [r.left + (r.width - im.naturalWidth * s) / 2, r.top + (top ? 0 : (r.height - im.naturalHeight * s) / 2), im.naturalWidth * s, im.naturalHeight * s] as Box
})
/* The copy's path only ever heads one way on each axis (1 px of rounding allowed). */
const oneWay = (xs: number[]) => { const d = xs.slice(1).map((v, i) => v - xs[i]); return d.every((v) => v >= -1) || d.every((v) => v <= 1) }

async function main() {
  source()
  const chrome = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { console.log("(no Chromium: the browser part is skipped)"); return }
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/rail`)
  const built = auditSite(imported, "rail", false)
  const served = await serve(built, join("scripts", "theme-templates", "products", "rail"))
  const fine = ["--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"]
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage", ...fine] })
  const errs: string[] = []
  const page = async (phone: boolean, reduce = false) => {
    const p = phone ? await (await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage"] })).newPage() : await browser.newPage()
    await p.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }])
    p.on("pageerror", (e) => errs.push(String(e)))
    await p.setRequestInterception(true)
    p.on("request", (r) => { if (/\/cart\/add\.js$/.test(new URL(r.url()).pathname)) void r.respond({ status: 200, contentType: "application/json", body: '{"items":[]}' }); else void r.continue() })
    await p.goto(`${served.base}/`, { waitUntil: "networkidle2", timeout: 90000 })
    await sleep(2200)
    await sampler(p)
    await p.emulateCPUThrottling(4)
    /* The second garment fully on screen: its button, and its place on screen. */
    const at = await p.evaluate((w) => {
      const items = [...document.querySelectorAll("boutique-rail .brail__track:not([hidden]) .brail__item")]
      const li = items.slice(1).find((x) => { const r = x.querySelector(".brail__g")!.getBoundingClientRect(); return r.left > 60 && r.right < w - 60 })!
      ;(window as unknown as { __li: Element }).__li = li
      const r = li.querySelector(".brail__g")!.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.45]
    }, phone ? 390 : 1280)
    return { p, at }
  }
  try {
    /* ── A computer: point, click, Escape ──────────────────────────── */
    {
      const { p, at } = await page(false)
      await p.mouse.move(at[0], at[1], { steps: 4 }); await sleep(900)
      const from = await hangs(p)
      await record(p)
      await p.mouse.click(at[0], at[1]); await sleep(1600)
      const open = await stop(p)
      const to = await viewPicture(p)
      const flies = open.s.filter((f) => f.fly)
      const k0 = flies[0]?.flyK
      check(`computer, open: the copy starts on the garment as it hangs (its first frame, within 2 px) and its flight ends on the view's picture (within 2 px) [${open.s.length} frames, ${open.lt} long tasks at 4x CPU]`, near(flies[0]?.fly, from) && near(k0?.[0], from) && near(k0?.[k0.length - 1], to), { first: flies[0]?.fly, from, keys: k0, to })
      const lastF = flies[flies.length - 1], prevF = flies[flies.length - 2]
      const dist = (a: Box, b: Box) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
      check("  the copy hands over to the view's picture without a jump (the last step is no bigger than the one before it)", !!lastF && !!prevF && dist(lastF.fly!, to) <= dist(prevF.fly!, lastF.fly!) + 1, { prev: prevF?.fly, last: lastF?.fly, to })
      const blank = open.s.filter((f) => !((f.fly && f.flyO >= 0.99) || (f.mediaVis && f.mediaO >= 0.99 && !f.fly) || (f.picVis && f.picO >= 0.99)))
      check("  in no frame is the garment missing or see-through (the copy, the hanger or the view's picture is drawn at full opacity)", blank.length === 0, blank.slice(0, 3))
      check("  its path never turns back (one way on each axis)", flies.length > 1 && [0, 1, 2, 3].every((k) => oneWay(flies.map((f) => f.fly![k]))), flies.map((f) => f.fly))
      check("  open, the hanger is empty and the copy is gone", await p.evaluate(() => document.querySelectorAll("boutique-rail .brail__item.is-lifted").length === 1 && !document.querySelector(".bf__fly") && document.querySelector<HTMLDialogElement>("boutique-rail dialog")!.open))

      /* The size pills: a combination that does not exist still selects the closest one. */
      const pick = await p.evaluate(() => {
        const rail = document.querySelector("boutique-rail") as unknown as { g: unknown; show: (i: number, d: number) => void; index: number; items: { _data: unknown }[]; variant: { id: string } }
        const li = rail.items[rail.index]
        li._data = { ...(li._data as object), options: ["Size", "Colour"], variants: [
          { id: "a", available: true, price: "$10", compare: null, options: ["S", "Black"] },
          { id: "b", available: true, price: "$10", compare: null, options: ["M", "Black"] },
          { id: "c", available: true, price: "$10", compare: null, options: ["L", "Olive"] },
        ] }
        rail.show(rail.index, 0)
        const vals = () => [...document.querySelectorAll<HTMLButtonElement>("boutique-rail .bf__val")]
        vals().find((b) => b.textContent === "L")!.click()
        const afterL = { id: rail.variant.id, pressed: vals().filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent) }
        vals().find((b) => b.textContent === "Black")!.click()
        const afterBlack = { id: rail.variant.id, pressed: vals().filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent) }
        const gap = getComputedStyle(document.querySelector("boutique-rail [data-f-pairs]")!).rowGap
        return { afterL, afterBlack, gap }
      })
      check("options: a size press always selects; L (only in olive) picks L olive, then Black picks the closest black one", pick.afterL.id === "c" && pick.afterL.pressed.join() === "L,Olive" && pick.afterBlack.id === "a" && pick.afterBlack.pressed.join() === "S,Black", pick)
      check("  the pieces it is worn with sit 8 px apart, not touching", pick.gap === "8px", pick.gap)

      /* Close with the pointer away from the rail. */
      await p.mouse.move(1270, 790); await sleep(300)
      await record(p)
      await p.keyboard.press("Escape"); await sleep(1500)
      const close = await stop(p)
      const home = await hangs(p)
      const back = close.s.filter((f) => f.fly)
      const kb = back[0]?.flyK
      const landed = close.s.findIndex((f, i) => i > 0 && !f.fly && !!close.s[i - 1].fly)
      /* Its hanger as the rail draws it in the frame it lands (still lifted a little, as it was when pointed at; it settles with the turn). */
      const hangAt = close.s[landed]?.hang
      check(`computer, close: the copy's flight starts where the view's picture is and ends on its own hanger as the rail draws it then (within 2 px) [${close.s.length} frames, ${close.lt} long tasks at 4x CPU]`, back.length > 1 && near(kb?.[0], to) && near(kb?.[kb.length - 1], hangAt), { keys: kb, to, hangAt, home })
      check("  the hanger takes over only once the flight has finished", landed > 0 && close.s.slice(0, landed).every((f) => !f.fly || !f.picVis), close.s.slice(landed - 2, landed + 1))
      check("  in the frame it lands, the hanger shows it facing you at full opacity: nothing pops", landed > 0 && close.s[landed].picVis && close.s[landed].front >= 0.99 && close.s[landed].side <= 0.01, close.s[landed])
      const gap = close.s.filter((f) => !((f.fly && f.flyO >= 0.99) || (f.mediaVis && f.mediaO >= 0.99 && !f.fly) || (f.picVis && f.picO >= 0.99)))
      check("  in no frame is the garment missing", gap.length === 0, gap.slice(0, 3))
      const after = close.s.slice(landed)
      check("  then it turns back to its side, steadily (the side view only ever comes in)", after.length > 1 && after.every((f, i) => i === 0 || f.side >= after[i - 1].side - 0.01), after.map((f) => f.side))
      const rest = await p.evaluate(() => { const li = (window as unknown as { __li: Element }).__li, side = getComputedStyle(li.querySelector(".brail__side")!); return { cls: li.className, side: +side.opacity, t: side.transform, front: +getComputedStyle(li.querySelector(".brail__front")!).opacity, naming: document.querySelector("boutique-rail")!.classList.contains("is-naming"), focused: document.activeElement === li.querySelector(".brail__g"), lock: document.documentElement.classList.contains("brail-lock") } })
      check("  and stays there: side on, no turn left stuck, no name left under the rail, though focus is back on its button", !/is-(hot|facing|lifted)/.test(rest.cls) && rest.side === 1 && rest.front === 0 && /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(rest.t) && !rest.naming && rest.focused && !rest.lock, rest)

      /* Fleece to Jersey */
      await p.mouse.move(4, 4); await sleep(600)
      await record(p)
      await (await p.$$("boutique-rail [data-tab]"))[1].click(); await sleep(1300)
      const sw = await stop(p)
      const h0 = sw.s[0].h, f0 = sw.s[0].foot
      check(`switch: the section and what is under the rail do not move (0 px, every frame) [${sw.s.length} frames, ${sw.lt} long tasks at 4x CPU]`, sw.s.every((f) => Math.abs(f.h - h0) < 0.5 && Math.abs(f.foot - f0) < 0.5), sw.s.map((f) => [f.h, f.foot]).slice(0, 6))
      const o = sw.s.map((f) => (f.track === "2" ? 1 : -1) * f.trackO)
      const low = sw.s.findIndex((f) => f.track === "2")
      const out = sw.s.slice(0, low).map((f) => f.trackO), inn = sw.s.slice(low).map((f) => f.trackO)
      check("  the rail dips once and comes back: Fleece only fades out, then Jersey only fades in, to full", low > 0 && out.every((v, i) => i === 0 || v <= out[i - 1] + 0.01) && inn.every((v, i) => i === 0 || v >= inn[i - 1] - 0.01) && inn[inn.length - 1] === 1, o)
      check("  Jersey's garments come in whole, together: none drops or bounces on its own", sw.s.slice(low).every((f) => f.gO.every((v) => v === 1) && f.gT.every((t) => t === "none")), sw.s[low])
      check("  Jersey shows its eleven pieces", (await p.evaluate(() => document.querySelectorAll("boutique-rail .brail__track:not([hidden]) .brail__item").length)) === 11)
      /* Pressed back during the fade: it turns round from where it is. */
      await (await p.$$("boutique-rail [data-tab]"))[0].click(); await sleep(60)
      await (await p.$$("boutique-rail [data-tab]"))[1].click(); await sleep(1200)
      const turned = await p.evaluate(() => ({ pressed: [...document.querySelectorAll("boutique-rail [data-tab]")].map((b) => b.getAttribute("aria-pressed")), shown: document.querySelector<HTMLElement>("boutique-rail .brail__track:not([hidden])")!.dataset.track, opacity: getComputedStyle(document.querySelector("boutique-rail .brail__track:not([hidden])")!).opacity, count: document.querySelectorAll("boutique-rail .brail__track:not([hidden])").length }))
      check("  a second press during the fade turns it round: the tab pressed last is the rail shown, at full opacity", turned.pressed.join() === "false,true" && turned.shown === "2" && turned.opacity === "1" && turned.count === 1, turned)
      await p.close()
    }

    /* ── A phone: tap, close button ────────────────────────────────── */
    {
      const { p, at } = await page(true)
      await record(p)
      await p.touchscreen.tap(at[0], at[1]); await sleep(1600)
      const open = await stop(p)
      const fade = open.s.filter((f) => !f.open || f.fly || f.picVis)
      const thin = fade.filter((f) => Math.max(f.fly ? f.flyO : 0, f.picVis ? f.picO : 0, f.mediaVis && !f.fly ? f.mediaO : 0) < 0.9)
      check(`phone, open: side on, the garment cross-fades into the flying copy, one of them drawn at 90% or more in every frame [${open.s.length} frames, ${open.lt} long tasks at 4x CPU]`, open.s.some((f) => f.fly) && thin.length === 0, thin.slice(0, 3))
      await record(p)
      await p.tap("boutique-rail [data-f-close]"); await sleep(1600)
      const close = await stop(p)
      const home = await hangs(p)
      const back = close.s.filter((f) => f.fly)
      const kp = back[0]?.flyK
      const landedP = close.s.findIndex((f, i) => i > 0 && !f.fly && !!close.s[i - 1].fly)
      check(`phone, close: its flight ends on its own hanger (within 2 px), where it still is after the turn [${close.s.length} frames, ${close.lt} long tasks at 4x CPU]`, back.length > 1 && near(kp?.[kp.length - 1], close.s[landedP]?.hang) && near(kp?.[kp.length - 1], home), { keys: kp, home, at: close.s[landedP]?.hang })
      const rest = await p.evaluate(() => { const li = (window as unknown as { __li: Element }).__li; return { cls: li.className, side: +getComputedStyle(li.querySelector(".brail__side")!).opacity, naming: document.querySelector("boutique-rail")!.classList.contains("is-naming") } })
      check("  side on again, and no name left under the rail", !/is-(hot|facing|lifted)/.test(rest.cls) && rest.side === 1 && !rest.naming, rest)
      await p.browser().close()
    }

    /* ── Reduced motion ────────────────────────────────────────────── */
    {
      const { p, at } = await page(false, true)
      await record(p)
      await p.mouse.click(at[0], at[1]); await sleep(900)
      await p.keyboard.press("Escape"); await sleep(700)
      await (await p.$$("boutique-rail [data-tab]"))[1].click(); await sleep(700)
      const r = await stop(p)
      check("reduced motion: nothing flies, and the rails switch without a fade", r.s.every((f) => !f.fly) && r.s.every((f) => f.trackO === 1) && r.s.some((f) => f.open) && r.s.some((f) => f.track === "2"), r.s.filter((f) => f.fly || f.trackO !== 1).slice(0, 2))
      await p.close()
    }
    check("no script errors", errs.length === 0, errs)
  } finally {
    await browser.close()
    served.server.close()
  }
}

main()
  .catch((e) => { failed++; console.error(e) })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  })
