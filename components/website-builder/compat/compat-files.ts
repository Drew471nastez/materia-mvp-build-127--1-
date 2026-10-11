/**
 * An imported theme's own files (`shopify/…`), read once per install for the
 * canvas, the settings panel and the section previews together. Its own
 * module, with nothing heavy in it, so the editor can ask for the files on its
 * first frame while the canvas's code (compat-canvas.tsx, loaded only for an
 * imported theme) is still on its way.
 *
 * NEVER WAITED FOR FOREVER, AND A FAILURE IS NOT AN EMPTY THEME
 * (lib/website-builder/load-guard.ts). A request that never answered left the
 * canvas on its grey outline for good, and one that failed was kept for the
 * rest of the visit as "this theme has no files". Each try now has an end
 * (headers and body together), a failure is tried again twice, and one that
 * still fails rejects, is said to the error log, and is forgotten, so the
 * canvas can say so and its Try again asks the server again.
 */
import { deadline, fetchWithin, reportLoadProblem, retrying } from "@/lib/website-builder/load-guard"

/** One try at the theme's files, headers and body together. */
export const FILES_WAIT_MS = 25_000

const loading = new Map<string, Promise<Record<string, string>>>()

export function loadCompatFiles(installId: string): Promise<Record<string, string>> {
  const hit = loading.get(installId)
  if (hit) return hit
  const p = retrying(
    () =>
      deadline(
        (async () => {
          const r = await fetchWithin(`/api/website-builder/themes/${installId}/files?compat=1`, {}, FILES_WAIT_MS)
          if (!r.ok) throw new Error(`the theme's files answered ${r.status}`)
          const d = (await r.json()) as { files?: Record<string, string> }
          return d.files ?? {}
        })(),
        FILES_WAIT_MS,
        "the theme's files",
      ),
    [800, 2000],
  )
  /* A failure is forgotten, so the next ask (Try again, another panel) asks the server again. */
  p.catch((e) => {
    if (loading.get(installId) === p) loading.delete(installId)
    reportLoadProblem("compat-canvas", e)
  })
  loading.set(installId, p)
  return p
}

/** Forget what was read, so the next ask asks the server again (the canvas's Try again after an answer that could not be drawn). */
export function forgetCompatFiles(installId: string): void {
  loading.delete(installId)
}
