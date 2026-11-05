import type { Metadata } from "next"
import StorelibLayout, { metadata as storelibMetadata, viewport } from "@/app/(storelib)/layout"
import NotFound, { metadata as notFoundMetadata } from "@/app/(storelib)/not-found"

/**
 * AN ADDRESS NO ROUTE MATCHES, ON ANY HOST (round 52). Storelib's pages and
 * the published websites have a root layout each (app/(storelib)/layout.tsx,
 * app/(site)/layout.tsx), so an address that matches neither has no layout
 * to be drawn in: Next draws this instead (experimental.globalNotFound in
 * next.config.mjs). It is the shared 404 as it was, in Storelib's document:
 * Storelib's on storelib.com, and the creator's own on their address
 * (components/platform/not-found-body.tsx).
 */
export const metadata: Metadata = { ...storelibMetadata, ...notFoundMetadata }
export { viewport }

export default function GlobalNotFound() {
  return (
    <StorelibLayout>
      <NotFound />
    </StorelibLayout>
  )
}
