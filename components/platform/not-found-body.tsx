"use client"

import { useState, type ReactNode } from "react"

import { getMainDomain } from "@/lib/url-helpers"

/**
 * ===========================================================================
 *  WHOSE 404 IS THIS
 * ===========================================================================
 * storelib.com/nothing-here and drew.storelib.com/nothing-here are the same
 * route and two different situations. On the platform, "Explore Storelib" is
 * the right next step. On somebody's shop it is not: it reads as the shop
 * being broken, and then it sends the visitor to another website.
 *
 * A NESTED `not-found.tsx` WAS TRIED FIRST and does not work here. Putting
 * one under the site routes had two problems, both measured rather than
 * reasoned about: reading the request in it (the only way to know whose site
 * it is) turns a render that began static into a dynamic one, which Next
 * answers at runtime with "Page changed from static to dynamic" — a 500
 * where a 404 belongs, on every missing page of every site; and with the
 * request read removed, the payload still carried BOTH boundaries and the
 * platform's was the one that appeared.
 *
 * The host is the whole question, and the browser always knows it. So the
 * one 404 the app has decides on the client, out of the two bodies it is
 * handed, and neither needs anything from the server.
 */
export function NotFoundBody({ platform, site }: { platform: ReactNode; site: ReactNode }) {
  /**
   * Computed once, at the first render, rather than in an effect: an effect
   * would paint the platform's answer first and swap it, which is the flash
   * this is meant to avoid. On the server `window` is absent and the answer
   * is the platform's, which is what the shell should say when it is being
   * generated for no host in particular.
   */
  const [onASite] = useState(() => {
    if (typeof window === "undefined") return false
    const host = window.location.hostname.toLowerCase()
    const main = getMainDomain().toLowerCase()
    if (host === main || host === `www.${main}`) return false
    // Local development is the platform, whatever the host looks like.
    if (host === "localhost" || host === "127.0.0.1") return false
    return true
  })

  return <>{onASite ? site : platform}</>
}
