"use client"

import { useEffect } from "react"

/*
  ONE SAFETY NET FOR LOOPS OFF SCREEN (landing round 11, performance).

  Every section gates its own loops (data-commerce-live, data-platform-live,
  data-live...), each with its own margin, and each in its own way. A loop
  that slips through (a gate with a wide margin, a sticky stage, a new
  section) keeps ticking while its section is far from the screen, and every
  running animation costs the page's thread a style update on each frame that
  is drawn while the visitor scrolls (measured: about a third of the
  animations running during a scroll were nowhere near the screen).

  So this one component watches every [data-lazy-section] box with one
  IntersectionObserver and a generous margin (NEAR_MARGIN, a screen each
  way, more than any section's own gate). The box is marked data-far while it
  is outside it. Entering that state, the infinite CSS loops of the box that
  are running are paused through the Animations API; coming back, exactly
  those are played again, and only where the stylesheet still wants them
  running (a section's own gate may have paused one meanwhile, and a rule
  such as "paused under :hover" is the stylesheet's to decide).

  Why not a CSS rule on [data-far] *: measured on this page, toggling an
  attribute that every element of a section answers to restyles the whole
  section (1000 to 3000 elements) at each crossing: +1.1 s of style work over
  one scroll, more than the pause saved. The Animations API touches only the
  animating elements.

  Left alone on purpose: animations that run once (an entrance in flight
  finishes where it is), scroll-driven animations (the browser places them by
  the scroll position), transitions, and animations the sections drive from
  script (their own play and pause).
*/
export const NEAR_MARGIN = "100% 0px 100% 0px"

type Held = CSSAnimation[]

function wantsRunning(a: CSSAnimation): boolean {
  const effect = a.effect as KeyframeEffect | null
  const target = effect?.target
  if (!target) return false
  const cs = getComputedStyle(target, effect.pseudoElement ?? null)
  const names = cs.animationName.split(",").map((s) => s.trim())
  const states = cs.animationPlayState.split(",").map((s) => s.trim())
  const i = names.lastIndexOf(a.animationName)
  if (i < 0) return false
  return (states[i % states.length] ?? "running") === "running"
}

export function pauseLoops(box: Element): Held {
  const held: Held = []
  if (typeof box.getAnimations !== "function") return held
  for (const a of box.getAnimations({ subtree: true })) {
    if (!(a instanceof CSSAnimation) || a.playState !== "running") continue
    if (a.timeline && a.timeline !== document.timeline) continue
    let forever = false
    try {
      forever = a.effect?.getComputedTiming().iterations === Infinity
    } catch {
      forever = false
    }
    if (!forever) continue
    a.pause()
    held.push(a)
  }
  return held
}

export function resumeLoops(held: Held) {
  for (const a of held) {
    const target = (a.effect as KeyframeEffect | null)?.target
    if (a.playState === "paused" && target?.isConnected && wantsRunning(a)) a.play()
  }
}

export function NearGate() {
  useEffect(() => {
    if (typeof IntersectionObserver !== "function" || typeof CSSAnimation === "undefined") return
    const held = new Map<Element, Held>()
    const watched = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const box = e.target
          box.toggleAttribute("data-far", !e.isIntersecting)
          if (!e.isIntersecting) {
            if (!held.has(box)) held.set(box, pauseLoops(box))
          } else {
            const list = held.get(box)
            if (list) {
              held.delete(box)
              resumeLoops(list)
            }
          }
        }
      },
      { rootMargin: NEAR_MARGIN },
    )
    /* A far box that gets its section mounted after the first report (the lazy sections are built ahead of the screen): its loops are paused once it has drawn. */
    const mounted =
      typeof MutationObserver === "function"
        ? new MutationObserver((records) => {
            for (const r of records) {
              const box = r.target as Element
              if (!box.hasAttribute("data-far")) continue
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  if (!box.hasAttribute("data-far")) return
                  const more = pauseLoops(box)
                  if (more.length) held.set(box, [...(held.get(box) ?? []), ...more])
                }),
              )
            }
          })
        : null
    const scan = () => {
      for (const box of document.querySelectorAll("[data-lazy-section]")) {
        if (watched.has(box)) continue
        watched.add(box)
        io.observe(box)
        mounted?.observe(box, { attributes: true, attributeFilter: ["data-lazy-mounted"] })
      }
    }
    scan()
    /* A box drawn later than this effect (a section that arrives after hydration) is picked up too. */
    const again = window.setTimeout(scan, 1500)
    return () => {
      window.clearTimeout(again)
      io.disconnect()
      mounted?.disconnect()
      for (const list of held.values()) resumeLoops(list)
      held.clear()
      for (const box of watched) box.removeAttribute("data-far")
    }
  }, [])
  return null
}
