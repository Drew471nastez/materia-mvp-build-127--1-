/**
 * ===========================================================================
 *  INSIDE THE EDITOR'S PREVIEW, NOTHING LEAVES IT
 * ===========================================================================
 * The owner: "When I click buttons, it should not take me outside of it."
 * The preview (components/onepage/preview-document) is the live page in a
 * frame, so every link, share button and checkout on it would leave: the
 * frame went somewhere else, or a tab opened over the editor.
 *
 * Now what only makes sense on the live page (a link out, the checkout, the
 * product page, a share, a payment) stays put and says so: a short note at
 * the foot of the frame, "Opens on your live page". What happens on the page
 * itself (a product sheet, the checkout window, the share card) still opens,
 * inside the frame, as it does live.
 *
 * The document sets `window.__onepagePreviewSandbox` before the page draws,
 * so any part of the page can ask, and the note is one event the document
 * draws (PreviewNoticeHost).
 */

export const PREVIEW_NOTICE_EVENT = "onepage:preview-notice"

export type PreviewNoticeKind = "link" | "payment"

/** Is this page being drawn inside the editor's preview frame? */
export function isOnePagePreview(): boolean {
  if (typeof window === "undefined") return false
  return (window as Window & { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox === true
}

/** Say, inside the preview, why nothing left it. */
export function showPreviewNotice(kind: PreviewNoticeKind = "link"): void {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new CustomEvent(PREVIEW_NOTICE_EVENT, { detail: { kind } }))
  } catch {
    /* an old browser without CustomEvent: nothing is said, and still nothing leaves */
  }
}
