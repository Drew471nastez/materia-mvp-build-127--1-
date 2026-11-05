import type { Metadata } from "next"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"

/**
 * The OnePage editor's preview: the live page's own component, drawn from
 * the page the editor posts in (components/onepage/preview-document.tsx).
 * Nothing is read here, so nothing is waited for: the document is the same
 * for everybody and the page arrives by message.
 *
 * Never listed, and framed only by the editor on this origin (proxy.ts).
 */
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
}

export default function OnePagePreviewRoute() {
  return <OnePagePreviewDocument />
}
