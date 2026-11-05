"use client"

import { useEffect } from "react"

/**
 * Hands the address to the app as soon as the page is up. iOS opens the app
 * from the sheet's own scheme at once; a Chrome Custom Tab may refuse a link
 * no one tapped, and then the page's button (an intent:// link) does it.
 */
export function ConnectReturnGo({ href }: { href: string }) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.location.href = href
      } catch {
        /* the button is there */
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [href])
  return null
}
