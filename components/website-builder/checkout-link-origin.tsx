"use client"

/**
 * A LINK TO CHECKOUT ON A WEBSITE SAYS WHICH WEBSITE, AND FROM WHERE
 *
 * A section links to checkout with `/checkout?productId=…&src=website`, in
 * markup the creator or their agent wrote (lib/developers "Selling"). That
 * says a website sent the buyer, and nothing more: the checkout is on
 * storelib.com, and the website's own page, and the address its visit came
 * in from, are behind it.
 *
 * So as such a link is followed, the website's address and where its visit
 * came from are added to it (lib/orders/checkout-origin), for the order's
 * Source. Only links to /checkout on this same site are touched, only keys
 * the link does not already carry are added, and nothing is stored.
 *
 * The capture phase and the event's path, because a section can draw its
 * markup where a bubbling listener on the document would see only its host.
 */

import { useEffect } from "react"
import { checkoutHrefWithOrigin } from "@/lib/orders/checkout-origin"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"

export function CheckoutLinkOrigin() {
  useEffect(() => {
    const onActivate = (event: MouseEvent) => {
      const anchor = event.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement && n.hasAttribute("href"))
      if (!anchor) return
      let url: URL
      try {
        url = new URL(anchor.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || url.pathname !== "/checkout") return
      const href = anchor.getAttribute("href") || ""
      const next = checkoutHrefWithOrigin(href, pageOrigin())
      if (next !== href) anchor.setAttribute("href", next)
    }
    document.addEventListener("click", onActivate, true)
    document.addEventListener("auxclick", onActivate, true)
    return () => {
      document.removeEventListener("click", onActivate, true)
      document.removeEventListener("auxclick", onActivate, true)
    }
  }, [])
  return null
}
