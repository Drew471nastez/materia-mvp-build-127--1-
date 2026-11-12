"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"

/*
  AUTOPLAYING TABS WITHOUT A TIMER.
  The active pill's progress bar is a CSS animation; when it ends, the next
  tab is shown. So pausing is just pausing that animation (offscreen, hidden
  tab, pointer resting on the stage, the pause button), and nothing ticks
  while the section is out of view. Picking a tab yourself stops autoplay.

  Only three panels exist in the DOM at once: the active one, the one fading
  out underneath it (for ~600ms, so a switch never shows the page behind),
  and the next one, laid out but invisible, so its pictures are already
  decoded when it arrives.
*/
export type PanelState = "active" | "leaving" | "next"

export function useAutoTabs(count: number) {
  const rootRef = useRef<HTMLElement>(null)
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [hover, setHover] = useState(false)
  const [reduce, setReduce] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const root = rootRef.current
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    const syncMotion = () => setReduce(motion.matches)
    const syncHidden = () => setHidden(document.hidden)
    syncMotion()
    syncHidden()
    motion.addEventListener("change", syncMotion)
    document.addEventListener("visibilitychange", syncHidden)
    const io =
      root && typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 })
        : null
    if (root && io) io.observe(root)
    else setInView(true)
    return () => {
      io?.disconnect()
      motion.removeEventListener("change", syncMotion)
      document.removeEventListener("visibilitychange", syncHidden)
      clearTimeout(leaveTimer.current)
    }
  }, [])

  const current = useRef(0)
  const go = useCallback(
    (to: number) => {
      const from = current.current
      const next = ((to % count) + count) % count
      if (next === from) return
      current.current = next
      setLeaving(from)
      setIndex(next)
      clearTimeout(leaveTimer.current)
      leaveTimer.current = setTimeout(() => setLeaving(null), 650)
    },
    [count],
  )

  /** A person chose: show it and stop moving on by ourselves. */
  const select = useCallback(
    (to: number) => {
      setPlaying(false)
      go(to)
    },
    [go],
  )

  const advance = useCallback(() => go(index + 1), [go, index])

  const live = inView && !hidden
  const autoplay = playing && !reduce
  const run = autoplay && live && !hover

  const states = new Map<number, PanelState>()
  if (count > 1) states.set((index + 1) % count, "next")
  if (leaving !== null && leaving !== index) states.set(leaving, "leaving")
  states.set(index, "active")

  const hoverProps = {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse") setHover(true)
    },
    onPointerLeave: () => setHover(false),
  }

  return { rootRef, index, select, advance, go, playing: autoplay, setPlaying, live, run, states, hoverProps, reduce }
}
