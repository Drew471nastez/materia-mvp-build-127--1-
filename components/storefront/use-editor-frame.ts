"use client"

/**
 * ===========================================================================
 *  IS THIS PAGE INSIDE THE CREATOR-PAGE EDITOR
 * ===========================================================================
 * The workspace frames the real page so a creator edits the thing itself, and
 * the real page can be bought from. Both of those are right and together they
 * are wrong: a creator clicking their own buy button inside their own editor
 * is starting a real checkout for their own product, and the checkout page is
 * not framable, so what actually happened was the canvas going white with
 * "storelib.com refused to connect".
 *
 * Browsing is fine and is the point — products, the shop, back again. Buying
 * is not. This is how anything that takes money knows to stand down.
 *
 * STATE RATHER THAN A BARE READ: the server renders this false and the first
 * client render must agree, or React throws a hydration mismatch on every
 * product page. The button is live until the effect runs, which is one frame
 * on a page nobody can click in yet.
 *
 * Only our own pages can frame us at all — the proxy sets
 * `frame-ancestors 'self'`, and the workspace is the only thing that does.
 */

import { useEffect, useState } from "react"

export function useEditorFrame(): boolean {
  const [framed, setFramed] = useState(false)
  useEffect(() => {
    try {
      setFramed(window.self !== window.top)
    } catch {
      /* A cross-origin parent throws on access, which means there IS one. */
      setFramed(true)
    }
  }, [])
  return framed
}
