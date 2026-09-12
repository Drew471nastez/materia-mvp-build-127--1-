import type React from "react"

/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE IS NOT A MARKETING PAGE
 * ===========================================================================
 * These routes used to sit under `(marketing)`, whose layout reads `cookies()`
 * for the wishlist badge and `headers()` for the host. Either one makes every
 * route beneath it render again for every visitor, forever — which is why the
 * cache rules in `next.config` never landed on `/`, `/blog`, `/explore` or a
 * published site. Measured on the live site before this moved: all four came
 * back `private, no-cache, no-store`, whatever the config said.
 *
 * None of that chrome belonged here anyway. A published site draws its own
 * header and footer from the creator's theme; the platform header hid itself
 * on a seller's domain after hydration, and the native padding rule pushed
 * the page down by 68px for a header that was not there.
 *
 * So: no dynamic reads, nothing wrapped, and the pages below decide their own
 * caching. The product routes stay dynamic, because a cart is per visitor.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return children
}
