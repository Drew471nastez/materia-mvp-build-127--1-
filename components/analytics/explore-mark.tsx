"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { EXPLORE_MARK_KEY } from "@/lib/analytics/events"

/**
 * STORELIB EXPLORE LEAVES A MARK IN THE TAB. Every Explore page (its
 * layout) writes the time into this tab's sessionStorage as it is shown and
 * on every route change inside Explore. A creator's page opened from it
 * within 30 minutes sends `via: "explore"` with its view
 * (components/analytics/track-view), and the view is recorded with Storelib
 * Explore as its source (lib/analytics/collect): a Next route change from
 * Explore to a product keeps the referrer of the visit's first page, so
 * without this a visit from the marketplace read as Google, or Direct.
 *
 * Nothing leaves the browser here, and nothing is kept past the tab.
 */
export function ExploreMark() {
  const pathname = usePathname()
  useEffect(() => {
    const mark = () => {
      try {
        sessionStorage.setItem(EXPLORE_MARK_KEY, String(Date.now()))
      } catch {
        /* storage refused: views from Explore keep their referrer's source */
      }
    }
    mark()
    /* Still on Explore when the tab is left: the mark is as fresh as the last look. */
    window.addEventListener("pagehide", mark)
    document.addEventListener("visibilitychange", mark)
    return () => {
      window.removeEventListener("pagehide", mark)
      document.removeEventListener("visibilitychange", mark)
    }
  }, [pathname])
  return null
}
