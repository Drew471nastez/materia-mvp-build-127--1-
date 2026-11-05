"use client"

/**
 * HOW FAR THROUGH THE ARTICLE, AS A 2PX LINE UNDER THE HEADER.
 *
 * Measures the article itself (the element marked data-blog-article), not
 * the page, so the line is full at the article's last line rather than at
 * the bottom of the footer. Its place is measured once and again only when
 * something resizes (ResizeObserver), never while scrolling; a scroll does
 * one write per frame, a transform on a layer of its own, so it neither
 * reflows nor repaints the page. It sits under the header, whose height is
 * read the same way. Hidden from assistive technology: the contents list
 * says where the reader is in words.
 */
import { useEffect, useRef } from "react"

export default function ReadingProgress({ target = "[data-blog-article]", header: headerSelector = "#platform-header-root" }: { target?: string; header?: string }) {
  const bar = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(target)
    const header = document.querySelector<HTMLElement>(headerSelector)
    const barEl = bar.current
    const trackEl = track.current
    if (!barEl || !trackEl) return
    let start = 0
    let span = 1
    let frame = 0

    const paint = () => {
      frame = 0
      const p = Math.min(1, Math.max(0, (window.scrollY - start) / span))
      barEl.style.transform = `scaleX(${p})`
    }
    const measure = () => {
      const top = el ? el.getBoundingClientRect().top + window.scrollY : 0
      const height = el ? el.offsetHeight : document.documentElement.scrollHeight
      const headerH = header ? header.getBoundingClientRect().height : 0
      trackEl.style.transform = `translateY(${headerH}px)`
      start = top - headerH
      span = Math.max(1, height - window.innerHeight + headerH)
      paint()
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }

    const ro = new ResizeObserver(() => measure())
    if (el) ro.observe(el)
    if (header) ro.observe(header)
    measure()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", measure, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", measure)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [target, headerSelector])

  return (
    <div ref={track} aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[2px]" data-blog-progress="">
      <div ref={bar} className="h-full w-full origin-left bg-[#7c3aed] will-change-transform" style={{ transform: "scaleX(0)" }} />
    </div>
  )
}
