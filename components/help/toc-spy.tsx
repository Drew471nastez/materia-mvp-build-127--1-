"use client"

/**
 * Marks the heading being read in the article's contents list (OnThisPage in
 * ./help-parts), so the list beside a long article says where you are. The
 * list itself is plain links and works without this: it only adds
 * aria-current to the link of the last heading that has scrolled past the
 * top third of the screen.
 */
import { useEffect } from "react"

export function TocSpy() {
  useEffect(() => {
    const headings = [...document.querySelectorAll<HTMLElement>("[data-help-body] h2[id]")]
    if (headings.length < 2) return
    let frame = 0
    const mark = () => {
      frame = 0
      const line = window.innerHeight / 3
      let current = headings[0].id
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= line) current = h.id
        else break
      }
      for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-help-toc] a")) {
        if (a.getAttribute("href") === `#${current}`) a.setAttribute("aria-current", "true")
        else a.removeAttribute("aria-current")
      }
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(mark)
    }
    mark()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
