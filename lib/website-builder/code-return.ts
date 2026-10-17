/**
 * Where the code editor's Back goes on a phone: the builder, on the page and
 * at the section the code was opened from (the builder's openCode sends
 * `previewPath` and `section`; the builder opens that section again once it
 * has loaded). Only a section id and a path on this site are passed along,
 * never an address somewhere else. Pure.
 */
export function backToEditorHref(installId: string, search: string): string {
  const from = new URLSearchParams(search)
  const q = new URLSearchParams()
  const preview = from.get("previewPath")
  if (preview && preview.startsWith("/") && !preview.startsWith("//") && !preview.includes("\\") && preview.length <= 300) q.set("previewPath", preview)
  const section = from.get("section")
  if (section && /^[A-Za-z0-9_:-]{1,128}$/.test(section)) q.set("section", section)
  const tail = q.toString()
  return `/website-builder/editor/${encodeURIComponent(installId)}${tail ? `?${tail}` : ""}`
}
