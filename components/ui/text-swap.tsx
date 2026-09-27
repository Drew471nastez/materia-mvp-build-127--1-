"use client"

/**
 * ONE LINE THAT CHANGES, CHANGED SMOOTHLY.
 *
 * Every version of the line is already laid out, stacked in one grid cell,
 * so the cell is as wide and as tall as the longest of them and nothing
 * beside or under it moves when the line changes. Only the version that
 * applies is shown. On a change the old one fades out while the new one
 * fades in, on the same curve over the same time, so the two add up to one
 * whole line on every frame (no dip to nothing, no moment of two full
 * lines). Both drift a third of a line as they go: the old one away, the
 * new one into place, up when moving forward through the items and down
 * when moving back, which reads as the line rolling over. Only opacity and
 * `translate` move, which a phone does on the compositor without laying
 * anything out or painting again.
 *
 * A line that reads the same whichever item is chosen (Free's $0) is drawn
 * once, as plain text: nothing to fade, nothing to move, nothing that could
 * blink.
 *
 * Used by every plan card (components/billing/plan-cards) and by the
 * onboarding's last step (components/app/creator-onboarding-modal).
 * scripts/check-billing-tab.mjs samples it frame by frame.
 */
import * as React from "react"

/** How long a change takes, shared with whatever moves beside it (the plan pill's thumb). */
export const SWAP_MS = 260
/** Fades: quick to start, soft to finish, and no overshoot. */
export const SWAP_FADE_MS = 200
export const SWAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const FADE_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

export function TextSwap<K extends string>({
  value,
  items,
  align = "start",
  fill = false,
  lift = "0.3em",
  as: Tag = "span",
  className = "",
}: {
  value: K
  items: Record<K, React.ReactNode>
  align?: "start" | "center"
  /** As wide as its container, for a button. */
  fill?: boolean
  /** How far a line drifts as it goes. */
  lift?: string
  /** "div" when the versions are blocks (a heading, a button row), so the markup stays valid. */
  as?: "span" | "div"
  className?: string
}) {
  const keys = Object.keys(items) as K[]
  const first = items[keys[0]]
  /* Words that do not change are not animated at all. */
  if ((typeof first === "string" || typeof first === "number") && keys.every((k) => items[k] === first)) return <>{first}</>

  /*
    ONLY THE PART THAT CHANGES MOVES. When every version is words, what they
    start with in common stays put as plain text and only the rest swaps:
    $29 to $22 rolls the 9 into a 2 under a $2 that holds still, and "per
    month" gains ", billed yearly" without "per month" fading at all. The
    split never falls inside a word.
  */
  let prefix = ""
  let parts = items
  if (keys.every((k) => typeof items[k] === "string")) {
    const texts = keys.map((k) => items[k] as string)
    let n = 0
    while (texts.every((t) => n < t.length && t[n] === texts[0][n])) n++
    const letter = (c: string | undefined) => !!c && /\p{L}/u.test(c)
    while (n > 0 && letter(texts[0][n - 1]) && texts.some((t) => letter(t[n]))) n--
    if (n > 0) {
      prefix = texts[0].slice(0, n)
      /* An empty remainder is a zero width space, so it still has a baseline to sit the cell on (an empty box would lift the words beside it). */
      parts = Object.fromEntries(keys.map((k, i) => [k, texts[i].slice(n) || "\u200b"])) as Record<K, React.ReactNode>
    }
  }

  const at = keys.indexOf(value)
  const swap = (
    <Tag
      data-morph-group=""
      className={`${fill ? "grid w-full justify-items-stretch" : `inline-grid ${align === "center" ? "justify-items-center" : "justify-items-start"}`} ${className}`}
    >
      {keys.map((key, i) => {
        const on = key === value
        return (
          <Tag
            key={key}
            aria-hidden={on ? undefined : true}
            inert={on ? undefined : true}
            data-morph={on ? "on" : "off"}
            /*
              A little room above and below the letters (padding, taken back
              by a negative margin) so the box a phone fades never cuts
              through a glyph.
            */
            className={`[grid-area:1/1] ${fill ? "" : "-my-[0.12em] py-[0.12em]"} ${prefix ? "whitespace-pre-wrap" : ""} motion-reduce:!transition-none motion-reduce:!translate-none`}
            style={{
              opacity: on ? 1 : 0,
              translate: on ? "0 0" : `0 ${i < at ? "-" : ""}${lift}`,
              transition: `opacity ${SWAP_FADE_MS}ms ${FADE_EASE}, translate ${SWAP_MS}ms ${SWAP_EASE}`,
              pointerEvents: on ? undefined : "none",
            }}
          >
            {parts[key]}
          </Tag>
        )
      })}
    </Tag>
  )
  return prefix ? <>{prefix}{swap}</> : swap
}
