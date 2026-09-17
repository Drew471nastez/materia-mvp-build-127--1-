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
 * has scrolled off the top, the header grows one; scroll back up and it hands
 * it back. Skool's discovery page does exactly this and it is why the header
 * there looks empty until you start reading.
 *
 * HOW THE TWO TALK, given they are in different trees. The hero marks its
 * search with `data-explore-search-anchor` and this watches for that element
 * anywhere in the document. No context, no store, no prop drilled through the
 * layout — the header asks the document whether the page has a search of its
 * own and where it is.
 *
 * A MutationObserver as well as an IntersectionObserver, because the header
 * renders ABOVE the page and mounts first: on the first pass the anchor does
 * not exist yet. Without the second observer this returns false for ever on a
 * cold load and the header never gets its field back.
 *
 * NO ANCHOR MEANS NO HANDOFF. Every other page keeps the header's search
 * exactly as it was, which is what `true` means here.
 */

import { useEffect, useState } from "react"

/** The hero marks its own search field with this. */
export const SEARCH_ANCHOR_ATTR = "data-explore-search-anchor"

/**
 * True when the header should carry a search field.
 *
 * @param enabled false on pages that have no page-level search, where the
 *   header's own field is the only one and must always be there.
 */
export function useSearchHandoff(enabled: boolean): boolean {
  /**
   * STARTS AS THE ANSWER FOR THIS SURFACE, not as a default to be corrected.
   *
   * Starting true everywhere meant an Explore page rendered its header WITH a
   * search on the first frame and took it away on the second, once the
   * observer had found the anchor — a field appearing and vanishing on every
   * load, which is the flicker this whole arrangement exists to avoid.
   *
   * An Explore surface always has a hero with a search in it, so the honest
   * first answer there is "the page has it". Everywhere else there is no
   * anchor and the header's own field is the only one, so the first answer
   * is "the header has it" and nothing ever changes it.
   */
  const [inHeader, setInHeader] = useState(!enabled)

  useEffect(() => {
    if (!enabled) {
      setInHeader(true)
      return
    }
    if (typeof window === "undefined") return

    let io: IntersectionObserver | null = null
    let watched: Element | null = null

    const watch = (el: Element) => {
      if (watched === el) return
      io?.disconnect()
      watched = el
      io = new IntersectionObserver(
        ([entry]) => {
          /*
            Above the viewport, not merely out of it. `isIntersecting` alone
            would also be false for an anchor still BELOW the fold, which is
            every anchor on a page taller than the screen before anybody has
            scrolled — and the header would carry a field while the page's own
            one sat two hundred pixels underneath it.
          */
          const gone = !entry.isIntersecting && entry.boundingClientRect.top < 0
          setInHeader(gone)
        },
        /* A little slack at the top, so the handoff happens as the field
           reaches the header rather than after it has slid under it. */
        { rootMargin: "-8px 0px 0px 0px", threshold: 0 },
      )
      io.observe(el)
    }

    const find = () => {
      const el = document.querySelector(`[${SEARCH_ANCHOR_ATTR}]`)
      if (el) watch(el)
      return !!el
    }

    /* The header mounts before the page below it, so the first look misses. */
    const mo = find() ? null : new MutationObserver(() => { if (find()) mo?.disconnect() })
    mo?.observe(document.body, { childList: true, subtree: true })

    return () => {
      io?.disconnect()
      mo?.disconnect()
    }
  }, [enabled])

  return inHeader
}
