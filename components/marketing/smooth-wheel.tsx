"use client"

/*
  THE HOME PAGE'S SMOOTH WHEEL (round 5, the owner: "make the smooth scroll
  feeling like this theme has", the Materia theme's assets/smooth-scroll.js).

  The same small first-party script, ported as it is: a mouse wheel moves a
  target, and each frame the page glides a fifth of the way there with
  window.scrollTo. The page keeps its one native scroller, so window.scrollY,
  scroll events, sticky blocks, IntersectionObservers and the sheets'
  scroll-driven animations all keep working as they do without it.

  Only for a desktop mouse: off on touch or coarse pointers, under reduced
  motion, below 1025px wide, while a modal or a menu holds the page
  (html[data-modal-any], body[data-scroll-locked]), with Ctrl (zoom), for a
  mostly sideways wheel (a rail's own swipe), and wherever a box under the
  pointer can still scroll that way itself. The frame loop runs only while
  the page is gliding; at rest nothing runs.
*/
import { useEffect } from "react"

/** How far the page catches up each frame: higher is snappier, lower glides longer (the theme's value). */
export const SMOOTH_WHEEL_EASE = 0.2125
/** A small boost so each wheel tick feels answered at once (the theme's value). */
export const SMOOTH_WHEEL_MULT = 1.08
/** Narrower than this, the native scroll is kept (the theme's breakpoint). */
export const SMOOTH_WHEEL_MIN_WIDTH = 1025

export function SmoothWheel() {
  useEffect(() => {
    const doc = document.documentElement
    const media = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches
    if (media("(prefers-reduced-motion: reduce)") || media("(pointer: coarse)")) return
    if ("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0) return

    let active = window.innerWidth >= SMOOTH_WHEEL_MIN_WIDTH
    let target = window.scrollY
    let current = window.scrollY
    let running = false

    /*
      Landing round 11 perf: no layout read per wheel event. scrollHeight and a
      computed overflow, read in a wheel handler, make the browser lay the page
      out and restyle it first, and on this page something is nearly always
      dirty (loops, sections arriving): measured at 4x CPU, the handler was
      about 10ms a wheel event and a tenth of the main thread over a scroll.
      The page's length is kept up by a ResizeObserver (it reports after
      layout, nothing is forced) and read once when a glide starts; the boxes
      that can scroll under a pointer are found once per element.
    */
    let height = doc.scrollHeight
    const sized = typeof ResizeObserver === "function" ? new ResizeObserver(() => (height = doc.scrollHeight)) : null
    sized?.observe(doc)
    const maxScroll = () => (sized ? height : doc.scrollHeight) - window.innerHeight
    const clamp = (v: number) => Math.max(0, Math.min(v, maxScroll()))
    const locked = () => doc.hasAttribute("data-modal-any") || document.body.hasAttribute("data-scroll-locked")

    /* A box under the pointer that can still scroll that way takes the wheel itself. The boxes that may scroll (overflow auto or scroll) on the way up from an element are found once per element. */
    const scrollers = new WeakMap<Element, Element[]>()
    const scrollersAbove = (start: Element) => {
      let list = scrollers.get(start)
      if (list) return list
      list = []
      let node: Element | null = start
      while (node && node !== document.body && node !== doc) {
        const oy = getComputedStyle(node).overflowY
        if (oy === "auto" || oy === "scroll") list.push(node)
        node = node.parentElement
      }
      scrollers.set(start, list)
      return list
    }
    const nestedCanScroll = (start: EventTarget | null, dy: number) => {
      if (!(start instanceof Element)) return false
      for (const node of scrollersAbove(start)) {
        if (node.scrollHeight > node.clientHeight + 1) {
          if (dy < 0 && node.scrollTop > 0) return true
          if (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true
        }
      }
      return false
    }

    const loop = () => {
      current += (target - current) * SMOOTH_WHEEL_EASE
      if (Math.abs(target - current) < 0.4) {
        current = target
        running = false
      }
      window.scrollTo(0, Math.round(current))
      if (running) requestAnimationFrame(loop)
    }

    const onWheel = (e: WheelEvent) => {
      if (!active || e.ctrlKey || e.defaultPrevented || locked()) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (nestedCanScroll(e.target, e.deltaY)) return
      e.preventDefault()
      if (!running) current = target = window.scrollY
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY
      target = clamp(target + delta * SMOOTH_WHEEL_MULT)
      if (!running) {
        running = true
        requestAnimationFrame(loop)
      }
    }
    /* Scrolled some other way (keys, the scroll bar, a link): start from there next time. */
    const onScroll = () => {
      if (!running) target = current = window.scrollY
    }
    const onResize = () => {
      active = window.innerWidth >= SMOOTH_WHEEL_MIN_WIDTH
    }

    window.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    return () => {
      running = false
      sized?.disconnect()
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [])
  return null
}
