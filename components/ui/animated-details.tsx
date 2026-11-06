"use client"
import { useEffect, useRef, type ComponentProps } from "react"
/** Native details semantics, with a cancellable close as well as open.
 * Animation stays local to this row; no React renders during a transition. */
export function AnimatedDetails({
  children,
  onClickCapture,
  ...props
}: ComponentProps<"details">) {
  const ref = useRef<HTMLDetailsElement>(null),
    animation = useRef<Animation | null>(null),
    target = useRef(false)
  useEffect(
    () => () => {
      animation.current?.cancel()
    },
    [],
  )
  return (
    <details
      {...props}
      ref={ref}
      onClickCapture={(e) => {
        onClickCapture?.(e)
        const element = ref.current,
          summary = (e.target as Element).closest("summary")
        if (
          e.defaultPrevented ||
          !element ||
          summary?.parentElement !== element ||
          (e.target as Element).closest("a,button,input")
        )
          return
        if (
          matchMedia("(prefers-reduced-motion:reduce)").matches ||
          typeof element.animate !== "function"
        )
          return
        e.preventDefault()
        const from = element.getBoundingClientRect().height
        target.current = animation.current ? !target.current : !element.open
        animation.current?.cancel()
        element.open = true
        element.style.height = "auto"
        const full = element.getBoundingClientRect().height,
          closed =
            summary.getBoundingClientRect().height +
            parseFloat(getComputedStyle(element).borderTopWidth || "0") +
            parseFloat(getComputedStyle(element).borderBottomWidth || "0")
        element.style.overflow = "hidden"
        const next = element.animate(
          [
            { height: `${from}px` },
            { height: `${target.current ? full : closed}px` },
          ],
          {
            duration: target.current ? 240 : 180,
            easing: "cubic-bezier(.32,.72,0,1)",
          },
        )
        animation.current = next
        next.onfinish = () => {
          if (animation.current !== next) return
          element.open = target.current
          element.style.height = ""
          element.style.overflow = ""
          animation.current = null
          next.cancel()
        }
      }}
    >
      {children}
    </details>
  )
}
