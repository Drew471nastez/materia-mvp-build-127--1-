import type { Metadata } from "next"
import { CheckoutPreviewDocument } from "./preview-document"

/**
 * The checkout text editor's preview: the website's own checkout, thank you
 * page and order page, drawn from what the editor posts in
 * (./preview-document.tsx, lib/checkout-text/preview.ts). Nothing is read
 * here, so nothing is waited for: the document is the same for everybody
 * and the store's checkout arrives by message from the editor on this
 * origin, which read it with the owner's session.
 *
 * Never listed, and framed only by the editor on this origin (proxy.ts).
 */
export const metadata: Metadata = {
  title: "Checkout preview",
  robots: { index: false, follow: false },
}

export default function CheckoutPreviewRoute() {
  return <CheckoutPreviewDocument />
}
