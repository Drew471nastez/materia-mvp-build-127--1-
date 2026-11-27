/**
 * ===========================================================================
 *  THE HEADER'S WORDS ARE THERE FROM THE FIRST FRAME (round 67)
 * ===========================================================================
 *   npx tsx scripts/check-header-text-r67.ts
 *     TEMPLATES=fitness,space   which Materia templates (default: a spread)
 *     FONT_MS=300               how long the font files take to arrive
 *
 * The owner: "sometimes, when I land on a page, refresh, or go to another
 * page, the menu links and text in the header become invisible, then appear
 * abruptly." Read two ways, on a first visit, a reload and a link followed
 * (the page change), with the font files slowed by FONT_MS:
 *   frames    every compositor frame (CDP screencast) from the moment the
 *             page is asked for: in the box of the header's first menu link,
 *             once the header is painted, the text must be there (the spread
 *             of light in the box, words on a background, never flat).
 *   faces     each frame, the font the link is drawn in: a face still on its
 *             way whose font-display holds the text back (block, auto,
 *             fallback, optional) is text drawn invisible.
 */
import { join } from "node:path"
import puppeteer, { type CDPSession, type Page } from "puppeteer-core"
import sharp from "sharp"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const TEMPLATES = (process.env.TEMPLATES ?? "fitness,space,clothing,samples,coach,newleaf").split(",").filter(Boolean)
const FONT_MS = Number(process.env.FONT_MS ?? 300)
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== "" ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}

const WATCH = `(() => {
  window.__ht = [];
  const tick = () => {
    const a = document.querySelector("header nav a, .header nav a, [id*='header'] nav a, [id*='header'] .menu a, header a.menu-link, header .navigation a");
    if (a) {
      const r = a.getBoundingClientRect();
      let o = 1, vis = getComputedStyle(a).visibility;
      let who = "";
      for (let e = a; e && e.nodeType === 1; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).opacity); if (v < 0.95 && !who) who = e.tagName + "#" + e.id + "." + String(e.className).slice(0, 60) + " anim=" + e.getAnimations().map((x) => (x.animationName || x.transitionProperty || "waapi")).join("|"); o *= v; }
      const fam = getComputedStyle(a).fontFamily.split(",")[0].replace(/["']/g, "").trim();
      let held = "";
      try { document.fonts.forEach((f) => { if (f.family.replace(/["']/g, "") === fam && f.status === "loading" && f.display !== "swap") held = f.display; }); } catch (e) {}
      const loadingFaces = []; try { document.fonts.forEach((f) => { if (f.status === "loading") loadingFaces.push(f.family + ":" + f.display) }) } catch (e) {}
      window.__ht.push({ t: Math.round(performance.now()), o: +o.toFixed(2), vis, held, fam, who, color: getComputedStyle(a).color, ff: getComputedStyle(a).fontFamily.slice(0, 50), lf: loadingFaces.join(","), box: [r.left, r.top, r.width, r.height].map(Math.round) });
    }
    if (window.__ht.length < 400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`

async function contrast(jpeg: Buffer, box: number[], scale: number): Promise<number> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true })
  const [x, y, w, h] = box.map((v) => Math.round(v * scale))
  let n = 0, sum = 0, sq = 0
  for (let j = Math.max(0, y); j < Math.min(info.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(info.width, x + w); i++) {
    const k = (j * info.width + i) * info.channels
    const l = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]
    n++; sum += l; sq += l * l
  }
  if (!n) return 0
  const m = sum / n
  return Math.sqrt(Math.max(0, sq / n - m * m))
}

async function filmed(page: Page, cdp: CDPSession, go: () => Promise<unknown>) {
  const frames: { at: number; jpeg: Buffer }[] = []
  const on = (e: { data: string; sessionId: number; metadata: { timestamp?: number } }) => { frames.push({ at: e.metadata.timestamp ?? 0, jpeg: Buffer.from(e.data, "base64") }); void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {}) }
  cdp.on("Page.screencastFrame", on)
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 })
  await go()
  await sleep(1800)
  await cdp.send("Page.stopScreencast")
  cdp.off("Page.screencastFrame", on)
  return frames
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  for (const template of TEMPLATES) {
    console.log(`\n${template}`)
    const imported = await importTemplate(`materia/${template}`)
    const built = auditSite(imported, template, false, { own: true })
    const { base, server } = await serve(built, join("scripts", "theme-templates", "products", template))
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    await page.evaluateOnNewDocument(WATCH)
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      if (/\.(woff2?|ttf|otf)(\?|$)/.test(req.url()) || req.resourceType() === "font") setTimeout(() => void req.continue().catch(() => {}), FONT_MS)
      else void req.continue().catch(() => {})
    })
    const cdp = await page.createCDPSession()
    const steps: [string, () => Promise<unknown>][] = [
      ["first visit", () => page.goto(base + "/", { waitUntil: "domcontentloaded" })],
      ["reload", () => page.reload({ waitUntil: "domcontentloaded" })],
      ["page change", async () => {
        const href = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("header a[href^='/'], [id*='header'] a[href^='/']")].map((a) => a.getAttribute("href")!).find((h) => h !== "/" && !/cart|account|search|wishlist/.test(h)) ?? "/collections/all")
        await page.evaluate((h) => { const a = document.createElement("a"); a.href = h; document.body.appendChild(a); a.click() }, href)
        await page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {})
      }],
    ]
    for (const [label, go] of steps) {
      const frames = await filmed(page, cdp, go)
      await sleep(300)
      const ht = (await page.evaluate(() => (window as unknown as { __ht: { t: number; o: number; vis: string; held: string; fam: string; box: number[] }[] }).__ht).catch(() => [])) ?? []
      const box = ht.at(-1)?.box
      if (process.env.SHOTS) await Promise.all(frames.slice(0, 8).map((f, i) => sharp(f.jpeg).toFile(join(process.env.SHOTS!, `header-${template}-${label.replace(/\W+/g, "-")}-${i}.jpg`))))
      const scale = frames[0] ? (await sharp(frames[0].jpeg).metadata()).width! / 1440 : 1
      const spreads = box && box[2] > 0 ? await Promise.all(frames.map((f) => contrast(f.jpeg, box, scale))) : []
      // A frame with nothing painted at all (the browser showing the page background before the document's first content) is not the header's doing.
      const whole = await Promise.all(frames.map((f) => contrast(f.jpeg, [0, 0, 1440, 900], scale)))
      const final = spreads.at(-1) ?? 0
      // Once the header has painted words in the box, a later frame with none is a flash; and a first paint without them.
      const firstWords = spreads.findIndex((s) => s > final * 0.5)
      const blankAfter = spreads.map((s, i) => i >= Math.max(0, firstWords) && s < final * 0.35 && whole[i] > 4).filter(Boolean).length
      const bare = spreads.filter((s, i) => i >= Math.max(0, firstWords) && whole[i] <= 4).length
      const headerUp = spreads.findIndex((s) => s > 0.5)
      const heldFrames = ht.filter((h) => h.held).length
      if (process.env.DEBUG) console.log("      ", ht.slice(0, 6).map((h) => `${h.t}ms o=${h.o} ${h.vis} ${JSON.stringify(h).slice(0, 300)}`).join("\n       "))
      const hidden = ht.filter((h) => h.o < 0.95 || h.vis !== "visible").length
      check(`${label}: menu text painted from the header's first frame, never gone after (${frames.length} frames)`, blankAfter === 0 && firstWords <= Math.max(0, headerUp) + 0, `first words at frame ${firstWords}, header at ${headerUp}, blank after ${blankAfter}, bare page frames ${bare}, spread ${spreads.map((s) => s.toFixed(0)).slice(0, 14).join(" ")}`)
      check(`${label}: never drawn in a font still held back`, heldFrames === 0, heldFrames ? `${heldFrames} frames, ${ht.find((h) => h.held)?.fam} display=${ht.find((h) => h.held)?.held}` : "")
      check(`${label}: never hidden or faded`, hidden === 0, hidden ? ht.filter((h) => h.o < 0.95 || h.vis !== "visible").slice(0, 3) : "")
    }
    await page.close()
    server.close()
  }
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
