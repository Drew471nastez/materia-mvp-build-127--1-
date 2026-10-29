"use client"

/**
 * ===========================================================================
 *  THE PAGE BEHIND A WINDOW STAYS WHERE IT IS (round 43)
 * ===========================================================================
 * "Opening the payment, instant checkout, share or subscribe window on a
 * computer glitches the page." Each window held the page still its own way:
 * the checkout window set `overflow: hidden` on <html>, a Radix dialog (the
 * product sheet on a computer) set it on <body> and added the scrollbar's
 * width as a margin, and the older windows did nothing. Taking the overflow
 * away takes the scrollbar with it, so on a computer every one of them made
 * the page, and everything fixed over it (the wallpaper, the Share and bell
 * buttons), jump sideways by the bar's width and back on close.
 *
 * One hold for all of them now. While anything holds the page, <html> keeps
 * the scrollbar's room (`scrollbar-gutter: stable`) as it stops scrolling,
 * so the width every element is laid out in never changes; and only when a
 * scrollbar takes room at all: on a phone, or a Mac set to show bars when
 * scrolling, there is none to keep, and a gutter would add one. A Radix
 * dialog's lock is followed (followDialogLocks): its body rule is answered
 * from app/globals.css ([data-op-hold] body[data-scroll-locked]) so the
 * margin it adds for the bar is not added twice.
 *
 * Counted, so two windows open at once (a checkout over a product sheet)
 * let go only when the last one closes.
 */
import { useEffect } from "react"

let holds = 0
let saved: { overflow: string; gutter: string } | null = null

/** The room the window's scrollbar takes, measured while nothing holds the page. */
export function scrollbarRoom(): number {
  if (typeof window === "undefined") return 0
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

/**
 * Hold the page still. `room` is the scrollbar's width when it was measured
 * before something else took the bar away (a Radix lock says it on body as
 * --removed-body-scroll-bar-size). Returns the release.
 */
export function holdPage(room?: number): () => void {
  if (typeof document === "undefined") return () => {}
  const html = document.documentElement
  if (holds === 0) {
    const gap = room ?? scrollbarRoom()
    saved = { overflow: html.style.overflow, gutter: html.style.getPropertyValue("scrollbar-gutter") }
    if (gap > 0) html.style.setProperty("scrollbar-gutter", "stable")
    html.style.overflow = "hidden"
    html.setAttribute("data-op-hold", "")
  }
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds = Math.max(0, holds - 1)
    if (holds > 0) return
    html.style.overflow = saved?.overflow ?? ""
    if (saved?.gutter) html.style.setProperty("scrollbar-gutter", saved.gutter)
    else html.style.removeProperty("scrollbar-gutter")
    html.removeAttribute("data-op-hold")
    saved = null
  }
}

/** Hold the page while `on`. */
export function useHeldPage(on: boolean) {
  useEffect(() => {
    if (!on) return
    return holdPage()
  }, [on])
}

/**
 * Follow every Radix dialog's scroll lock (body[data-scroll-locked]) with a
 * hold, for as long as the lock lasts. Radix measures the bar before it
 * hides it and says the width as --removed-body-scroll-bar-size; that is the
 * room kept, since by the time the lock is seen the bar may be gone.
 */
export function followDialogLocks(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {}
  const body = document.body
  let release: (() => void) | null = null
  /*
    The bar's width, kept up to date while nothing holds the page: by the
    time a lock is seen its body rule may already have taken the bar away,
    and Radix's own note of the width (--removed-body-scroll-bar-size) is not
    always written yet.
  */
  let room = scrollbarRoom()
  const remeasure = () => {
    if (holds === 0 && !body.hasAttribute("data-scroll-locked")) room = scrollbarRoom()
  }
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure)
  ro?.observe(document.documentElement)
  window.addEventListener("resize", remeasure)
  const sync = () => {
    const locked = body.hasAttribute("data-scroll-locked")
    if (locked && !release) {
      const said = parseFloat(getComputedStyle(body).getPropertyValue("--removed-body-scroll-bar-size"))
      release = holdPage(Number.isFinite(said) && said > 0 ? said : room)
    } else if (!locked && release) {
      release()
      release = null
      remeasure()
    }
  }
  const mo = new MutationObserver(sync)
  mo.observe(body, { attributes: true, attributeFilter: ["data-scroll-locked"] })
  sync()
  return () => {
    mo.disconnect()
    ro?.disconnect()
    window.removeEventListener("resize", remeasure)
    release?.()
    release = null
  }
}
