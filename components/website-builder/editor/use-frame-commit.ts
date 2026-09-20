"use client"

/**
 * ===========================================================================
 *  A FINGER MOVES FASTER THAN A DOCUMENT CAN BE REWRITTEN
 * ===========================================================================
 * The design controls all end in the same place: a theme setting changes,
 * the editor re-renders, the section is re-serialised and the whole thing is
 * posted to the canvas iframe to repaint. That is fine once. It is not fine
 * once per `pointermove`, which on a 120Hz phone is up to 240 a second — and
 * that is what dragging inside the colour picker or along a gradient did.
 * The control crawls behind the thumb, which is what "the colour customisers
 * lag" is.
 *
 * So a control keeps its own position in local state, written on every move
 * because that is the part that has to keep up with a finger, and hands the
 * expensive half to this: at most one call per frame, which is as often as a
 * screen can show a change anyway.
 *
 * `flush` is for the end of a gesture. A control that closes on release
 * would otherwise leave its last value in a frame that never runs.
 */
import { useCallback, useEffect, useRef } from "react"

export function useFrameCommit<T>(onChange: (value: T) => void): {
  emit: (value: T) => void
  flush: () => void
} {
  const pending = useRef<{ value: T } | null>(null)
  const frame = useRef(0)
  /* Held in a ref so a parent that passes a fresh closure every render does
     not rebuild the callbacks and restart anything mid-drag. */
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })

  const flush = useCallback(() => {
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    const p = pending.current
    pending.current = null
    if (p) latest.current(p.value)
  }, [])

  const emit = useCallback(
    (value: T) => {
      pending.current = { value }
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        flush()
      })
    },
    [flush],
  )

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  return { emit, flush }
}
