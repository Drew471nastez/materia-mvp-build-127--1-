"use client"

/**
 * ===========================================================================
 *  THE SEARCH FIELD IS IN ONE PLACE AT A TIME
 * ===========================================================================
 * On Explore the search belongs to the PAGE: a wide field under the heading,
 * which is the thing a visitor arriving to browse is looking for. Putting a
 * second one in the header at the same time is the same control twice on one
 * screen, and the header's is the smaller and worse of the two.
 *
 * So the header's is not there until the page's has gone. Once the big field
 * has scrolled away under the header, the header shows one; scroll back up
 * and it hands it back. Skool's discovery page does exactly this and it is
 * why the header there looks empty until you start reading.
 *
 * HOW THE TWO TALK, given they are in different trees. The hero marks its
 * search with `data-explore-search-anchor` and this watches for that element
 * anywhere in the document. No context, no store, no prop drilled through the
 * layout: the header asks the document whether the page has a search of its
 * own and where it is.
 *
 * NO ANCHOR MEANS NO HANDOFF. Every other page keeps the header's search
 * exactly as it was, which is what `true` means here.
 *
 * ===========================================================================
 *  WHY IT SOMETIMES SHOWED AT THE TOP, AND NEVER AGAIN
 * ===========================================================================
 * "Sometimes the search bar appears in the black top header randomly when I'm
 * at the top." Reproduced in scripts/check-explore-desktop.mjs, and it was
 * the element being watched, not the scroll:
 *
 *   The observer watched the FIRST anchor it found and the mutation observer
 *   that found it then disconnected. But the anchor is not one element for
 *   the life of the header. loading.tsx draws the real hero (so nothing moves
 *   when the page arrives), and then the page replaces it with its own; a
 *   route between two Explore pages (Explore to a category, the logo back to
 *   Explore, a pick in the header's menu) replaces it too, and the header
 *   stays mounted with `enabled` unchanged, so the effect never ran again.
 *
 *   An observer watching an element that has left the document hears
 *   nothing more. Scrolled past the hero and then sent to another Explore
 *   page, the header kept its field at the top of the new page, and kept it
 *   there however you scrolled. After the loading screen it was the other
 *   way round: the field never came at all.
 *
 *   And when a watched anchor left the document while it was on screen, the
 *   observer's last entry was an empty rectangle at 0, which was written into
 *   the remembered offset as "the field ends at the top of the document".
 *   The next arrival before the hero rendered read that as "scrolled past
 *   it" and put the field in the header at y=0.
 *
 * Now the mutation observer stays for as long as the page can have an anchor
 * and follows it to whichever element carries it, entries from an element
 * that has left are ignored, and the offset is remembered per path and only
 * from a real rectangle.
 *
 * THE HEADER'S HEIGHT IS THE LINE. The answer used to flip when the field
 * left the WINDOW (8px from its top), which is 60px after it had gone under
 * a sticky header: a moment with a search in neither place. `insetTop` is
 * the header's height, so the observer's root starts where the header ends.
 * The phone's strip still passes the old 8px; its timing is unchanged.
 */

import { useEffect, useState } from "react"
import { flushSync } from "react-dom"

/** The hero marks its own search field with this. */
export const SEARCH_ANCHOR_ATTR = "data-explore-search-anchor"

/** The line the phone's strip has always used: 8px from the top of the window. */
export const WINDOW_SLACK = 8

/**
 * Where the page's search field ends in the DOCUMENT, remembered per path.
 *
 * Reading the element is the honest answer and it is not always available:
 * arriving back on Explore under load, the effect below can run before the
 * hero is in the tree. The offset does not change between two visits to the
 * same page, so the last one that WAS read answers the question in the
 * meantime. Per path, because a category's hero is not Explore's; and only
 * from an element in the document with a real size, because an element that
 * has just left reports an empty rectangle at 0.
 */
const anchorBottomInDoc = new Map<string, number>()

function noteAnchor(el: Element, bottomInViewport: number, height: number) {
  if (!el.isConnected || height <= 0) return
  anchorBottomInDoc.set(location.pathname, bottomInViewport + window.scrollY)
}

/**
 * The observer's rule, asked synchronously: has the page's own field gone
 * above the line `insetTop` pixels from the top of the window? The same rule
 * the observer applies to an entry below, so the two cannot disagree.
 */
function anchorIsAbove(el: Element | null, insetTop: number): boolean {
  if (el) {
    const r = el.getBoundingClientRect()
    noteAnchor(el, r.bottom, r.height)
    return r.height > 0 && r.bottom <= insetTop
  }
  const remembered = anchorBottomInDoc.get(location.pathname)
  /* With no anchor and nothing remembered, the page still has the field. */
  if (remembered === undefined) return false
  return window.scrollY >= remembered - insetTop
}

export type SearchHandoff = {
  /** The header carries a search field. */
  inHeader: boolean
  /**
   * The last change came from scrolling past the page's field, not from
   * arriving on a page: the header may animate it. An arrival puts the field
   * where it belongs on the first frame, without a fade that reads as a flash.
   */
  animate: boolean
}

/**
 * @param enabled false on pages that have no page-level search, where the
 *   header's own field is the only one and must always be there.
 * @param insetTop where the line is, in pixels from the top of the window:
 *   the sticky header's height, so the field hands over as it goes under it.
 */
export function useSearchHandoffState(enabled: boolean, insetTop: number = WINDOW_SLACK): SearchHandoff {
  /**
   * STARTS AS THE ANSWER FOR THIS SURFACE, not as a default to be corrected.
   * An Explore surface always has a hero with a search in it, so the first
   * answer there is "the page has it", on the server and on the first client
   * frame alike. Everywhere else the header's own field is the only one.
   */
  const [state, setState] = useState<SearchHandoff>({ inHeader: !enabled, animate: false })

  useEffect(() => {
    if (!enabled) {
      setState({ inHeader: true, animate: false })
      return
    }
    const line = Math.max(0, Math.round(insetTop))
    const set = (inHeader: boolean, animate: boolean) =>
      setState((s) => (s.inHeader === inHeader ? s : { inHeader, animate }))

    let io: IntersectionObserver | null = null
    let watched: Element | null = null
    /* The observer's first entry for an element is a reading, not a scroll. */
    let settled = false
    /*
      AN ARRIVAL IS NOT ONLY THE FIRST FRAME. Coming back to Explore, Chromium
      puts the window at the old offset after the page has committed, which
      can be after the reading above: the answer was right for y=0 and wrong
      for where the window then went, until the observer's next entry a frame
      or two later. So for a moment after an arrival a scroll is read at once
      (before that frame paints) and applied without a fade.
    */
    let arrivedAt = performance.now()
    const ARRIVAL_MS = 700
    const onArrivalScroll = () => {
      if (!watched || performance.now() - arrivedAt > ARRIVAL_MS) return
      const above = anchorIsAbove(watched, line)
      flushSync(() => set(above, false))
    }
    window.addEventListener("scroll", onArrivalScroll, { passive: true })

    const watch = (el: Element | null, now = false) => {
      if (el === watched) return
      io?.disconnect()
      io = null
      watched = el
      settled = false
      arrivedAt = performance.now()
      /*
        Measured on the frame it changes. On arrival (and when the loading
        screen's hero hands over to the page's) this is the answer before
        anything paints, so nothing fades on the way in.
      */
      const above = anchorIsAbove(el, line)
      /*
        From the mutation observer, which runs right after the commit that
        swapped the page and before the frame paints: applied there and then,
        or the header keeps the last page's answer for a frame (a search at
        the top of a page that has its own, for a sixtieth of a second).
      */
      if (now) flushSync(() => set(above, false))
      else set(above, false)
      if (!el) return
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1]
          /* An element that has left reports an empty box at 0. It is not the page. */
          if (entry.target !== watched || !entry.target.isConnected) return
          const top = entry.rootBounds?.top ?? line
          /*
            Above the line, not merely out of the root. `isIntersecting`
            alone would also be false for an anchor still BELOW the fold,
            and the header would carry a field while the page's own one sat
            two hundred pixels underneath it.
          */
          const gone = !entry.isIntersecting && entry.boundingClientRect.top < top
          noteAnchor(entry.target, entry.boundingClientRect.bottom, entry.boundingClientRect.height)
          set(gone, settled)
          settled = true
        },
        /* The root starts where the header ends. */
        { rootMargin: `-${line}px 0px 0px 0px`, threshold: 0 },
      )
      io.observe(el)
    }

    const find = (now = false) => {
      const el = document.querySelector(`[${SEARCH_ANCHOR_ATTR}]`)
      if (el !== watched) watch(el, now)
    }

    /*
      For as long as this page can have an anchor, not only until the first
      one: the loading screen's hero is replaced by the page's, and a route
      between two Explore pages replaces it again with the header still
      mounted. One attribute query per batch of mutations, and a new observer
      only when the element really changed.
    */
    find()
    const mo = new MutationObserver(() => find(true))
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io?.disconnect()
      mo.disconnect()
      window.removeEventListener("scroll", onArrivalScroll)
    }
  }, [enabled, insetTop])

  return state
}

/** True when the header should carry a search field. */
export function useSearchHandoff(enabled: boolean, insetTop: number = WINDOW_SLACK): boolean {
  return useSearchHandoffState(enabled, insetTop).inHeader
}
