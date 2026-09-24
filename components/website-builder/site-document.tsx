"use client"

/**
 * ===========================================================================
 *  THIS DOCUMENT IS A CREATOR'S WEBSITE, NOT THE APP
 * ===========================================================================
 * The root layout mounts the app shell's guards for every route, published
 * websites included. One of them, KeyboardGuard, centred the focused field
 * with a smooth scroll half a second after every focus, on a desktop too:
 * the "page moves to a weird place when I click an input". The app needs
 * that, because its content scrolls inside boxes the browser does not
 * follow into; a website's page is the document, and the browser's own
 * scroll to a focused field is the right one.
 *
 * So a website marks <html> as `storelib-site`, and what belongs to the app
 * shell stands down while it is there. Read at the moment of each event, so
 * the order effects run in does not matter.
 */
import { useEffect } from "react"

export const SITE_DOCUMENT_CLASS = "storelib-site"

export function isSiteDocument(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains(SITE_DOCUMENT_CLASS)
}

export function SiteDocument() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add(SITE_DOCUMENT_CLASS)
    return () => root.classList.remove(SITE_DOCUMENT_CLASS)
  }, [])
  return null
}
