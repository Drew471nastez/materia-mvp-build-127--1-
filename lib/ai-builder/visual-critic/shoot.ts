import "server-only"

/**
 * ===========================================================================
 *  THE DRAFT, PHOTOGRAPHED AND MEASURED IN A REAL BROWSER, SCRIPTS OFF
 * ===========================================================================
 * Each page the agent made (./document.ts, drawn from the job's own project)
 * is opened in the same headless Chromium that takes every site's cover
 * (lib/website-builder/cover-shot.ts launch: @sparticuz/chromium on Vercel,
 * CHROMIUM_PATH anywhere else) and photographed:
 *
 *   desktop 1440 x 900   the first screen, and the whole page (capped)
 *   mobile   390 x 844   the first screen, and the whole page (capped)
 *
 * then measured (./measure.ts).
 *
 * JAVASCRIPT IS OFF. `setJavaScriptEnabled(false)`: no script of the page
 * runs, ever, so nothing an AI wrote executes on the server. The document
 * has no scripts to begin with (stripped, and a CSP that forbids them); this
 * is the third lock. The measurements are evaluated through the DevTools
 * protocol, which works with the page's scripts disabled.
 *
 * THE NETWORK IS FENCED. Only stylesheets, fonts and pictures load, only
 * over http(s) to public hosts (no localhost, private ranges, link-local or
 * cloud metadata addresses), plus data: and blob:. Everything else is
 * refused before it leaves the browser. The page is set as content (no URL),
 * so no draft is ever served at an address anybody could open.
 *
 * NO BROWSER IS NOT A PASS. `browserAvailable()` says whether one can start
 * here; when it cannot, or it fails or runs out of time, the caller gets
 * null and reports the page as NOT VISUALLY CHECKED (spec 8.5).
 */
import { existsSync } from "node:fs"
import sharp from "sharp"
import { launch as launchChromium } from "@/lib/website-builder/cover-shot"
import { measureScript, type Measurements } from "./measure"
import type { PageShots } from "./types"

export const DESKTOP_VIEW = { width: 1440, height: 900 }
export const MOBILE_VIEW = { width: 390, height: 844 }
/** How tall a full-page photograph may be, in CSS pixels, before it is cut. */
export const FULL_MAX = { desktop: 4800, mobile: 4400 }
/** The longest edge a picture is sent at (lib/sites/agent/attachments.ts LONG_EDGE). */
const LONG_EDGE = 1568

/** Whether a headless browser can start here. A reason in words when it cannot. */
export function browserAvailable(env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; reason: string } {
  const local = env.CHROMIUM_PATH
  if (local) return existsSync(local) ? { ok: true } : { ok: false, reason: "no browser is installed on this server" }
  /* The packed Chromium (@sparticuz/chromium) is built for Linux functions: Vercel and Lambda. */
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return { ok: true }
  return { ok: false, reason: "no browser is available on this server" }
}

/* ── the network fence ───────────────────────────────────────────────── */

/** A host a server-side browser may fetch from: public names and addresses only. */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return false
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false
    return true
  }
  if (h.includes(":")) {
    /* An IPv6 literal: loopback, unique local, link local and mapped addresses are refused; a public one is rare in a page, so refuse them all. */
    return false
  }
  /* A bare word ("intranet") is a private name. */
  return h.includes(".")
}

const ALLOWED_TYPES = new Set(["document", "stylesheet", "image", "font"])

export function allowRequest(url: string, resourceType: string): boolean {
  if (!ALLOWED_TYPES.has(resourceType)) return false
  if (/^(data|blob):/i.test(url) || url === "about:blank") return true
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false
    return isPublicHost(u.hostname)
  } catch {
    return false
  }
}

/* ── photographs ─────────────────────────────────────────────────────── */

/** A tall picture cut into columns laid side by side, then fitted to LONG_EDGE: legible text in one image. */
async function contactSheet(buf: Buffer, width: number, height: number, column: number): Promise<string> {
  const cols = Math.max(1, Math.ceil(height / column))
  const colH = Math.min(column, height)
  const gap = 16
  const parts = await Promise.all(
    Array.from({ length: cols }, async (_, i) => {
      const top = i * colH
      const h = Math.min(colH, height - top)
      return { input: await sharp(buf).extract({ left: 0, top, width, height: h }).toBuffer(), left: i * (width + gap), top: 0 }
    }),
  )
  const sheet = await sharp({ create: { width: cols * width + (cols - 1) * gap, height: colH, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .composite(parts)
    .jpeg({ quality: 80 })
    .toBuffer()
  const out = await sharp(sheet).resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 62 }).toBuffer()
  return out.toString("base64")
}

async function fitted(buf: Buffer): Promise<string> {
  return (await sharp(buf).resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 68 }).toBuffer()).toString("base64")
}

export interface ShotPage {
  page: string
  html: string
}

export interface ShotResult {
  shots: PageShots[]
  measurements: { page: string; desktop: Measurements; mobile: Measurements }[]
  /** Proof for the tests and the log: what the page's own script would have done, had it run. */
  jsDisabled: boolean
  ms: number
}

type Browser = Awaited<ReturnType<typeof launchChromium>>

export interface ShootOptions {
  /** Everything, every page, inside this. */
  timeoutMs?: number
  /** Tests hand in their own (a real Chromium at a path). */
  launch?: () => Promise<Browser>
  /** Photographs off: measurements only. */
  photos?: boolean
}

/**
 * Photograph and measure each page. Null when no browser could do it (not
 * here, a crash, out of time): the caller says "not visually checked".
 */
export async function shootPages(pages: ShotPage[], opts: ShootOptions = {}): Promise<ShotResult | null> {
  const t0 = Date.now()
  const timeoutMs = opts.timeoutMs ?? 75_000
  const photos = opts.photos !== false
  let browser: Browser | null = null
  const work = (async (): Promise<ShotResult> => {
    browser = await (opts.launch ?? launchChromium)()
    const shots: PageShots[] = []
    const measurements: ShotResult["measurements"] = []
    let jsDisabled = true
    for (const p of pages) {
      const one = async (view: { width: number; height: number }, mobile: boolean) => {
        const tab = await (browser as Browser).newPage()
        try {
          await tab.setJavaScriptEnabled(false)
          await tab.setRequestInterception(true)
          tab.on("request", (req) => {
            if (req.isInterceptResolutionHandled()) return
            if (allowRequest(req.url(), req.resourceType())) void req.continue().catch(() => undefined)
            else void req.abort("blockedbyclient").catch(() => undefined)
          })
          await tab.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]).catch(() => undefined)
          await tab.setViewport({ width: view.width, height: view.height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
          await tab.setContent(p.html, { waitUntil: "load", timeout: 12_000 }).catch(() => undefined)
          /* Fonts and pictures a moment to land; a slow one is photographed as it stands. No in-page timer: scripts are off. */
          await tab.waitForNetworkIdle({ idleTime: 300, timeout: 4_000 }).catch(() => undefined)
          await tab.evaluate("document.fonts && document.fonts.ready.then(() => true)").catch(() => undefined)
          /* The proof the page's own scripts are off: a page script would have had to run to set this. */
          const ran = await tab.evaluate("document.documentElement.getAttribute('data-critic-js')").catch(() => null)
          if (ran) jsDisabled = false
          const m = (await tab.evaluate(measureScript(view.height))) as Omit<Measurements, "viewport">
          const measured: Measurements = { ...m, viewport: mobile ? "mobile" : "desktop" }
          let fold: string | undefined
          let full: string | undefined
          let height = measured.pageHeight
          if (photos) {
            fold = await fitted(Buffer.from(await tab.screenshot({ type: "jpeg", quality: 80, clip: { x: 0, y: 0, width: view.width, height: view.height } })))
            height = Math.max(view.height, Math.min(measured.pageHeight, mobile ? FULL_MAX.mobile : FULL_MAX.desktop))
            const tall = Buffer.from(await tab.screenshot({ type: "jpeg", quality: 80, clip: { x: 0, y: 0, width: view.width, height }, captureBeyondViewport: true }))
            full = await contactSheet(tall, view.width, height, mobile ? 1100 : 2400)
          }
          return { measured, fold, full }
        } finally {
          await tab.close().catch(() => undefined)
        }
      }
      const d = await one(DESKTOP_VIEW, false)
      const m = await one(MOBILE_VIEW, true)
      measurements.push({ page: p.page, desktop: d.measured, mobile: m.measured })
      shots.push({
        page: p.page,
        ...(d.fold ? { desktopFold: d.fold } : {}),
        ...(d.full ? { desktopFull: d.full } : {}),
        ...(m.fold ? { mobileFold: m.fold } : {}),
        ...(m.full ? { mobileFull: m.full } : {}),
        heights: { desktop: d.measured.pageHeight, mobile: m.measured.pageHeight },
        cut: d.measured.pageHeight > FULL_MAX.desktop || m.measured.pageHeight > FULL_MAX.mobile,
      })
    }
    return { shots, measurements, jsDisabled, ms: Date.now() - t0 }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("the design review ran out of time drawing the pages")), timeoutMs)))])
  } catch (thrown) {
    console.warn("[ai-builder] visual critic: the pages could not be drawn:", thrown instanceof Error ? thrown.message.slice(0, 200) : thrown)
    return null
  } finally {
    if (timer) clearTimeout(timer)
    const open = browser as Browser | null
    await open?.close().catch(() => undefined)
    /* The launch may still be on its way when the timeout won: close it when it lands. */
    work.then(() => (browser as Browser | null)?.close().catch(() => undefined)).catch(() => undefined)
  }
}
