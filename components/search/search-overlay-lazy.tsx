"use client"

/**
 * ===========================================================================
 *  THE SEARCH SCREEN ARRIVES AFTER THE PAGE, ON A PHONE ONLY (round 46)
 * ===========================================================================
 * The tab bar mounted components/search/search-overlay.tsx on every page of
 * the marketing layout, and with it the search screen, its results and its
 * categories, so /features and /pricing carried all of it in their first
 * script, on a computer too, where the screen never opens (openNow answers
 * false above 767px).
 *
 * It still has to be in the document BEFORE the Search press: a phone
 * raises its keyboard only for a focus given while the touch is handled, so
 * the screen cannot be fetched by the press itself. It is fetched as soon as
 * the page has woken up instead, on a phone-wide window only (and when a
 * window becomes one), and mounted the moment it arrives. It draws nothing
 * on the server either way (the screen is client only), so the first paint
 * is the same. In the moment before it arrives the tab goes to
 * /explore/search, the way it goes wherever there is no screen to open.
 */
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

const PHONE = "(max-width: 767px)"

const Screen = dynamic(() => import("@/components/search/search-overlay").then((m) => m.SearchOverlay), { ssr: false })

export function SearchOverlay() {
  const [wanted, setWanted] = useState(false)
  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia(PHONE) : null
    if (!mq || mq.matches) {
      setWanted(true)
      return
    }
    const onChange = () => {
      if (mq.matches) setWanted(true)
    }
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])
  return wanted ? <Screen /> : null
}
