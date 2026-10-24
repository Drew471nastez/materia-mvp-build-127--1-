"use client"

import { useEffect, useRef } from "react"
import { HERO_PHRASES, MAX_STEP_MS, letterAlpha, lettersStarted, phraseTimeline, restTime, type PhraseTimeline } from "@/lib/marketing/hero-typing"

export { HERO_PHRASES }

/**
 * The front page heading, typed phrase by phrase.
 *
 * ONE FRAME CLOCK. The old version chained timers, one per letter, and every
 * time the heading came back into view it waited a full hold (2.6s) before
 * the next letter, wherever it had stopped: scrolled down to the slider and
 * back up, the heading sat on "Put your" for three and a half seconds. That
 * was the stall. Now one requestAnimationFrame loop keeps one number, how far
 * into the phrase we are (lib/marketing/hero-typing), and draws from it:
 * stopping holds the number, starting again continues from it, and a frame
 * after a long task moves it by at most MAX_STEP_MS so letters never arrive
 * in a burst. Out of sight, the clock runs on to the end of the word first.
 *
 * NOTHING MOVES WHILE IT TYPES. The phrase being typed is laid out in full,
 * the letters not in yet at opacity 0, so a letter arriving changes its own
 * opacity and blur and nothing else. Every phrase is laid out invisibly in
 * the same grid cell, so the heading is as tall as the tallest one.
 *
 * The caret is one element moved by transform to the end of the last letter,
 * gliding between letters. Positions are read once per phrase (and again if
 * the heading's width or font changes), never per frame.
 *
 * The server's HTML has the first phrase complete: it is the page's largest
 * paint, what a crawler reads, and all that reduced motion shows.
 */
export function HeroTypedHeading({ className }: { className?: string }) {
  const lineRef = useRef<HTMLSpanElement>(null)
  const boxRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const line = lineRef.current
    const box = boxRef.current
    if (!line || !box) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    let phrase = 0
    let tl: PhraseTimeline = phraseTimeline(HERO_PHRASES[0], 0)
    /* The first phrase arrived whole with the page: start it at its hold. */
    let t = tl.typed
    type Line = { el: HTMLSpanElement; chars: HTMLSpanElement[]; drawn: number[]; ends: { x: number; y: number; h: number }[]; start: { x: number; y: number; h: number } }
    let lines: Line[] = []
    let chars: HTMLSpanElement[] = []
    let drawn: number[] = []
    let ends: Line["ends"] = []
    let start: Line["start"] = { x: 0, y: 0, h: 0 }
    let caretX = 0
    let caretY = 0
    let caretShown = false
    let caretPose = ""
    let caretHeight = ""
    let caretFade = ""
    let wasIdle: boolean | null = null
    let raf: number | null = null
    let last = 0
    let onScreen = true
    let stopAt: number | null = null

    const caret = document.createElement("span")
    caret.setAttribute("data-hero-caret", "")

    /*
      EVERY PHRASE IS BUILT ONCE, ON ITS OWN LINE IN THE SAME GRID CELL, and
      a new phrase is only a change of which line's letters have opacity. A
      phrase built when its turn came put new elements into the page, and the
      layout that forced ran over the whole page: measured, a 190ms task (CPU
      four times slower) at every change of phrase. Now the page is laid out
      for the heading once, at the start.
    */
    const build = () => {
      lines = HERO_PHRASES.map((text, i) => {
        const el = i === 0 ? line : document.createElement("span")
        if (i > 0) el.className = line.className
        const letters = Array.from(text, (ch) => {
          const span = document.createElement("span")
          span.textContent = ch
          if (i > 0) span.style.opacity = "0"
          return span
        })
        el.replaceChildren(...letters)
        return { el, chars: letters, drawn: letters.map(() => (i === 0 ? 1 : 0)), ends: [], start: { x: 0, y: 0, h: 0 } }
      })
      box.append(...lines.slice(1).map((l) => l.el), caret)
      show(0)
      measure()
    }
    /* The current phrase's line: the one the page and the probes read as the heading. */
    const show = (i: number) => {
      lines.forEach((l, j) => l.el.toggleAttribute("data-hero-line", j === i))
      ;({ chars, drawn, ends, start } = lines[i])
      caretShown = false
    }
    /* Where each letter of every phrase ends, relative to the box: one layout read, again only on a resize or a new font. */
    const measure = () => {
      const b = box.getBoundingClientRect()
      for (const l of lines) {
        l.ends = l.chars.map((c) => {
          const r = c.getBoundingClientRect()
          return { x: r.right - b.left, y: r.top - b.top, h: r.height }
        })
        const first = l.chars[0]?.getBoundingClientRect()
        l.start = first ? { x: first.left - b.left, y: first.top - b.top, h: first.height } : { x: 0, y: 0, h: 0 }
      }
      const current = lines[phrase]
      if (current) { ends = current.ends; start = current.start }
      caretShown = false
    }

    const draw = (dt: number) => {
      for (let i = 0; i < chars.length; i++) {
        const a = Math.round(letterAlpha(tl, i, t) * 100) / 100
        if (a === drawn[i]) continue
        drawn[i] = a
        const s = chars[i].style
        s.opacity = a >= 1 ? "" : String(a)
        s.filter = a >= 1 || a <= 0 ? "" : `blur(${((1 - a) * 0.09).toFixed(3)}em)`
      }
      const k = lettersStarted(tl, t)
      const out = t >= tl.outStart
      const to = k === 0 ? start : ends[k - 1]
      if (!to) return
      if (!caretShown || to.y !== caretY) {
        /* A new line: the caret goes straight there rather than across the heading. */
        caretX = to.x
        caretY = to.y
        caretShown = true
      } else {
        caretX += (to.x - caretX) * (1 - Math.exp(-dt / 34))
      }
      /* The bar is the letters' height less a little at the top and bottom. */
      const pose = `translate3d(${caretX.toFixed(1)}px,${(caretY + to.h * 0.13).toFixed(1)}px,0)`
      const height = `${(to.h * 0.76).toFixed(1)}px`
      const fade = out ? String(Math.round(Math.max(0, 1 - (t - tl.outStart) / 200) * 100) / 100) : ""
      if (pose !== caretPose) { caret.style.transform = pose; caretPose = pose }
      if (height !== caretHeight) { caret.style.height = height; caretHeight = height }
      if (fade !== caretFade) { caret.style.opacity = fade; caretFade = fade }
      /* Blinks only while nothing is being typed. */
      const idle = t >= tl.typed && !out
      if (idle !== wasIdle) { box.toggleAttribute("data-idle", idle); wasIdle = idle }
    }

    const active = () => onScreen && document.visibilityState !== "hidden"

    const frame = (now: number) => {
      raf = null
      const dt = last ? Math.min(MAX_STEP_MS, Math.max(0, now - last)) : 0
      last = now
      /* Out of sight: run on to the end of the word (or of the fade out), then stop there. */
      if (!active() && stopAt === null) stopAt = restTime(HERO_PHRASES[phrase], tl, t)
      if (active()) stopAt = null
      t = stopAt === null ? t + dt : Math.min(stopAt, t + dt)
      if (t >= tl.end) {
        phrase = (phrase + 1) % HERO_PHRASES.length
        tl = phraseTimeline(HERO_PHRASES[phrase], phrase)
        t = 0
        show(phrase)
      }
      draw(dt)
      if (stopAt !== null && t >= stopAt) { last = 0; return }
      raf = requestAnimationFrame(frame)
    }
    const run = () => { if (raf === null) { last = 0; raf = requestAnimationFrame(frame) } }
    const sync = () => { if (active()) run() }

    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
      : null
    /* A new width or the web font arriving moves the letters: read them again. */
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => measure()) : null

    build()
    draw(0)
    io?.observe(box)
    ro?.observe(box)
    document.fonts?.ready.then(() => measure()).catch(() => {})
    document.addEventListener("visibilitychange", sync)
    run()
    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
      io?.disconnect()
      ro?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      for (const l of lines.slice(1)) l.el.remove()
      caret.remove()
    }
  }, [])

  return (
    <span ref={boxRef} data-hero-typed="" aria-hidden className={`hero-typed relative grid ${className ?? ""}`}>
      {HERO_PHRASES.map((p) => (
        /* Drawn from an attribute, so the page's text (and the heading a crawler reads) is the one phrase, once. */
        <span key={p} data-ghost={p} className="invisible col-start-1 row-start-1 self-center before:content-[attr(data-ghost)]" />
      ))}
      <span ref={lineRef} data-hero-line="" className="col-start-1 row-start-1 self-center">{HERO_PHRASES[0]}</span>
    </span>
  )
}
