"use client"

/**
 * Marks the heading being read in the contents list (./toc), with an
 * IntersectionObserver rather than a scroll listener: the browser says when
 * a heading crosses a band near the top of the screen, and nothing is
 * measured while the page scrolls.
 *
 *   a heading entering the band (from 96px down to a third of the screen)
 *   becomes the current one;
 *   a heading leaving it downwards (scrolling back up) hands over to the
 *   heading before it.
 *
 * aria-current="true" on every link to it (the side list and the folded one
 * on a phone). A tap on a link in the folded list closes it, so the reader
 * lands on the heading rather than on an open list.
 */
import { useEffect } from "react"

export function TocSpy({ body = "[data-blog-body]", links = "[data-blog-toc] a" }: { body?: string; links?: string }) {
  useEffect(() => {
    const headings = [...document.querySelectorAll<HTMLElement>(`${body} h2[id], ${body} h3[id]`)]
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>(links)]
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

    const index = new Map(headings.map((h, i) => [h, i]))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = index.get(e.target as HTMLElement) ?? 0
          if (e.isIntersecting) mark(headings[i].id)
          else if (e.rootBounds && e.boundingClientRect.top >= e.rootBounds.bottom && headings[i].id === current && i > 0) mark(headings[i - 1].id)
        }
      },
      { rootMargin: "-96px 0px -66% 0px" },
    )
    headings.forEach((h) => io.observe(h))

    const folded = document.querySelector<HTMLDetailsElement>("[data-blog-toc-inline]")
    const close = (e: Event) => {
      if ((e.target as HTMLElement).closest("a") && folded) folded.open = false
    }
    folded?.addEventListener("click", close)
    return () => {
      io.disconnect()
      folded?.removeEventListener("click", close)
    }
  }, [body, links])
  return null
}
