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
 *
 * ---------------------------------------------------------------------------
 *  ONCE A FRAME IS THE CEILING, NOT THE RATE
 * ---------------------------------------------------------------------------
 * Once per frame is right only while the far end can finish inside a frame.
 * The far end is the canvas: a page of sections, re-rendered. On a laptop
 * that is a few milliseconds and once a frame costs nothing. On a phone it
 * is tens of milliseconds, and asking for it sixty times a second queues
 * work the device has no chance of clearing, so the whole sheet — the drag,
 * the thumb, the scroll — stutters behind it. That is "dragging a slider in
 * the sections sheet is very laggy".
 *
 * Measured with the canvas costing 80ms and the CPU at a quarter speed, a
 * one-second drag ran 16 frames past two frames' budget.
 *
 * So the commit takes a SHARE of the main thread rather than a slot in every
 * frame. After each one, the frame it landed in is measured — that frame
 * contains the work the commit caused — and the next commit waits about
 * twice that long. The canvas then gets roughly a third of the thread and
 * the drag keeps the rest, whatever device it is and whatever the page
 * costs to draw.
 *
 * It needs no number about phones in it. A canvas that renders in 8ms is
 * waited on for 16 and updates every frame; one that takes 80 is waited on
 * for 160 and updates six times a second, which is still live to look at.
 *
 * Simply skipping overran frames was tried first and is not enough: the
 * commit rate is already bounded by how long the frames are, so when the
 * canvas is slow the frames are slow and one commit per slow frame is
 * exactly the flood. Measured at an 80ms canvas, skipping took a one-second
 * drag from 16 janky frames to 13. The share rule is what moves it.
 *
 * `MAX_HOLD_MS` is the floor on how live the preview stays. Backing off
 * without one would let a slow enough canvas stop updating while a finger is
 * down, and watching the number change while the page does not is worse than
 * a dropped frame.
 */
/** How much longer than its own cost the canvas waits before being asked again. */
const COST_MULTIPLIER = 2
/** However far behind the device is, the canvas is never staler than this. */
const MAX_HOLD_MS = 250
import { useCallback, useEffect, useRef } from "react"

export function useFrameCommit<T>(onChange: (value: T) => void): {
  emit: (value: T) => void
  flush: () => void
} {
  const pending = useRef<{ value: T } | null>(null)
  const frame = useRef(0)
  /** The last rAF timestamp, to read how long the frame before it took. */
  const lastTs = useRef(0)
  /** When the value now waiting first arrived, for MAX_HOLD_MS. */
  const heldSince = useRef(0)
  /** When the last commit went out, and what the frame around it cost. */
  const lastFlushAt = useRef(0)
  const lastCost = useRef(0)
  const frameMs = useRef(Number.POSITIVE_INFINITY)
  /** Set for the one frame after a commit, which is the one that carries its work. */
  const measuring = useRef(false)
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
    heldSince.current = 0
    if (p) {
      lastFlushAt.current = performance.now()
      measuring.current = true
      latest.current(p.value)
    }
  }, [])

  /* Re-arms itself for as long as the frames say the device is behind. */
  const schedule = useCallback(() => {
    frame.current = requestAnimationFrame((ts) => {
      frame.current = 0
      const gap = lastTs.current ? ts - lastTs.current : 0
      lastTs.current = ts
      /* The screen's own frame: the shortest gap seen (16.7ms at 60Hz, 8.3 at 120). */
      if (gap > 4 && gap < 40) frameMs.current = Math.min(frameMs.current, gap)
      /* The first frame after a commit is the one that did its work, so what
         it ran over the screen's frame is what that commit cost this device.
         The whole gap was counted before, and a gap is never less than a
         frame: a canvas that drew in 2ms was still held for two frames,
         and a drag drew every other value at best (round 25,
         scripts/check-slider-latency.mjs). */
      if (measuring.current) {
        measuring.current = false
        lastCost.current = Math.max(0, gap - (Number.isFinite(frameMs.current) ? frameMs.current : 16.7))
      }
      const waited = heldSince.current ? performance.now() - heldSince.current : 0
      const hold = Math.min(lastCost.current * COST_MULTIPLIER, MAX_HOLD_MS)
      const since = lastFlushAt.current ? performance.now() - lastFlushAt.current : hold
      if (since < hold && waited < MAX_HOLD_MS && pending.current) {
        schedule()
        return
      }
      flush()
    })
  }, [flush])

  const emit = useCallback(
    (value: T) => {
      if (!pending.current) heldSince.current = performance.now()
      pending.current = { value }
      if (frame.current) return
      schedule()
    },
    [schedule],
  )

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  return { emit, flush }
}
