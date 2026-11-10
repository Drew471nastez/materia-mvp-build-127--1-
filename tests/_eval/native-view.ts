/**
 * Round R (R4): native sites drawn the way the live site draws them, and
 * R3's design review run on them inside the job.
 *
 *   renderNative   R3's local renderer (native-review/render-local.tsx: the
 *                  live site's ThemePage and SectionRenderer, every native
 *                  React section, rendered to static markup) with the app's
 *                  own stylesheet (app/site.css through Tailwind, as R3's
 *                  suite compiles it), as R3's critic document: no script.
 *   evalReview     the job's NativeReviewPort on that renderer and the
 *                  critic's own shootPages (JS off, fenced network), with a
 *                  browser whose tabs answer the eval's stand-in pictures and
 *                  Google Fonts first (./images.ts, ./browser.ts). No vision
 *                  model in the scripted run: "measured", never "reviewed".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SiteState } from "@/lib/website-builder/ai-site/apply"
import type { NativeReviewPort } from "@/lib/website-builder/ai-site/job"
import type { ModelRef } from "@/lib/website-builder/ai-site/models"
import type { EvalSite } from "@/lib/ai-builder/eval/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import { evalImageBytes, EVAL_MEDIA_HOST } from "./images"
import { CHROMIUM, browserHere, fontBytes } from "./browser"

let css: string | null = null

/** The app's site stylesheet, compiled once per machine (cached in the temp folder). */
export async function siteCss(root = process.cwd()): Promise<string> {
  if (css) return css
  const built = join(root, ".next-css", "site.css")
  if (existsSync(built)) return (css = readFileSync(built, "utf8"))
  const cache = join(tmpdir(), "storelib-eval-site-css", "site.css")
  const src = readFileSync(join(root, "app", "site.css"), "utf8")
  const stamp = `${src.length}:${readFileSync(join(root, "scripts", "site-css.cjs"), "utf8").length}`
  if (existsSync(cache) && existsSync(`${cache}.stamp`) && readFileSync(`${cache}.stamp`, "utf8") === stamp) return (css = readFileSync(cache, "utf8"))
  const req = createRequire(join(root, "package.json"))
  const postcss = (await import("postcss")).default
  const out = await postcss([req(join(root, "scripts", "site-css.cjs"))(), req("@tailwindcss/postcss")()]).process(src, { from: join(root, "app", "site.css") })
  mkdirSync(join(tmpdir(), "storelib-eval-site-css"), { recursive: true })
  writeFileSync(cache, out.css)
  writeFileSync(`${cache}.stamp`, stamp)
  return (css = out.css)
}

export const asSiteState = (site: Pick<EvalSite, "settings" | "pages">): SiteState => ({ settings: site.settings, pages: Object.fromEntries(site.pages.map((p) => [p.key, p.sections])) as Record<string, SectionInstance[]> })

/** A native page as the live site draws it, as R3's critic document. Null when it cannot be drawn here. */
export async function renderNative(site: Pick<EvalSite, "settings" | "pages" | "sources">, page: string): Promise<string | null> {
  const { renderNativePageLocally } = await import("@/lib/website-builder/ai-site/native-review/render-local")
  const doc = await renderNativePageLocally(asSiteState(site), page, { css: await siteCss(), sources: site.sources })
  return doc?.html ?? null
}

/* ── pictures answered before the critic's fence sees them ────────────── */

const PICTURES = new Map<string, Buffer>()
const EVAL_URL = new RegExp(`https://${EVAL_MEDIA_HOST.replace(/\./g, "\\.")}/[^"'\\s)\\\\]+`, "g")

/** Every stand-in picture a site names, drawn ahead (the browser's handler must answer at once). */
export async function warmPictures(anything: unknown): Promise<void> {
  const urls = new Set(JSON.stringify(anything).match(EVAL_URL) ?? [])
  for (const u of urls) if (!PICTURES.has(u)) {
    const b = await evalImageBytes(u)
    if (b) PICTURES.set(u, b)
  }
}

type Browser = import("puppeteer-core").Browser

/** A Chromium (over a pipe) whose every new tab answers the eval's pictures and fonts before anyone else's handler. */
export async function evalLaunch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, pipe: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] })
  const open = browser.newPage.bind(browser)
  browser.newPage = (async (...args: Parameters<Browser["newPage"]>) => {
    const tab = await open(...args)
    await tab.setRequestInterception(true)
    tab.on("request", (req) => {
      if (req.isInterceptResolutionHandled()) return
      const url = req.url().replace(/[?#].*$/, "")
      const pic = PICTURES.get(url)
      if (pic) return void req.respond({ status: 200, contentType: "image/jpeg", body: pic }).catch(() => undefined)
      const font = fontBytes(req.url())
      if (font) return void req.respond({ status: 200, contentType: font.type, body: font.body, headers: { "access-control-allow-origin": "*" } }).catch(() => undefined)
    })
    return tab
  }) as Browser["newPage"]
  return browser
}

/** The job's design review (R3) on the local renderer, measured in the critic's own fenced browser. */
export async function evalReview(vision: ModelRef | null = null): Promise<NativeReviewPort> {
  const [{ reviewNativeDraft }, { localNativeRenderer }, { shootPages }, { nativeRegistry }, { registryLookup, schemaLookup }] = await Promise.all([
    import("@/lib/website-builder/ai-site/native-review/review"),
    import("@/lib/website-builder/ai-site/native-review/render-local"),
    import("@/lib/ai-builder/visual-critic/shoot"),
    import("@/lib/website-builder/ai-site/native/registry"),
    import("@/lib/website-builder/ai-site/native-review/patch"),
  ])
  const render = localNativeRenderer({ css: await siteCss() })
  const available = () => (browserHere() ? ({ ok: true } as const) : ({ ok: false, reason: `no Chromium at ${CHROMIUM}` } as const))
  const port: NativeReviewPort = async (req, hooks) => {
    await warmPictures(req.site)
    return reviewNativeDraft(req, {
      render: async (s, pages) => {
        await warmPictures(s)
        return render(s, pages)
      },
      shoot: shootPages,
      launch: evalLaunch as never,
      available,
      write: hooks.write,
      vision,
      schemas: hooks.schemas,
      /* R2's registry for what a patch may set, the schemas behind it (as R3 wires it). */
      lookup: registryLookup(nativeRegistry() as never, schemaLookup(hooks.schemas)),
      progress: hooks.progress,
    })
  }
  port.available = available
  return port
}
