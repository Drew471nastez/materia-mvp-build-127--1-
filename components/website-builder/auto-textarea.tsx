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
 * text" — it accounts for wrapping, the font, the padding and the line
 * height, none of which this component has to know.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { useEchoedValue } from "./echo-field"

export function AutoTextarea({
  value,
  onChange,
  placeholder,
  /** Lines before it stops growing and starts scrolling. */
  maxRows = 12,
  className,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxRows?: number
  className?: string
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  /* What is typed shows at once; the editor hears of it in a transition. See ./echo-field. */
  const [shown, set] = useEchoedValue(value, onChange)

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
  React.useLayoutEffect(fit, [fit, shown])

  /**
   * And when the panel changes width, because the same text wraps into a
   * different number of lines in a narrower sidebar. Observed rather than
   * listened for on the window: the sidebar is resizable by hand.
   */
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  return (
    <textarea
      ref={ref}
      rows={1}
      className={cn(
        "w-full resize-none px-3 py-2 text-sm border border-border rounded-lg bg-background",
        "focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors",
        className,
      )}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => set(e.target.value)}
      {...rest}
    />
  )
}
