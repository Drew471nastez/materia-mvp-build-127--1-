"use client"

/**
 * ===========================================================================
 *  IS A LAYER HOLDING THE PAGE STILL RIGHT NOW
 * ===========================================================================
 * Radix locks the page behind a modal through react-remove-scroll, and what
 * that does was measured rather than assumed. On a product page scrolled to
 * 480px, with the share sheet open:
 *
 *   body[data-scroll-locked]   present
 *   body { overflow: hidden; position: relative }
 *
 * THAT BREAKS `position: sticky`, and this hook exists because of what the
 * breakage looks like. A sticky element sticks to its nearest SCROLLING
 * ancestor; give the body `overflow: hidden` and there is no longer one, so
 * the element drops to its static place in the document — which, on a page
 * scrolled 480px down, is 480px above the top of the screen.
 *
 * So opening the share sheet did not dim the product page's top bar, it
 * launched it off the top of the window. Measured, before and after, on the
 * same element:
 *
 *   before   top 0     bottom 53
 *   open     top -480  bottom -427
 *
 * The bar's own hide-on-scroll state was untouched the whole time — the class
 * that hides it was absent and its transform was `none`. Nothing hid it. It
 * simply stopped being sticky.
 *
 * `data-scroll-locked` is what components/body-scroll-restorer already
 * watches for the same reason, so this reads the marker that is already the
 * platform's answer to "is the page held".
 */

import { useEffect, useState } from "react"

const LOCK_ATTR = "data-scroll-locked"

function locked(): boolean {
  if (typeof document === "undefined") return false
  return (
    document.body.hasAttribute(LOCK_ATTR) ||
    document.documentElement.hasAttribute(LOCK_ATTR)
  )
}

export function useScrollLocked(): boolean {
  /* False on the server and on the first client render, so the markup the
     server sent and the markup the browser builds agree. A modal cannot be
     open before hydration anyway. */
  const [isLocked, setIsLocked] = useState(false)

  useEffect(() => {
    const read = () => setIsLocked((was) => {
      const now = locked()
      return was === now ? was : now
    })
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.body, { attributes: true, attributeFilter: [LOCK_ATTR] })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [LOCK_ATTR] })
    return () => observer.disconnect()
  }, [])

  return isLocked
}
