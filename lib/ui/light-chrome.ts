"use client"

import * as React from "react"

/**
 * ===========================================================================
 *  A WHITE PAGE GETS A WHITE TOP
 * ===========================================================================
 * The site's theme-color is black and /app paints the native canvas #111, so
 * a full screen white page on a phone (Set up payments, a community opened
 * from a shared link) sat under a black strip: the browser's bar or the
 * status bar zone above the notch. While `active`, this paints all three to
 * match the page and puts each back as it was when the page goes:
 *
 *   the browser bar      <meta name="theme-color">
 *   the page canvas      <html> background, which fills the notch zone
 *   the status bar       dark text on light, in the phone app
 */
export function useLightChrome(active: boolean, color = "#ffffff") {
  React.useEffect(() => {
    if (!active || typeof document === "undefined") return
    const html = document.documentElement
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    const added = metas.length === 0 ? document.head.appendChild(Object.assign(document.createElement("meta"), { name: "theme-color" })) : null
    const all = added ? [added] : metas
    const prevContent = all.map((m) => m.getAttribute("content"))
    const prevBg = html.style.backgroundColor
    all.forEach((m) => m.setAttribute("content", color))
    html.style.backgroundColor = color
    /*
     * AND THE BLACK SHIELD STANDS DOWN. globals.css paints a fixed pure
     * black strip over the notch at z-index 9999 (html.capacitor::before),
     * which every ordinary page wants because its header is black. Over a
     * white full screen page it is a black band under the clock with the
     * page starting below it: the "not full screen" that was reported for
     * the builder and the creator page editor before this, and for Set up
     * payments now. The page covers the same strip in its own colour.
     */
    html.classList.add("light-chrome")

    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    const native = Boolean(cap?.isNativePlatform?.())
    if (native) {
      void import("@capacitor/status-bar")
        .then(async ({ StatusBar, Style }) => {
          await StatusBar.setStyle({ style: Style.Light }).catch(() => {})
          /* Android paints its own strip behind the status bar; iOS has none to paint. */
          await StatusBar.setBackgroundColor({ color }).catch(() => {})
        })
        .catch(() => {})
    }

    return () => {
      html.classList.remove("light-chrome")
      if (added) added.remove()
      else all.forEach((m, i) => (prevContent[i] == null ? m.removeAttribute("content") : m.setAttribute("content", prevContent[i] as string)))
      html.style.backgroundColor = prevBg
      if (native) {
        void import("@capacitor/status-bar")
          .then(async ({ StatusBar, Style }) => {
            await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
            await StatusBar.setBackgroundColor({ color: "#000000" }).catch(() => {})
          })
          .catch(() => {})
      }
    }
  }, [active, color])
}
