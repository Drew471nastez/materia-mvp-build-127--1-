"use client"

/**
 * ===========================================================================
 *  LINKS INSIDE THE EDITOR'S CANVAS
 * ===========================================================================
 * The workspace frames the real creator page, which is the whole point: the
 * controls a creator uses are the ones a visitor's browser runs. The real
 * page has links out of it, though, and following one used to end in
 * "storelib.com refused to connect" — the product page is served with
 * X-Frame-Options like everything else, and nothing had told it otherwise.
 *
 * The proxy relaxes framing for a product page carrying `?embedded=1` and for
 * nothing else, so what is left is putting the flag on the link. One
 * delegated listener on the document, for the whole canvas: it covers markup
 * that did not exist when it mounted, and it is one place to read rather
 * than a prop with six call sites.
 *
 * WHAT IT WILL NOT TOUCH. Anything with a modifier held down (a new tab is a
 * real tab, outside the frame, where the flag would be wrong), `target="_top"`
 * — which is how the owner menu deliberately breaks OUT of the canvas —
 * another origin, a download, or a link that has already been handled.
 * And anything past the buy button: see CANVAS_WILL_NOT_FOLLOW.
 *
 * ---------------------------------------------------------------------------
 *  IT SAYS SO WHILE THE NEXT PAGE LOADS
 * ---------------------------------------------------------------------------
 * A product page is rendered on request, and inside the canvas it carries
 * the flag that makes it dynamic, so a click here is a full round trip that
 * can take seconds. During those seconds nothing changed on screen: the page
 * a creator had just clicked sat there exactly as before, which reads as
 * "the click did nothing" and produces a second click and a third. So the
 * moment a navigation is committed the page dims and a bar starts across the
 * top — the same bar the app draws — and stays until the document unloads.
 *
 * It only mounts inside a frame, so on a public page there is no listener
 * at all.
 */

import { useEffect, useState } from "react"

import { canvasRefusesHref, embeddedHref, forwardHistoryKey, isInEditorFrame } from "@/lib/store-builder/editor-channel"
import { historyKey, isTextField } from "@/lib/store-builder/editor-history"
import { showPillToast } from "@/components/storefront/pill-toast"

export function EmbeddedNavigation() {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!isInEditorFrame()) return

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest?.("a")
      if (!anchor) return
      /* A control inside a link (a card's owner menu) is that control's click, not the link's. */
      const control = (event.target as Element).closest("button, [role='button'], input, select, textarea, label")
      if (control && control !== anchor && anchor.contains(control)) return
      const target = anchor.getAttribute("target")
      /* _top is how a control deliberately leaves the canvas. Leave it alone. */
      if (target && target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const href = anchor.getAttribute("href")

      /* Browsing, not buying. A link into checkout or into the app is not
         followed at all rather than followed into a page that cannot be
         framed. See CANVAS_WILL_NOT_FOLLOW. */
      if (canvasRefusesHref(href, window.location.href)) {
        event.preventDefault()
        /* Not a dead click (round 50): it says why nothing opened. */
        showPillToast("Opens on your live page, not in the editor", { mark: "link" })
        return
      }

      /* What to refuse is the interesting half, and it is a pure function so
         it can be tested without a browser. See editor-channel. */
      const next = embeddedHref(href, window.location.href)
      if (!next) return

      event.preventDefault()
      setLeaving(true)
      window.location.assign(next)
    }

    /* A back/forward arrival from the bfcache would otherwise keep the dim. */
    const onShow = () => setLeaving(false)

    /*
      THE UNDO KEYS, PRESSED WITH THE FOCUS IN THE CANVAS (round 50). They
      land on this document, not on the workspace that keeps the history, so
      they are handed up. Not while a sheet is open (its form has its own
      undo, lib/store-builder/form-history) and not in a text field.
    */
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const action = historyKey(event)
      if (!action || isTextField(document.activeElement)) return
      if (document.querySelector('[role="dialog"][data-state="open"], [data-sheet-panel]')) return
      event.preventDefault()
      forwardHistoryKey(action)
    }

    /*
      IN THE CAPTURE PHASE (round 50). A product card is a Next <Link>, whose
      own handler runs at React's root, before a listener on the document,
      and calls preventDefault to navigate on the client. So this saw every
      card click as already handled and stood aside: the card opened
      /<handle>/<product> WITHOUT the flag, as a client move inside the frame,
      and the product page drew no way back and no canvas rules. Listening
      first, a link the canvas follows is a full load with ?embedded=1, and
      <Link> leaves a prevented click alone.
    */
    document.addEventListener("click", onClick, true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("pageshow", onShow)
    return () => {
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("pageshow", onShow)
    }
  }, [])

  if (!leaving) return null

  return (
    <div aria-live="polite" aria-busy="true" className="pointer-events-none fixed inset-0 z-[100]">
      {/* The bar: indeterminate, because a full navigation reports no progress. */}
      <div className="absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-black/5">
        <div className="creator-nav-bar h-full w-2/5 rounded-r-full bg-[#8b5cf6]" />
      </div>
      {/* The dim: enough to say "leaving", not enough to hide where from. */}
      <div className="absolute inset-0 bg-white/40 transition-opacity duration-200" />
    </div>
  )
}
