/**
 * The editor and the preview frame are two documents, and three messages
 * cross between them (components/onepage/live-preview.tsx, the editor's
 * side; components/onepage/preview-document.tsx, the frame's):
 *
 *   "ready"  the frame has loaded and is listening: the editor sends the page
 *   "page"   the page as it is being edited, in the shape the published page
 *            is drawn from (lib/onepage/public-shape), with the store's
 *            currency: the live page draws its prices in it
 *            (app/(marketing)/l/[slug]/page.tsx PriceCurrency), so the
 *            preview must too, or a euro store's 24 read "24.00 lei" here
 *            and "€24.00" live
 *   "drawn"  the frame has drawn the page once, fonts included: the
 *            editor's loader can go
 *
 * Only between documents on this origin, and only from the frame's own
 * parent: both sides check.
 */
import type { PublicOnePageData } from "@/lib/onepage/public-shape"

export const ONEPAGE_PREVIEW_CHANNEL = "storelib-onepage-preview"

/** Where the frame lives. `embedded=1` is what lets the editor frame it (proxy.ts). */
export const ONEPAGE_PREVIEW_PATH = "/onepage-preview?embedded=1"

export type PreviewMessage =
  | { channel: typeof ONEPAGE_PREVIEW_CHANNEL; kind: "ready" }
  | { channel: typeof ONEPAGE_PREVIEW_CHANNEL; kind: "drawn" }
  | { channel: typeof ONEPAGE_PREVIEW_CHANNEL; kind: "page"; page: PublicOnePageData; currency?: string | null }
