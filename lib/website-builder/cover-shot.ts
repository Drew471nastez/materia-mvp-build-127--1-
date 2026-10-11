import "server-only"

/**
 * ===========================================================================
 *  THE SCREENSHOTS, TAKEN BY A REAL BROWSER
 * ===========================================================================
 * A website's cover is two photographs of its saved home page — one at a
 * laptop's width, one at a phone's — taken by headless Chromium on the
 * server. It opens the page the way a visitor's browser does, so what comes
 * back is the page, and not a reconstruction of it in the editor's document.
 *
 * The in-browser capture this replaces rebuilt the page inside an SVG with
 * html-to-image, which is why the theme's entrance animation replayed into
 * every cover and left it blank below the header, why a phone produced a
 * phone-shaped cover, and why a photograph from another host could not be
 * drawn at all. A browser has none of those problems, because it is not
 * imitating one.
 *
 * On Vercel the browser is @sparticuz/chromium, a build made for functions.
 * Anywhere else — a laptop, the probe, CI — CHROMIUM_PATH names one, so the
 * code that runs in production is the code that is tested.
 */

export const DESKTOP = { width: 1440, height: 900 }
export const PHONE = { width: 390, height: 844 }

export interface CoverShots {
  desktop: Buffer
  /** Null when there was no time left for it: the desktop picture is still a cover. */
  mobile: Buffer | null
  ms: number
}

export async function launch() {
  const puppeteer = (await import("puppeteer-core")).default
  const local = process.env.CHROMIUM_PATH
  if (local) {
    return puppeteer.launch({
      executablePath: local,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"],
    })
  }
  const chromium = (await import("@sparticuz/chromium")).default
  return launchPacked(puppeteer, chromium)
}

/*
  ONE UNPACKING AT A TIME. "[cover] could not take the screenshots: spawn
  ETXTBSY". @sparticuz/chromium unpacks its browser into /tmp/chromium the
  first time it is asked, and answers "it is there" as soon as that FILE
  EXISTS, while it is still being written. Two covers asked for at once on
  one instance (Fluid compute runs requests side by side in one process):
  the first starts writing, the second is told the path and starts a
  program that is half written, and Linux refuses: ETXTBSY, text file busy.

  So the unpacking is one promise per process, kept on globalThis (every
  route that takes a cover shares it, whichever bundle it came in), and
  everybody waits for the same one. A failed unpacking is forgotten, so the
  next cover tries again. And a start that still meets a busy file (another
  writer this code does not know about) waits a moment and tries once more.
*/
type Pack = { executablePath: () => Promise<string>; args: string[] }
type Starter<B> = { launch: (options: { executablePath: string; headless: boolean; args: string[] }) => Promise<B> }

const UNPACKING = Symbol.for("storelib.cover.chromium-unpacking")
const TEXT_BUSY_WAIT_MS = 400

export function unpackOnce(pack: Pack): Promise<string> {
  const g = globalThis as unknown as Record<symbol, Promise<string> | null | undefined>
  if (!g[UNPACKING]) {
    g[UNPACKING] = pack.executablePath().catch((e) => {
      g[UNPACKING] = null
      throw e
    })
  }
  return g[UNPACKING] as Promise<string>
}

export function isTextBusy(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null
  return err?.code === "ETXTBSY" || /ETXTBSY/.test(String(err?.message ?? ""))
}

export async function launchPacked<B>(puppeteer: Starter<B>, pack: Pack, wait = TEXT_BUSY_WAIT_MS): Promise<B> {
  const start = async () =>
    puppeteer.launch({
      executablePath: await unpackOnce(pack),
      headless: true,
      args: [...pack.args, "--hide-scrollbars", "--font-render-hinting=none"],
    })
  try {
    return await start()
  } catch (e) {
    if (!isTextBusy(e)) throw e
    console.warn("[cover] the browser was still being unpacked (ETXTBSY); starting it again")
    await new Promise((r) => setTimeout(r, wait))
    return start()
  }
}

/*
  ═══════════════════════════════════════════════════════════════════════
   EVERY WAIT IN HERE ENDS, AND A SLOW PAGE IS STILL PHOTOGRAPHED
  ═══════════════════════════════════════════════════════════════════════
  "Preparing preview" stayed on the Website page's card for good. The
  photograph waited for `networkidle0`, no request at all for half a second,
  which a theme that keeps something open (a video, a polling script, a
  carousel fetching its next picture, an analytics beacon) never reaches: the
  page load timed out at 25 seconds, the phone picture then did the same,
  the function ran out of time, and no cover was ever kept. The fonts and
  picture decoding after it had no limit of their own either: one picture
  whose request stalls holds `img.decode()` forever.

  Now the page is opened to its first paint (DOMContentLoaded, with the
  status read from it), then given a bounded time for its load event and a
  bounded quiet moment on the network, then a bounded wait for fonts and the
  first screen's pictures. Whatever is there when those run out is what is
  photographed: a cover of a page with one late picture beats no cover. The
  whole of it runs inside SHOT_BUDGET_MS, under the route's maxDuration, and
  a phone picture that does not fit is left out rather than losing the
  desktop one.
*/
/** Everything, both pictures, inside the cover route's 60 seconds with the browser's launch. */
export const SHOT_BUDGET_MS = 42_000
/** The page's first paint: the document and its stylesheets. Anything slower than this is a page that is not there. */
const OPEN_MS = 18_000
/** Then its load event, then a quiet network, then its fonts and first pictures: each at most this long. */
const LOAD_MS = 6_000
const QUIET_MS = 2_500
const SETTLE_MS = 3_000

const left = (deadline: number, most: number) => Math.max(0, Math.min(most, deadline - Date.now()))

/**
 * Photograph `url` at both widths. Throws when the page cannot be opened or
 * answers an error — the caller decides what a failed cover means, which is:
 * keep the last one. A phone picture that cannot be taken in the time left
 * is null, and the desktop one is kept.
 */
export async function takeCoverShots(url: string, budgetMs = SHOT_BUDGET_MS): Promise<CoverShots> {
  const t0 = Date.now()
  const deadline = t0 + budgetMs
  const browser = await launch()
  try {
    /*
      A PAGE OF ITS OWN FOR EACH PICTURE. Changing an open page's viewport to
      a phone's (isMobile, hasTouch) makes Puppeteer reload it and wait for
      its load event with the default 30 seconds, which a page with one
      stalled request never fires: the phone picture hung there, outside
      every wait above.
    */
    const shoot = async (view: { width: number; height: number }, mobile: boolean): Promise<Buffer> => {
      const page = await browser.newPage()
      await page.setViewport({
        width: view.width,
        height: view.height,
        /* Twice the pixels on the phone, which is drawn small in the card and
           looks soft at one; the desktop picture is already wider than the
           card it sits in. */
        deviceScaleFactor: mobile ? 2 : 1,
        isMobile: mobile,
        hasTouch: mobile,
      })
      /* Opened to its first paint, which is where its answer's status is known. */
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: left(deadline, OPEN_MS) || 1 })
      /* An error page photographed is an error page on the card. A pass that
         expired, a render that threw: refuse, and the last cover stays. */
      const status = response?.status() ?? 0
      if (status >= 400) throw new Error(`the render page answered ${status}`)
      /*
        LOADED, IF IT WILL LOAD, AND QUIET, IF IT WILL GO QUIET: the photographs,
        the theme's fonts, the stylesheets. Each wait has an end; a page that
        never fires load or never stops fetching is photographed as it stands.
      */
      await page.waitForFunction("document.readyState === 'complete'", { timeout: left(deadline, LOAD_MS) || 1 }).catch(() => undefined)
      await page.waitForNetworkIdle({ idleTime: 500, timeout: left(deadline, QUIET_MS) || 1 }).catch(() => undefined)
      await page
        .evaluate(async (most: number) => {
          const settle = async () => {
            await document.fonts?.ready
            /* A lazy picture below the fold is never fetched unless something
               asks; the top of the page is all a cover shows, but a section can
               mark its own hero lazy. */
            const imgs = Array.from(document.images)
            for (const img of imgs) img.loading = "eager"
            await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))))
          }
          /* A picture whose request stalls holds decode() for good: this never waits longer than `most`. */
          await Promise.race([settle(), new Promise((r) => setTimeout(r, most))])
        }, left(deadline, SETTLE_MS))
        .catch(() => undefined)
      const shot = await page.screenshot({
        type: "webp",
        quality: 82,
        clip: { x: 0, y: 0, width: view.width, height: view.height },
      })
      return Buffer.from(shot)
    }

    const desktop = await shoot(DESKTOP, false)
    /* The phone picture only in the time that is left; without it the desktop one is still a cover. */
    let mobile: Buffer | null = null
    if (deadline - Date.now() > 4_000) {
      try {
        mobile = await shoot(PHONE, true)
      } catch (e) {
        console.warn("[cover] the phone picture could not be taken:", e instanceof Error ? e.message : e)
      }
    }
    return { desktop, mobile, ms: Date.now() - t0 }
  } finally {
    await browser.close().catch(() => {})
  }
}
