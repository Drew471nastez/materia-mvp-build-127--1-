"use client"

/**
 * ===========================================================================
 *  A SLIDER AND THE NUMBER IT IS ON
 * ===========================================================================
 * The editor's one slider, lifted out of the page so the probe that measures
 * its frame pacing drives the same code the product does rather than a copy
 * of it (scripts/check-control-frames.mjs).
 *
 * TWO THINGS MAKE IT SMOOTH, and they are the same two things that make the
 * colour controls smooth.
 *
 * The thumb is drawn from state held HERE. It used to be drawn from the
 * prop, which comes back from the editor's own state: the thumb could not
 * move until a settings change had gone all the way up, re-rendered the
 * editor and come back down, so at the far end of a drag the thumb was
 * visibly behind the finger.
 *
 * And what goes up goes up once a frame, not once a `pointermove`. A phone
 * reports touches faster than it paints — up to 240 a second on a 120Hz
 * panel — and every one of those was a full settings write and a canvas
 * repaint. That is the lag, and it is not the slider's own work: it is what
 * the slider asked the rest of the editor to do while a finger was down.
 *
 * NO HAPTICS. A tick per step crossed sounded right and is not: a drag
 * crosses a lot of steps, the taps run into each other, and on a slider you
 * are already watching the number change. Asked for and removed.
 */
import { useEffect, useRef, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { useFrameCommit } from "./use-frame-commit"

export function SliderNumberControl({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  className,
  onLiveChange,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
  /**
   * Every value the thumb is drawn at, as it is drawn, before the once a frame
   * commit: for a caller that answers the finger itself (the OnePage editor's
   * sliders tick at their stops, components/onepage/editor-kit RangeRow).
   * This control stays silent.
   */
  onLiveChange?: (v: number) => void
}) {
  const [inputStr, setInputStr] = useState<string>(String(value))
  const focusedRef = useRef(false)

  /**
   * What the thumb is drawn at. The prop is where it loads from and what it
   * follows when something else changes the setting; while a finger is on
   * it, this is ahead of the prop by however long the editor takes.
   */
  const [shown, setShown] = useState(value)
  const sent = useRef<number | null>(null)
  const { emit, flush } = useFrameCommit(onChange)

  useEffect(() => {
    /* Our own value coming back is not a change. */
    if (sent.current !== null && value === sent.current) return
    sent.current = null
    setShown(value)
    if (!focusedRef.current) setInputStr(String(value))
  }, [value])

  const set = (v: number) => {
    onLiveChange?.(v)
    setShown(v)
    if (!focusedRef.current) setInputStr(String(v))
    sent.current = v
    emit(v)
  }

  const commit = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      const snapped = step > 0 ? Math.round(clamped / step) * step : clamped
      set(snapped)
      flush()
      setInputStr(String(snapped))
    } else {
      setInputStr(String(shown))
    }
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/**
        * ═══════════════════════════════════════════════════════════════════
        *  A SLIDER'S FINGER IS THE SLIDER'S
        * ═══════════════════════════════════════════════════════════════════
        * The sheet arbitrates every touch that lands on it between "scroll
        * the form" and "move the sheet", and a sideways drag is only handed
        * back when it is clearly sideways: 1.2 times more horizontal than
        * vertical. A thumb dragging a slider is not that precise. Ten pixels
        * right and nine down is not horizontal enough, the sheet takes the
        * gesture, and it follows the finger down and snaps to half — which
        * is "when I drag the sliders left and right it glitches the sheet
        * and makes it half for no reason".
        *
        * No threshold fixes it, because the two gestures are the same
        * gesture. What tells them apart is what the finger landed on, and
        * this attribute is the sheet's own way of being told: it does not
        * arm at all for a touch that starts in here.
        */}
      <div data-sheet-no-drag className="flex-1 relative py-2 -my-2 touch-none select-none">
        <Slider
          value={[shown]}
          onValueChange={([v]) => set(v)}
          onValueCommit={() => flush()}
          min={min}
          max={max}
          step={step}
          className="wb-black-slider"
        />
      </div>
      <div className="relative shrink-0">
        <input
          type="text"
          inputMode="numeric"
          className="h-8 w-[58px] px-2 text-xs text-center border border-neutral-200 rounded-md bg-white text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400 transition-colors"
          value={inputStr + (focusedRef.current ? "" : unit ?? "")}
          onFocus={e => {
            focusedRef.current = true
            setInputStr(String(shown))
            // Select on focus so user can type immediately
            requestAnimationFrame(() => e.target.select())
          }}
          onChange={e => setInputStr(e.target.value.replace(unit ?? "", "").replace(/[^0-9.\-]/g, ""))}
          onBlur={e => { focusedRef.current = false; commit(e.target.value.replace(unit ?? "", "")) }}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "ArrowUp") { e.preventDefault(); set(Math.min(max, shown + step)); flush() }
            if (e.key === "ArrowDown") { e.preventDefault(); set(Math.max(min, shown - step)); flush() }
          }}
        />
      </div>
    </div>
  )
}
