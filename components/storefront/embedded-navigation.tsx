"use client"

/**
 * ===========================================================================
 *  LINKS INSIDE THE EDITOR'S CANVAS
 * ===========================================================================
 * The workspace frames the real creator page, which is the whole point: the
 * controls a creator uses are the ones a visitor's browser runs. The real
 * page has links out of it, though, and following one used to end in
 * "storelib.com refused to connect" — the product page is served with
 * X-Frame-Options like everything else, and nothing had told it otherwise.
 *
 * The proxy relaxes framing for a product page carrying `?embedded=1` and for
 * nothing else, so what is left is putting the flag on the link. Two ways to
 * do that were available:
 *
 *   Thread `embedded` through every component that renders a product link.
 *   That is ProductCard, the storefront card, the grids, the carousel, the
 *   About block, and any one of them missed is a dead end that nobody finds
 *   until a creator does.
 *
 *   Catch the click. One listener, on the document, for the whole canvas.
 *
 * The second. It is delegated, so it covers markup that did not exist when it
 * mounted, and it is one place to read rather than a prop with six call
 * sites.
 *
 * WHAT IT WILL NOT TOUCH. Anything with a modifier held down (a new tab is a
 * real tab, outside the frame, where the flag would be wrong), `target="_top"`
 * — which is how the owner menu deliberately breaks OUT of the canvas —
 * another origin, a download, or a link that has already been handled.
 *
 * It only mounts inside a frame, so on a public page there is no listener at
 * all.
 */

import { useEffect } from "react"

import { canvasRefusesHref, embeddedHref, isInEditorFrame } from "@/lib/store-builder/editor-channel"

export function EmbeddedNavigation() {
  useEffect(() => {
    if (!isInEditorFrame()) return

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest?.("a")
      if (!anchor) return
      const target = anchor.getAttribute("target")
      /* _top is how a control deliberately leaves the canvas. Leave it alone. */
      if (target && target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const href = anchor.getAttribute("href")

      /* Browsing, not buying. A link into checkout or into the app is not
         followed at all rather than followed into a page that cannot be
         framed. See CANVAS_WILL_NOT_FOLLOW. */
      if (canvasRefusesHref(href, window.location.href)) {
        event.preventDefault()
        return
      }

      /* What to refuse is the interesting half, and it is a pure function so
         it can be tested without a browser. See editor-channel. */
      const next = embeddedHref(href, window.location.href)
      if (!next) return

      event.preventDefault()
      window.location.assign(next)
    }

    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])

  return null
}
