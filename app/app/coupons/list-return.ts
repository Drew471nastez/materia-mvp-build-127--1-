"use client"

import { useEffect } from "react"
import { moveLayer } from "@/components/app/page-layer"
import { backThen } from "@/lib/navigation/go-back"
import { isTraversing, markTraversal, prefetchAppPage } from "@/lib/ui/app-navigation"
import type { CouponReturn } from "./coupon-form"

export type { CouponReturn }

/**
 * ===========================================================================
 *  BETWEEN THE COUPONS LIST AND A COUPON
 * ===========================================================================
 * The same round trip as the products list and the product editor
 * (app/app/products/list-return.ts), for the coupon editor:
 *
 *   ONE MOVE EACH WAY. On a phone the editor rises from the bottom over the
 *   list and drops back down to it (components/app/page-layer), and the
 *   press that did it answers on its own frame (moveLayer); from 768px the
 *   page lands as every page does.
 *
 *   THE HISTORY STAYS HONEST. An editor the list opened is one history entry
 *   after it, so leaving is router.back(); one opened any other way (a link,
 *   a reload) is replaced by the list, marked as a return.
 *
 *   WHERE YOU WERE. Both ways back are a return, so the stage puts the list's
 *   scroll back and the list takes up the view it was on (isReturning).
 *
 *   WHAT CHANGED. A save or a delete hands the list what it did (the saved
 *   row, or the id that is gone) and a line to say. The list the router kept
 *   was drawn before the save, so it lays the change over its rows on its
 *   first frame, says the line, tints the row, and then asks the server for
 *   the list again (router.refresh), which also drops every page the router
 *   had kept from before the save.
 */

type Router = {
  push: (href: string) => void
  replace: (href: string) => void
  back: () => void
  prefetch: (href: string, options?: never) => void
}

export const COUPONS_HREF = "/app/coupons"

let handoff: CouponReturn | null = null
let pushedAt: number | null = null
let fromList = false
let editors = 0
let returnTo: string | null = null
const PUSH_KEPT_MS = 10_000

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    returnTo = window.location.pathname
  })
}

/** Open a coupon, or a new one, from the list. */
export function openCoupon(router: Router, href: string) {
  moveLayer("enter", () => {
    pushedAt = Date.now()
    router.push(href)
  })
}

/** The editor's side: was it opened by the list, one history entry after it? */
export function useCouponListOrigin() {
  useEffect(() => {
    editors++
    if (pushedAt !== null && Date.now() - pushedAt < PUSH_KEPT_MS) fromList = true
    pushedAt = null
    return () => {
      editors--
      window.setTimeout(() => {
        if (editors === 0) fromList = false
      }, 0)
    }
  }, [])
}

/**
 * Leave the editor for the list, with what it did.
 *
 * A BACK THAT GOES NOWHERE STILL ENDS ON THE LIST, for the same reason as the
 * products list (app/app/products/list-return.ts returnToProducts): the note
 * that says the list opened this editor is the app's own, and a coupon opened
 * from a link, a notification or a replaced entry has no list behind it.
 * `history.back()` reports nothing when it does nothing, so the layer used to
 * hang over a dimmed Back for LAYER_PRESS_KEPT_MS (8s) and then come back to
 * life on the same editor.
 */
export function returnToCoupons(router: Router, what: CouponReturn) {
  handoff = what
  returnTo = COUPONS_HREF
  const back = fromList
  fromList = false
  const replaceWithList = () => {
    markTraversal()
    router.replace(COUPONS_HREF)
  }
  moveLayer("leave", () => {
    if (back) backThen(replaceWithList)
    else replaceWithList()
  })
}

/** Is the list about to draw a return rather than a fresh visit? Read while it renders its first state. */
export function isReturning() {
  return returnTo === COUPONS_HREF || isTraversing()
}

/** What the editor did, without taking it: read by the list's first state. */
export function peekReturn(): CouponReturn | null {
  return handoff
}

/** The list is on the screen: what the editor did, once. */
export function takeReturn(): CouponReturn | null {
  const what = handoff
  handoff = null
  pushedAt = null
  returnTo = null
  return what
}

/** The list, fetched ahead, so the way back is instant. */
export function warmCoupons(router: Router) {
  prefetchAppPage(router, COUPONS_HREF)
}
