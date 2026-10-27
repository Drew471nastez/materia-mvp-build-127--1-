/**
 * ===========================================================================
 *  MATERIA IN THE EDITOR: AN EDIT KEEPS THE SLIDE AND THE SCROLL (round 25)
 * ===========================================================================
 *   MATERIA=/path/to/materia [MATERIA_REV=b6cabaa] npx tsx scripts/check-materia-editor.ts
 *
 * The real editor (scripts/editor-probe-harness.mjs) with the Materia theme
 * as its repository holds it, on a desktop and a phone. The home page's
 * slideshow (a Swiper) is moved to its second slide and the content tabs'
 * track scrolled along, then each section gets an edit that draws it again
 * whole (a setting printed in a data- attribute, canvas-bridge.ts swap).
 * Read on every frame after the edit:
 *
 *   SLIDE   the new slideshow is on the slide the old one was on
 *   TRACK   the new track is scrolled where the old one was
 *   PAGE    the canvas page did not move
 *
 * and how many frames showed anything else on the way.
 */
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { pagesFromPackageFiles } from "../lib/website-builder/theme-pages"
import { editorFor } from "./check-builder-nav19"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const DIR = process.env.MATERIA ?? "/home/user/drew471nastez/materia"
const REV = process.env.MATERIA_REV ?? "b6cabaa"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
}

function repoFiles(): Record<string, string> {
  const git = (...a: string[]) => execFileSync("git", ["-C", DIR, ...a], { maxBuffer: 1 << 28 }).toString()
  const out: Record<string, string> = {}
  for (const path of git("ls-tree", "-r", "--name-only", REV).split("\n").filter(Boolean)) {
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|woff2?|ttf|otf|eot)$/i.test(path) || /^(tests|docs)\//.test(path)) continue
    out[path] = git("show", `${REV}:${path}`)
  }
  return out
}

async function main() {
  const files = repoFiles()
  const installed = { files, settings: JSON.parse(files["config/settings.json"]) as Record<string, unknown>, pages: pagesFromPackageFiles(files) }
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  for (const [label, w, h, touch] of [["desktop", 1440, 900, false], ["phone", 390, 844, true]] as const) {
  console.log(`\n${label} ${w}x${h}`)
  const ed = await editorFor(browser, w, h, touch, undefined, undefined, installed)
  const frame = await ed.frame()
  await ed.page.waitForSelector("[data-canvas-placeholder='gone']", { timeout: 20000 }).catch(() => console.log("no placeholder gone"))
  await sleep(2500)
  const redraw = (id: string) => ed.page.evaluate((id: string) => {
    const f = document.querySelector<HTMLIFrameElement>("[data-compat-frame='front']")
    const doc = new DOMParser().parseFromString(f!.srcdoc, "text/html")
    const from = doc.querySelector(`.shopify-section[data-section-id="${id}"]`) ?? doc.getElementById(`shopify-section-${id}`)
    if (!f?.contentWindow || !from) return false
    const prev = from.outerHTML
    /* A setting printed in a data- attribute, the way a theme's script reads it (autoplay, a speed): the section is drawn again whole. */
    const host = from.querySelector(".swiper, .ctabs__track") ?? from.firstElementChild ?? from
    host.setAttribute("data-probe-edit", String(Date.now()))
    f.contentWindow.postMessage({ storelib: 1, type: "section", id, html: from.outerHTML, prev }, "*")
    return true
  }, id)
  const state = () => frame.evaluate(() => {
    const show = document.getElementById("shopify-section-slideshow_dETpFq")
    const sw = show?.querySelector<HTMLElement>(".swiper") as unknown as { swiper?: { activeIndex: number; realIndex: number } } | null
    const tabs = document.getElementById("shopify-section-content_tabs_6wGCed")
    const track = tabs?.querySelector<HTMLElement>(".ctabs__track")
    return { slide: sw?.swiper?.realIndex ?? null, showNew: !(show as unknown as { __old?: boolean })?.__old, track: track ? Math.round(track.scrollLeft) : null, tabsNew: !(tabs as unknown as { __old?: boolean })?.__old, y: Math.round(scrollY) }
  })
  await frame.evaluate(() => {
    const sw = document.querySelector("#shopify-section-slideshow_dETpFq .swiper") as unknown as { swiper: { slideToLoop?: (i: number, s: number) => void; slideTo: (i: number, s: number) => void } }
    if (sw.swiper.slideToLoop) sw.swiper.slideToLoop(1, 0)
    else sw.swiper.slideTo(1, 0)
    const t = document.querySelector<HTMLElement>("#shopify-section-content_tabs_6wGCed .ctabs__track")!
    t.scrollLeft = 200
    document.getElementById("shopify-section-content_tabs_6wGCed")!.scrollIntoView()
  })
  await sleep(600)
  await frame.evaluate(() => document.querySelectorAll(".shopify-section").forEach((e) => { (e as unknown as { __old: boolean }).__old = true }))
  const before = await state()
  /* Every frame for two seconds after the edit, read as it is painted (a ResizeObserver delivers after every animation frame callback, before the paint): the slide, the track and the page, and whether each is the new element. */
  const watching = frame.evaluate(`new Promise((done) => { const out = []; const t0 = performance.now(); const probe = document.createElement("i"); probe.style.cssText = "position:fixed;width:1px;height:1px;left:-9px;top:0"; document.body.appendChild(probe); const late = (fn) => { const ro = new ResizeObserver(() => { ro.disconnect(); fn() }); ro.observe(probe) }; const tick = () => late(read); const read = () => { const show = document.getElementById("shopify-section-slideshow_dETpFq"); const sw = show && show.querySelector(".swiper"); const tabs = document.getElementById("shopify-section-content_tabs_6wGCed"); const tr = tabs && tabs.querySelector(".ctabs__track"); out.push({ slide: sw && sw.swiper ? sw.swiper.realIndex : null, showNew: !show.__old, track: tr ? Math.round(tr.scrollLeft) : null, tabsNew: !tabs.__old, y: Math.round(scrollY) }); if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else { probe.remove(); done(out) } }; requestAnimationFrame(tick) })`) as Promise<{ slide: number | null; showNew: boolean; track: number | null; tabsNew: boolean; y: number }[]>
  const sent = (await redraw("slideshow_dETpFq")) && (await redraw("content_tabs_6wGCed"))
  const frames = await watching
  const after = frames[frames.length - 1]
  const showFrames = frames.filter((f) => f.showNew)
  const tabFrames = frames.filter((f) => f.tabsNew)
  check("both sections were drawn again whole", sent && after.showNew && after.tabsNew, { sent, after })
  check("SLIDE  the slideshow stays on its second slide", after.slide === before.slide && before.slide === 1, { before: before.slide, after: after.slide })
  check("       on every frame of the new one", showFrames.every((f) => f.slide === before.slide), { frames: showFrames.length, off: showFrames.filter((f) => f.slide !== before.slide) })
  check("TRACK  the tabs' track stays where it was scrolled", after.track === before.track && (before.track ?? 0) > 100, { before: before.track, after: after.track })
  check("       on every frame of the new one", tabFrames.every((f) => f.track === before.track), { frames: tabFrames.length, off: tabFrames.filter((f) => f.track !== before.track).length })
  check("PAGE   the canvas page did not move", frames.every((f) => f.y === before.y), { before: before.y, moved: frames.filter((f) => f.y !== before.y).length })
  await ed.page.close()
  ed.close()
  }
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
void main()
