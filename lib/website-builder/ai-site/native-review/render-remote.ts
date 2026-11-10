import "server-only"

/**
 * ===========================================================================
 *  A NATIVE DRAFT DRAWN BY THE SITE ITSELF, FOR THE REVIEW (round R, R3)
 * ===========================================================================
 * On the server the page is not re-created: the site's own route draws it.
 * app/(site)/cover-render/[pass] is the page the cover's photograph is taken
 * of (lib/website-builder/cover-pass.ts): the install's SAVED draft, drawn by
 * the same code as the live site (render-site.tsx coverPage: the drafts, the
 * sanitising, the prerendered .storelib sections, ThemePage), with `?page=`
 * for a page other than home.
 *
 * Why a request and not a render in this process: the job runs in a route
 * handler, which Next compiles as React server code. There the section
 * renderers (client components) are references, not components, and
 * react-dom/server is not allowed. The site's page route is where they render,
 * so the review asks it, the way the cover does.
 *
 * TENANT-SCOPED. The pass is minted for THIS job's install only, signed with
 * a server secret, and dies in two minutes; nothing else can be drawn with it.
 *
 * WHAT IS DRAWN IS WHAT WAS SAVED: the review saves a round of patches
 * (NativeReviewDeps.write) before it asks for the page again, so the `site`
 * argument is not read here.
 *
 * NO SCRIPT RUNS. The answer is HTML text: its scripts are stripped
 * (./document.ts servedToDocument), its stylesheets and pictures addressed at
 * the site, and React's streamed sections put in place by Storelib's own
 * expression (UNSTREAM) in a browser with JavaScript off.
 */
import { mintCoverPass } from "../../cover-pass"
import { servedToDocument, UNSTREAM } from "./document"
import type { NativeRenderer } from "./review"
import type { ShotPage } from "@/lib/ai-builder/visual-critic/shoot"

/** The largest page read, in characters. */
const MAX_PAGE = 6_000_000
/** The largest stylesheet put inline. */
const MAX_SHEET = 4_000_000
const PAGE_KEY = /^[a-z0-9][a-z0-9_-]{0,59}$/

export function remoteNativeRenderer(opts: { origin: string; installId: string; fetchImpl?: typeof fetch; timeoutMs?: number }): NativeRenderer {
  const get = opts.fetchImpl ?? fetch
  const origin = opts.origin.replace(/\/+$/, "")
  /* One fetch of each stylesheet per review: every page and round uses the same build's. */
  const sheets = new Map<string, string>()
  return async (_site, pages) => {
    const out: ShotPage[] = []
    for (const page of pages) {
      if (!PAGE_KEY.test(page)) continue
      let pass: string
      try {
        pass = mintCoverPass(opts.installId)
      } catch {
        return null
      }
      const url = `${origin}/cover-render/${encodeURIComponent(pass)}${page === "home" ? "" : `?page=${encodeURIComponent(page)}`}`
      try {
        const res = await get(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) })
        if (!res.ok) continue
        const html = (await res.text()).slice(0, MAX_PAGE)
        /* The site's own stylesheets, fetched here once and put inline: the critic's browser never has to reach the site (it cannot reach localhost at all). */
        const first = servedToDocument(html, origin)
        const inlined: Record<string, string> = {}
        for (const href of first.cssHrefs.filter((h) => h.startsWith(`${origin}/`)).slice(0, 12)) {
          const css = sheets.get(href) ?? (await get(href, { redirect: "error", signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null))
          if (typeof css === "string" && css.length < MAX_SHEET) {
            sheets.set(href, css)
            inlined[href] = css
          }
        }
        out.push({ page, html: servedToDocument(html, origin, inlined).html, prepare: UNSTREAM })
      } catch (e) {
        console.warn("[ai-site] native review: the page could not be fetched:", page, e instanceof Error ? e.message.slice(0, 120) : e)
      }
    }
    return out
  }
}
