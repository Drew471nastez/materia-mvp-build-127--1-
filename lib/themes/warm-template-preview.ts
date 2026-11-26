/**
 * A TEMPLATE'S WEBSITE, FETCHED WHILE THE POINTER RESTS ON ITS CARD (round 28).
 *
 * On storelib.com the Preview frames the website from www.storelib.com
 * (templatePreviewFrame), a frame with an origin, so the browser keeps its
 * files in the same place it keeps this page's: what is fetched here is what
 * the frame then finds. A pointer resting on a card (or a finger pressing
 * it) fetches the website's home page and asks for the stylesheets and
 * scripts it names, at low priority, so the press opens a website that is
 * mostly here already. Most of those files are the base theme's, shared by
 * every template, so a second card costs little. Once per template, a few
 * templates a visit at most. A frame with no origin (anywhere but
 * storelib.com) keeps nothing, so there it does nothing.
 */
import { templatePreviewFrame, templatePreviewPath, type ThemeListing } from "./marketplace-shared"

/** A pointer must rest this long on a card before its website is fetched. */
export const WARM_AFTER_MS = 140
const MAX_WARMED = 6
const warmed = new Set<string>()

/** The theme's stylesheets and scripts a page names, as addresses under the preview folder. */
export function previewFilesOf(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="(\/theme-previews\/[^"?#]+\.(?:css|js))"/g)) out.add(m[1])
  return [...out]
}

export function warmTemplatePreview(listing: Pick<ThemeListing, "codePackage">): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return
  const path = templatePreviewPath(listing)
  if (!path) return
  const frame = templatePreviewFrame(path)
  if (!frame.sandbox.includes("allow-same-origin")) return
  if (warmed.has(frame.src) || warmed.size >= MAX_WARMED) return
  /* Not on a connection that asks to save data. */
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return
  warmed.add(frame.src)
  const origin = new URL(frame.src).origin
  void fetch(frame.src, { mode: "cors", credentials: "omit", priority: "low" } as RequestInit)
    .then((r) => (r.ok ? r.text() : ""))
    .then((html) => {
      for (const file of previewFilesOf(html)) {
        const link = document.createElement("link")
        link.rel = "prefetch"
        link.href = origin + file
        link.setAttribute("data-template-warm", "")
        /* Once it is in the browser's cache the element has done its work. */
        link.onload = link.onerror = () => link.remove()
        document.head.appendChild(link)
      }
    })
    .catch(() => {
      warmed.delete(frame.src)
    })
}
