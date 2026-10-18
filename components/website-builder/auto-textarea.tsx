"use client"

/**
 * ===========================================================================
 *  A BOX THE SIZE OF WHAT IS IN IT
 * ===========================================================================
 * Every multi-line field in the builder was a textarea with `min-h-[80px]`
 * and `resize-y`. Two things were wrong with that and they pull in opposite
 * directions, which is why one number could not fix it:
 *
 *   - A subheading of six words sat in a box four lines tall, so most fields
 *     in the panel were mostly empty space.
 *   - A long one scrolled INSIDE a box four lines tall, so editing it meant
 *     dragging a scrollbar the width of a thumb through a paragraph.
 *
 * So the box is one line when it is empty and grows a line at a time as you
 * type, up to a ceiling, after which it scrolls. The ceiling exists because
 * the panel scrolls too, and a field that can be a thousand pixels tall
 * pushes everything else out of reach.
 *
 * MEASURED, NOT COUNTED. Height comes from `scrollHeight` after the height
 * has been reset, which is the browser's own answer to "how tall is this
 * text": it accounts for wrapping, the font, the padding and the line
 * height, none of which this component has to know.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { useEchoedValue } from "./echo-field"

/**
 * THE BROWSER DOES IT ITSELF WHERE IT CAN. `field-sizing: content` (Chrome
 * and Edge) sizes a textarea to its text with no script at all, so there is
 * nothing to measure: no forced layout per field when a section's settings
 * open, which with a few text boxes on the panel was a few forced layouts of
 * the whole editor in the frame a section was added. Where it is not
 * supported (Safari, Firefox) the measuring below does the same job.
 *
 * Read once, on the client: this field only ever renders in the builder,
 * which draws its panels after the page has loaded, so no server-rendered
 * markup has to agree with it.
 */
const NATIVE_SIZING = typeof window !== "undefined" && typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")

export function AutoTextarea({
  value,
  onChange,
  placeholder,
  /** Lines before it stops growing and starts scrolling. */
  maxRows = 12,
  className,
  singleLine = false,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxRows?: number
  className?: string
  /**
   * ONE LINE BY MEANING, NOT BY WIDTH. A heading or a button label is one
   * line of text, and an `<input>` holding a long one scrolls sideways: the
   * start of the words leaves the box while the end is typed. As a box that
   * wraps and grows instead, Enter is refused and a pasted line break
   * becomes a space, so what is saved is still one line.
   */
  singleLine?: boolean
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  /* What is typed shows at once; the editor hears of it in a transition. See ./echo-field. */
  const [shown, set] = useEchoedValue(value, onChange)
  const { onKeyDown, ...others } = rest

  const fit = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    /**
     * Reset FIRST. `scrollHeight` is the content's height or the element's,
     * whichever is larger, so measuring without this can only ever grow: a
     * field would ratchet upwards as you deleted from it.
     */
    el.style.height = "auto"
    const styles = getComputedStyle(el)
    const line = parseFloat(styles.lineHeight) || 20
    const chrome =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth)
    const ceiling = Math.round(line * maxRows + chrome)
    const wanted = el.scrollHeight
    el.style.height = `${Math.min(wanted, ceiling)}px`
    el.style.overflowY = wanted > ceiling ? "auto" : "hidden"
  }, [maxRows])

  /**
   * On every value change, not only on typing: a field can be written by the
   * assistant, by an undo, or by switching to another section, and a box that
   * only resized under a keystroke would be the wrong size for all three.
   */
  React.useLayoutEffect(() => {
    if (!NATIVE_SIZING) fit()
  }, [fit, shown])

  /**
   * And when the panel changes width, because the same text wraps into a
   * different number of lines in a narrower sidebar. Observed rather than
   * listened for on the window: the sidebar is resizable by hand.
   */
  React.useEffect(() => {
    const el = ref.current
    if (NATIVE_SIZING || !el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  return (
    <textarea
      ref={ref}
      rows={1}
      className={cn(
        /* Wraps an unbroken word or address rather than scrolling sideways. */
        "w-full min-w-0 resize-none overflow-x-hidden [overflow-wrap:anywhere] px-3 py-2 text-sm border border-border rounded-lg bg-background",
        "focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors",
        className,
      )}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => set(singleLine ? e.target.value.replace(/\s*[\r\n]+\s*/g, " ") : e.target.value)}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") e.preventDefault()
        onKeyDown?.(e)
      }}
      /* The same ceiling as the measured path: `maxRows` lines, then it scrolls. */
      style={NATIVE_SIZING ? ({ fieldSizing: "content", maxHeight: `calc(${maxRows}lh + 18px)` } as React.CSSProperties) : undefined}
      {...others}
    />
  )
}
