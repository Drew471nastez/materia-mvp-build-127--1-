"use client"

/**
 * A LINK MARKED "OPEN IN A NEW TAB" OPENS IN ONE
 *
 * The link picker marks such a link with `#_blank` at the end of its address
 * (lib/website-builder/new-tab.ts). Here, on the published website, a marked
 * link in the page becomes a real one: the mark comes off the address and
 * `target="_blank" rel="noopener noreferrer"` goes on, so hovering it shows
 * the true address and a long press offers the usual new tab. A section that
 * draws its markup out of the document's reach (a shadow root) is caught on
 * the click instead, through the event's path, as CheckoutLinkOrigin does.
 * Nothing is stored and nothing else is touched.
 */

import { useEffect } from "react"
import { NEW_TAB_MARK, opensNewTab, withoutNewTab } from "@/lib/website-builder/new-tab"

const MARKED = `a[href$="${NEW_TAB_MARK}"]`

function settle(a: HTMLAnchorElement) {
  const href = a.getAttribute("href") || ""
  if (!opensNewTab(href)) return
  a.setAttribute("href", withoutNewTab(href))
  a.setAttribute("target", "_blank")
  a.setAttribute("rel", "noopener noreferrer")
}

export function NewTabLinks() {
  useEffect(() => {
    document.querySelectorAll<HTMLAnchorElement>(MARKED).forEach(settle)
    const watch = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.target instanceof HTMLAnchorElement) settle(r.target)
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return
          if (n instanceof HTMLAnchorElement) settle(n)
          n.querySelectorAll?.<HTMLAnchorElement>(MARKED).forEach(settle)
        })
      }
    })
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] })

    const onClick = (event: MouseEvent) => {
      const a = event.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement && n.hasAttribute("href"))
      if (!a) return
      const href = a.getAttribute("href") || ""
      if (!opensNewTab(href)) return
      event.preventDefault()
      window.open(withoutNewTab(href), "_blank", "noopener,noreferrer")
    }
    document.addEventListener("click", onClick, true)
    return () => {
      watch.disconnect()
      document.removeEventListener("click", onClick, true)
    }
  }, [])
  return null
}
