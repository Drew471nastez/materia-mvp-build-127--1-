"use client"

/**
 * The person's look on <html>, at the root, on every move (lib/appearance):
 * dark on Storelib's own buyer pages when they chose it (or a community's
 * creator did and they never chose), light everywhere else, the dashboard
 * included. In a layout effect, so a move into /app is light on its first frame.
 *
 * Once per tab, a signed in person's account choice is read and taken when
 * it differs from this browser's: a choice made on their phone is here too.
 */
import { useEffect, useLayoutEffect } from "react"
import { usePathname } from "next/navigation"
import { adoptAccountAppearance, paintAppearance, useAppearanceChoice, usePageDefaultAppearance } from "@/lib/appearance/client"
import { themedPath } from "@/lib/appearance/site-appearance"

const SYNCED = "storelib:appearance-synced"

export function SiteAppearance() {
  const pathname = usePathname() || "/"
  const choice = useAppearanceChoice()
  const pageDefault = usePageDefaultAppearance()
  useLayoutEffect(() => paintAppearance(pathname, choice, pageDefault), [pathname, choice, pageDefault])
  const themed = themedPath(pathname)
  useEffect(() => {
    if (!themed) return
    try {
      if (sessionStorage.getItem(SYNCED)) return
      sessionStorage.setItem(SYNCED, "1")
    } catch {
      /* no session storage: ask anyway, once per page load */
    }
    fetch("/api/account/appearance", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { appearance?: unknown } | null) => adoptAccountAppearance(d?.appearance))
      .catch(() => {})
  }, [themed])
  return null
}
