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
import { useSyncExternalStore } from "react"
import { deadline, fetchWithin, reportLoadProblem, retrying } from "@/lib/website-builder/load-guard"

/** One try at the theme's files, headers and body together. */
export const FILES_WAIT_MS = 25_000

/*
 * THE FILES CHANGE UNDER AN OPEN EDITOR. A push or an agent that writes a
 * theme file says so here once (compatFilesChanged, from the editor's
 * activity poll), and whatever was read before is read again the next time
 * anything asks: the canvas, the settings panel, and the block library, which
 * stays mounted through a push and used to keep drawing its covers from the
 * code as it was before. The first to ask reads the files again; the others
 * share that read.
 */
const versions = new Map<string, number>()
const listeners = new Set<() => void>()
const loading = new Map<string, { version: number; files: Promise<Record<string, string>> }>()

/** The install's files changed somewhere else: the next ask reads them again, and whoever watches the version draws again. */
export function compatFilesChanged(installId: string): void {
  versions.set(installId, (versions.get(installId) ?? 0) + 1)
  for (const l of listeners) l()
}

/**
 * A push changed these files and the editor already has the new text.
 * The next reader gets the patched copy, and does not download the rest of
 * the theme again. False when nothing has been read yet: the caller asks
 * for the whole set (compatFilesChanged).
 */
export function patchCompatFiles(installId: string, patch: Record<string, string>): boolean {
  const hit = loading.get(installId)
  if (!hit || hit.version !== (versions.get(installId) ?? 0)) return false
  const version = (versions.get(installId) ?? 0) + 1
  versions.set(installId, version)
  const files = hit.files.then((current) => {
    let next = current
    for (const [k, v] of Object.entries(patch)) {
      if (next[k] === v) continue
      if (next === current) next = { ...current }
      next[k] = v
    }
    return next
  })
  files.catch((e) => {
    if (loading.get(installId)?.files === files) loading.delete(installId)
    reportLoadProblem("compat-canvas", e)
  })
  loading.set(installId, { version, files })
  for (const l of listeners) l()
  return true
}

/** Which version of the install's files is current, for an effect that reads them to depend on. */
export function useCompatFilesVersion(installId: string | null): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (installId ? (versions.get(installId) ?? 0) : 0),
    () => 0,
  )
}

export function loadCompatFiles(installId: string): Promise<Record<string, string>> {
  const version = versions.get(installId) ?? 0
  const hit = loading.get(installId)
  if (hit && hit.version === version) return hit.files
  const p = retrying(
    () =>
      deadline(
        (async () => {
          const r = await fetchWithin(`/api/website-builder/themes/${installId}/files?compat=1`, { cache: "no-store" }, FILES_WAIT_MS)
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
    if (loading.get(installId)?.files === p) loading.delete(installId)
    reportLoadProblem("compat-canvas", e)
  })
  loading.set(installId, { version, files: p })
  return p
}

/** Forget what was read, so the next ask asks the server again (the canvas's Try again after an answer that could not be drawn). */
export function forgetCompatFiles(installId: string): void {
  loading.delete(installId)
}
