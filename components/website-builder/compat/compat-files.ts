/**
 * An imported theme's own files (`shopify/…`), read once per install for the
 * canvas, the settings panel and the section previews together. Its own
 * module, with nothing heavy in it, so the editor can ask for the files on its
 * first frame while the canvas's code (compat-canvas.tsx, loaded only for an
 * imported theme) is still on its way.
 */
const loading = new Map<string, Promise<Record<string, string>>>()

export function loadCompatFiles(installId: string): Promise<Record<string, string>> {
  const hit = loading.get(installId)
  if (hit) return hit
  const p = fetch(`/api/website-builder/themes/${installId}/files?compat=1`)
    .then((r) => (r.ok ? r.json() : { files: {} }))
    .then((d: { files?: Record<string, string> }) => d.files ?? {})
    .catch(() => {
      loading.delete(installId)
      return {} as Record<string, string>
    })
  loading.set(installId, p)
  return p
}
