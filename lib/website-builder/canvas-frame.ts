import "server-only"
import { isDraftAssetPass } from "./draft-asset-pass"
import { CANVAS_INSTALL_ID, CANVAS_ORIGIN, canvasOriginFrom } from "./canvas-origin"
import { canvasShellHtml } from "@/lib/storelib-theme/compat/canvas-shell"

/**
 * ===========================================================================
 *  THE ANSWER AT storelib.me/__canvas/<installId> (./canvas-origin.ts)
 * ===========================================================================
 * Pure but for the pass check, so every case is pinned by a test without a
 * server (tests/canvas-origin.test.ts).
 *
 *   OFF                 404 unless NEXT_PUBLIC_CANVAS_ORIGIN is set
 *   ANOTHER HOST        404: only the canvas origin's host answers it, so
 *                       storelib.com/api/... never does
 *   NO PASS             404 without the install's draft asset pass
 *                       (./draft-asset-pass.ts), which only the owner's
 *                       editor is handed; the shell holds nothing of the
 *                       store either way, it is the editor that sends the page
 *   ANOTHER EDITOR      404 unless `editor` is one of the builder's own
 *                       origins: storelib.com (and www), the app's own
 *                       address, this deployment's own vercel.app address,
 *                       and a developer's localhost outside production
 *
 * Framed only by that one editor origin (frame-ancestors), never cached by a
 * shared cache, never indexed, and with a referrer that names only the
 * origin, so the pass in its address goes nowhere.
 */

/** The builder's own origins, any one of which may frame the canvas. */
export function editorOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const main = (env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").trim().toLowerCase()
  const out = new Set<string>()
  if (main && !main.includes("localhost")) {
    out.add(`https://${main}`)
    out.add(`https://www.${main}`)
  }
  const app = canvasOriginFrom(env.NEXT_PUBLIC_APP_URL)
  if (app) out.add(app)
  /* This deployment's own address (a preview's), exactly: never any vercel.app. */
  for (const v of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) if (v && /^[a-z0-9.-]+$/i.test(v)) out.add(`https://${v.toLowerCase()}`)
  return [...out]
}

function isEditorOrigin(origin: string, env: Record<string, string | undefined>): boolean {
  if (editorOrigins(env).includes(origin)) return true
  if (env.NODE_ENV === "production") return false
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)
}

export interface CanvasFrameAnswer {
  status: 200 | 404
  headers: Record<string, string>
  body: string
}

const MISSING: CanvasFrameAnswer = {
  status: 404,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  body: "Not found",
}

export function canvasFrameAnswer(
  input: { host: string | null; installId: string; pass: string | null; editor: string | null },
  env: Record<string, string | undefined> = process.env,
  origin: string | null = CANVAS_ORIGIN,
): CanvasFrameAnswer {
  if (!origin) return MISSING
  const host = (input.host || "").trim().toLowerCase()
  if (!host || host !== new URL(origin).host) return MISSING
  if (!CANVAS_INSTALL_ID.test(input.installId)) return MISSING
  const editor = canvasOriginFrom(input.editor)
  if (!editor || editor === origin || !isEditorOrigin(editor, env)) return MISSING
  if (!isDraftAssetPass(input.installId, input.pass)) return MISSING
  return {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      /*
        Only frame-ancestors: the page drawn inside takes this document's
        policy (a srcdoc frame inherits it), and anything more would hold back
        the theme's own scripts, styles and pictures.
      */
      "Content-Security-Policy": `frame-ancestors ${editor}`,
      "Referrer-Policy": "strict-origin",
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
    body: canvasShellHtml(editor),
  }
}
