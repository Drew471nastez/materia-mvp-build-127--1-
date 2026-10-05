"use client"

import { useEffect } from "react"

/**
 * Sheets and menus that portal to the body sit outside the community frame.
 * The same look is set on the document while this community is on screen, so
 * those still follow it, and taken off when the page goes.
 */
export function useCommunityTheme(appearance: "light" | "dark") {
  useEffect(() => {
    if (appearance !== "dark") return
    document.documentElement.setAttribute("data-community-theme", "dark")
    return () => document.documentElement.removeAttribute("data-community-theme")
  }, [appearance])
}
