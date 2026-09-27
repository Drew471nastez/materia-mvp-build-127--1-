"use client"

/**
 * ===========================================================================
 *  ONE BROKEN SECTION IS NOT A BROKEN SHOP
 * ===========================================================================
 * A creator's page is their storefront. When a fault in one part of it takes
 * the whole page down, what a visitor gets is "Something went wrong" where
 * the products were, and the creator loses the sale — for a fault that had
 * nothing to do with the products.
 *
 * That is not hypothetical. An icon passed across the server/client boundary
 * from the Communities empty state threw during the render, and every
 * creator's live page went to the error screen: not just the page being
 * edited, and not just the tab the fault was in.
 *
 * So the SECONDARY parts of the page are wrapped in this. If one throws it
 * renders nothing and the rest of the shop is untouched — the header, the
 * products, the way to buy. A missing reviews block is a bad afternoon; a
 * missing shop is a bad week.
 *
 * WHAT IS NOT WRAPPED, DELIBERATELY: the products themselves. Swallowing a
 * fault there would leave a page that looks fine and sells nothing, which is
 * worse than a page that says it is broken. A shop with no products on it
 * should fail loudly enough that somebody fixes it.
 */
import * as React from "react"
import { recoverFromStaleCode } from "@/lib/ui/stale-code"

interface Props {
  children: React.ReactNode
  /** Named in the report, so a swallowed fault is still findable. */
  name: string
}

export class SafeRegion extends React.Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    /* A section whose code a deploy renamed is not a fault: the page loads
       again (or offers to), and the section comes back (lib/ui/stale-code). */
    if (recoverFromStaleCode(error)) return
    /*
      SWALLOWED ON THE PAGE, NOT IN THE LOGS. A section that quietly stops
      appearing and reports nothing is a bug nobody finds until a creator
      asks where their reviews went. Same narrow payload the boundaries
      elsewhere send: the message, the region, the path with no query.
    */
    try {
      const message = error instanceof Error ? error.message : String(error)
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          message: `[region:${this.props.name}] ${message}`.slice(0, 500),
          digest: (error as { digest?: string })?.digest ?? null,
          path: typeof window === "undefined" ? "" : window.location.pathname,
          stale: false,
        }),
      }).catch(() => {})
    } catch {
      /* Reporting a fault must never be the thing that throws. */
    }
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
