/**
 * The editor's preview is the live page now, framed at a phone's width
 * (components/onepage/live-preview.tsx, components/onepage/preview-document.tsx).
 *
 * This file used to hold a second drawing of the OnePage, over five thousand
 * lines kept beside components/onepage/public-onepage.tsx, and the two had
 * drifted in every block (scripts/check-onepage-parity.mjs measured it). It
 * stays as the old import path and nothing else.
 */
export { PhonePreview, MobilePreviewContent } from "./live-preview"
