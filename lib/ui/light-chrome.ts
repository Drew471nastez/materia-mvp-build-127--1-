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
 *   the status bar       dark text on light, in the phone app, through
 *                        --native-band (lib/native-chrome.ts)
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

    /*
     * THE BAND IS THIS PAGE'S COLOUR, AND THE STATUS BAR FOLLOWS THE BAND.
     * This used to set the status bar's text itself, dark on the way in and
     * LIGHT TEXT on a black strip on the way out, whatever page came next:
     * after a community, Explore's white header sat under white text on a
     * black band. Now it says the colour (--native-band, the one number
     * app/globals.css paints the strip and the canvas from) and
     * components/platform/native-chrome.tsx reads it after every change and
     * picks the text, so leaving puts back whatever the next page says.
     */
    const prevBand = html.style.getPropertyValue("--native-band")
    html.style.setProperty("--native-band", color)

    return () => {
      html.classList.remove("light-chrome")
      if (added) added.remove()
      else all.forEach((m, i) => (prevContent[i] == null ? m.removeAttribute("content") : m.setAttribute("content", prevContent[i] as string)))
      html.style.backgroundColor = prevBg
      if (prevBand) html.style.setProperty("--native-band", prevBand)
      else html.style.removeProperty("--native-band")
    }
  }, [active, color])
}
