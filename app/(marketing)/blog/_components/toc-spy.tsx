"use client"

/**
 * Marks the heading being read in the contents list (./toc), with an
 * IntersectionObserver rather than a scroll listener: the browser says when
 * a heading crosses a band near the top of the screen (from 96px down to a
 * third of it), and nothing is measured while the page scrolls. The current
 * heading is the last one above that third; see `pick` below.
 *
 * aria-current="true" on every link to it (the side list and the folded one
 * on a phone). A tap on a link in the folded list closes it, so the reader
 * lands on the heading rather than on an open list.
 */
import { useEffect } from "react"

export function TocSpy({ body = "[data-blog-body]", links = "[data-blog-toc] a" }: { body?: string; links?: string }) {
  useEffect(() => {
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>(links)]
    /* Only headings the list links to: the sign up box inside the body has an h2 with an id of its own (round 47: it was picked, and cleared every link). */
    const listed = new Set(anchors.map((a) => decodeURIComponent(a.hash.slice(1))))
    const headings = [...document.querySelectorAll<HTMLElement>(`${body} h2[id], ${body} h3[id]`)].filter((h) => listed.has(h.id))
    if (headings.length < 2 || !anchors.length) return

    let current = ""
    const mark = (id: string) => {
      if (id === current) return
      current = id
      for (const a of anchors) {
        if (a.hash === `#${id}`) a.setAttribute("aria-current", "true")
        else a.removeAttribute("aria-current")
      }
    }

    /*
      Round 47: the heading being read is the last one whose top has passed
      a line a third of the way down the screen (the first one before any
      has). Worked out again whenever the observer says a heading crossed
      the band, and when a scroll ends, because a jump (a contents link, the
      End key, a restored position) can carry every heading past the band
      without one ever being inside it, and the observer stays silent.
      Nothing is measured while the page is scrolling.
    */
    const pick = () => {
      const line = window.innerHeight / 3
      let at = 0
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= line) at = i
        else break
      }
      mark(headings[at].id)
    }
    const io = new IntersectionObserver(pick, { rootMargin: "-96px 0px -66% 0px" })
    headings.forEach((h) => io.observe(h))
    pick()
    window.addEventListener("scrollend", pick, { passive: true })

    const folded = document.querySelector<HTMLDetailsElement>("[data-blog-toc-inline]")
    const close = (e: Event) => {
      if ((e.target as HTMLElement).closest("a") && folded) folded.open = false
    }
    folded?.addEventListener("click", close)
    return () => {
      io.disconnect()
      window.removeEventListener("scrollend", pick)
      folded?.removeEventListener("click", close)
    }
  }, [body, links])
  return null
}
