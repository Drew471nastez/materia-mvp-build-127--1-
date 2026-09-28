"use client"

/**
 * ===========================================================================
 *  A CONTROL THAT NAMES WHERE IT GOES, AND RETURNS THERE RATHER THAN GOING
 * ===========================================================================
 * "Back to product", "Back to Orders", "Library" — every one of these names
 * the page the visitor came FROM, and every one of them was a link. A link
 * pushes. So pressing it left the history one entry longer than it started,
 * and the NEXT back went forward.
 *
 * Reproduced on production, reading history.length at each step:
 *
 *     explore                2
 *     product                3
 *     checkout               4
 *     "Back to product"      5   <- a push; a return would have left it at 4
 *     the product's back     5   -> lands on /checkout
 *
 * That last line is what was reported as the product page's back arrow being
 * broken. It was not: it popped exactly one entry, and the entry behind it was
 * the checkout, because the checkout's own control had put a second copy of
 * the product page on top of it.
 *
 * ---------------------------------------------------------------------------
 * IT IS STILL A REAL LINK. Middle-click, ctrl-click, right-click-copy, the
 * keyboard, and a visitor who arrived on this page from a shared URL with no
 * history behind them — all of those need an href, and all of them still get
 * one. The only case this intercepts is the plain left-click, and only when
 * the entry behind really is the page named on it; `canReturnTo` compares the
 * path rather than assuming.
 *
 * WHEN IT IS NOT THE RIGHT COMPONENT. A control that names a DESTINATION
 * rather than an origin — "Back to log in" on a signup page, a 404's "Back to
 * the home page" — is a link and should stay one, because the visitor did not
 * come from there and pressing back would take them somewhere else entirely.
 */

import Link from "next/link"
import type { ComponentProps, MouseEvent } from "react"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { backThen } from "@/lib/navigation/go-back"

type ReturnLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string }

export function ReturnLink({ href, onClick, ...rest }: ReturnLinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return
    /* Anything but a plain left-click belongs to the browser: a new tab, a
       new window, a download, a context menu. Intercepting those would break
       the link for the sake of an optimisation. */
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    /* Not where we came from — let the link be a link. */
    if (!canReturnTo(href)) return
    e.preventDefault()
    /* And if that back does nothing (an entry the browser replaced, a web view
       that reports a length it cannot go back through) the link is followed
       after all: a press on a link never ends nowhere. */
    backThen(() => window.location.assign(href))
  }

  return <Link href={href} onClick={handleClick} {...rest} />
}
