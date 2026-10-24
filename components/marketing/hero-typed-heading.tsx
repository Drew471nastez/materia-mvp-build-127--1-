"use client"

import { useEffect, useRef } from "react"

/**
 * The front page heading, typed and erased phrase by phrase.
 *
 * NOTHING MOVES WHILE IT TYPES. Every phrase is laid out invisibly in the same
 * grid cell, so the heading is as tall as the tallest of them at whatever
 * width the page is, and the phrase being typed is always laid out in full:
 * the letters not typed yet are there, transparent, after the caret. A letter
 * appearing changes its colour and nothing else, so no word jumps to the next
 * line half way through and the centred lines never slide sideways.
 *
 * The letters are set straight on the DOM; React renders this once. The
 * server's HTML has the first phrase complete, which is what the page's
 * largest paint is, what a crawler reads, and all that reduced motion shows.
 */

export const HERO_PHRASES = [
  "Build a business around what you create.",
  "Sell digital products from your own store.",
  "Put your links and products on one page.",
  "Grow a community around your work.",
]

/** A typist's rhythm: a base gap, some spread, a beat after a space. */
const TYPE_MS = 52
const TYPE_SPREAD_MS = 34
const SPACE_EXTRA_MS = 45
const ERASE_MS = 24
const HOLD_FULL_MS = 2600
const HOLD_EMPTY_MS = 420

export function HeroTypedHeading({ className }: { className?: string }) {
  const lineRef = useRef<HTMLSpanElement>(null)
  const boxRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const line = lineRef.current
    const box = boxRef.current
    if (!line || !box) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    let phrase = 0
    let chars: HTMLSpanElement[] = []
    let length = HERO_PHRASES[0].length
    let erasing = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let onScreen = true

    /*
      ONE SPAN PER LETTER, BUILT ONCE PER PHRASE. Typing then only turns a
      letter's colour on or off and moves the caret's attribute: no text node
      changes, so no glyph is ever laid out somewhere new (a text node whose
      content changes counts as a layout shift for everything after it).
    */
    const build = () => {
      chars = Array.from(HERO_PHRASES[phrase], (ch) => {
        const span = document.createElement("span")
        span.textContent = ch
        return span
      })
      line.replaceChildren(...chars)
    }
    const draw = () => {
      for (let i = 0; i < chars.length; i++) {
        chars[i].toggleAttribute("data-off", i >= length)
        chars[i].toggleAttribute("data-caret", i === length - 1)
      }
      line.toggleAttribute("data-caret-start", length === 0)
    }
    const idle = (on: boolean) => box.toggleAttribute("data-idle", on)

    const step = () => {
      timer = null
      let wait: number
      if (erasing) {
        const total = chars.length
        length--
        if (length <= 0) {
          length = 0
          erasing = false
          wait = HOLD_EMPTY_MS
        } else {
          /* A touch faster as the line empties, like a held key. */
          wait = ERASE_MS * (0.7 + 0.6 * (length / total))
        }
        draw()
        idle(length === 0)
        if (length === 0) {
          phrase = (phrase + 1) % HERO_PHRASES.length
          build()
          draw()
        }
      } else {
        length++
        const next = HERO_PHRASES[phrase]
        if (length >= next.length) {
          length = next.length
          erasing = true
          wait = HOLD_FULL_MS
          idle(true)
        } else {
          idle(false)
          wait = TYPE_MS + Math.random() * TYPE_SPREAD_MS + (next[length - 1] === " " ? SPACE_EXTRA_MS : 0)
        }
        draw()
      }
      schedule(wait)
    }
    const schedule = (wait: number) => {
      if (timer || !onScreen || document.visibilityState === "hidden") return
      timer = setTimeout(step, wait)
    }
    const pause = () => { if (timer) { clearTimeout(timer); timer = null } }
    const sync = () => {
      if (onScreen && document.visibilityState !== "hidden") schedule(HOLD_FULL_MS)
      else pause()
    }
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
      : null

    build()
    draw()
    io?.observe(box)
    document.addEventListener("visibilitychange", sync)
    schedule(HOLD_FULL_MS)
    return () => {
      pause()
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  return (
    <span ref={boxRef} data-hero-typed="" data-idle="" aria-hidden className={`hero-typed grid ${className ?? ""}`}>
      {HERO_PHRASES.map((p) => (
        /* Drawn from an attribute, so the page's text (and the heading a crawler reads) is the one phrase, once. */
        <span key={p} data-ghost={p} className="invisible col-start-1 row-start-1 self-start before:content-[attr(data-ghost)]" />
      ))}
      <span ref={lineRef} data-hero-line="" className="col-start-1 row-start-1">{HERO_PHRASES[0]}</span>
    </span>
  )
}
