"use client"

import { createListReturn } from "@/components/app/list-return"
import type { CouponReturn } from "./coupon-form"

export type { CouponReturn }

/**
 * ===========================================================================
 *  BETWEEN THE COUPONS LIST AND A COUPON
 * ===========================================================================
 * The one round trip every commerce list in /app makes with the page its
 * rows open (components/app/list-return.ts createListReturn): Coupons,
 * Upsells and bundles, Collections and Size charts. One move each way, a
 * history that stays honest (a back when the list opened the page, a
 * replace marked as a return otherwise), the list as far down as it was
 * left, and what a save or a delete did laid over its rows.
 *
 * The names below are the ones the coupon pages have always called.
 */

export const COUPONS_HREF = "/app/coupons"

const couponsReturn = createListReturn<CouponReturn>(COUPONS_HREF)

type Router = Parameters<typeof couponsReturn.open>[0]

/** Open a coupon, or a new one, from the list. */
export const openCoupon = (router: Router, href: string) => couponsReturn.open(router, href)

/** The editor's side: was it opened by the list, one history entry after it? */
export const useCouponListOrigin = () => couponsReturn.useOrigin()

/** Leave the editor for the list, with what it did. A back that goes nowhere still ends on the list. */
export const returnToCoupons = (router: Router, what: CouponReturn) => couponsReturn.leave(router, what)

/** Is the list about to draw a return rather than a fresh visit? Read while it renders its first state. */
export const isReturning = () => couponsReturn.isReturning()

/** What the editor did, without taking it: read by the list's first state. */
export const peekReturn = () => couponsReturn.peek()

/** The list is on the screen: what the editor did, once. */
export const takeReturn = () => couponsReturn.take()

/** The list, fetched ahead, so the way back is instant. */
export const warmCoupons = (router: Router) => couponsReturn.warm(router)
