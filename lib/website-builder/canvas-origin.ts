/**
 * ===========================================================================
 *  THE CANVAS ON A SITE OF ITS OWN (OFF UNLESS NEXT_PUBLIC_CANVAS_ORIGIN IS SET)
 * ===========================================================================
 * The builder's canvas (components/website-builder/compat/compat-canvas.tsx)
 * draws the theme in a sandboxed srcdoc frame. Chrome keeps such a frame in
 * the editor's own process, on the editor's main thread, so the theme's
 * scripts and layout wait behind the editor's typing and the editor waits
 * behind them (round 14).
 *
 * With NEXT_PUBLIC_CANVAS_ORIGIN set (say https://storelib.me, another
 * registrable domain on the same deployment), each canvas frame instead
 * loads a small document from that origin (lib/storelib-theme/compat/
 * canvas-shell.ts), which draws the page the editor sends it in a sandboxed
 * frame of its own. A frame on another SITE is put in a process of its own
 * by Chrome's site isolation. A subdomain of storelib.com would not be: it is
 * the same site.
 *
 * Nothing about the page's own isolation changes: the theme still runs in a
 * sandboxed frame with no origin and no cookies. What changes is who the
 * editor talks to: the shell on the canvas origin, by postMessage with that
 * exact target origin, and only messages from that origin are heard.
 *
 * Pure: safe on the client and the server.
 */

/** Where canvas documents live: `/__canvas/<installId>` on the canvas origin (lib/onepage/host-route.ts sends it to the route below). */
export const CANVAS_FRAME_PATH = "/__canvas/"
/** The route that answers it, reached only through that rewrite and only on the canvas host. */
export const CANVAS_FRAME_ROUTE = "/api/website-builder/canvas-frame/"

/** An install id as the canvas address takes it. */
export const CANVAS_INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The origin a setting names, or null when it is unset or is not a bare
 * http(s) origin (a path, a query or credentials in it turn the mode off
 * rather than guess).
 */
export function canvasOriginFrom(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== "/")) return null
  return u.origin
}

/** The canvas origin this build was made with, or null (the default): every frame is srcdoc, as before. */
export const CANVAS_ORIGIN: string | null = canvasOriginFrom(process.env.NEXT_PUBLIC_CANVAS_ORIGIN)

/**
 * The address of one canvas frame: the install, its draft pass (the route
 * answers nothing without it), and the editor's origin, which the shell
 * answers to and nothing else.
 */
export function canvasFrameUrl(origin: string, installId: string, pass: string, editorOrigin: string): string {
  const q = new URLSearchParams({ pass, editor: editorOrigin })
  return `${origin}${CANVAS_FRAME_PATH}${encodeURIComponent(installId)}?${q.toString()}`
}
