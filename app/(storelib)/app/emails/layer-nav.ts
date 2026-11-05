"use client"

import type React from "react"
import { moveLayer } from "@/components/app/page-layer"

/**
 * The composer (/app/emails/new, /app/emails/edit/<id>) and the automation
 * pages (/app/emails/flow/...) are full screen layers on a phone
 * (components/app/page-layer.tsx). Going into one from the Emails list and
 * coming back out are the layer's own move, the one the product editor and
 * the coupon editor make (moveLayer): on a phone the layer comes in over the
 * list and goes off it again, from 768px nothing moves and the page lands as
 * every page does. How it moves is page-layer.tsx's business, not this
 * file's.
 */

type Router = { push: (href: string) => void }

/** Open a layer page from the list. */
export function openLayer(router: Router, href: string) {
  moveLayer("enter", () => router.push(href))
}

/** Leave a layer page: `go` is the navigation (a history back, or a push to the list). */
export function leaveLayer(go: () => void) {
  moveLayer("leave", go)
}

/**
 * A link that opens a layer page. A plain click is the layer's move; a click
 * that asks for a new tab or window is left to the browser, as a link.
 */
export function layerLinkClick(router: Router, href: string) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    openLayer(router, href)
  }
}
