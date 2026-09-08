"use client"

/**
 * ===========================================================================
 *  STATS
 * ===========================================================================
 * Ten of seventeen controls did nothing: the three layouts (grid, row and
 * cards all rendered the same four-column grid), the icon toggle, the number
 * animation, the divider colour, the colours, the padding, and — on every
 * block — the prefix, the suffix, the description, the icon and its colour.
 *
 * So "10,000" with a "+" suffix rendered as "10,000".
 */

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  bool,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  DynamicIcon,
  type SectionProps,
} from "../_shared"

/**
 * COUNT UP TO A NUMBER SOMEBODY TYPED AS TEXT.
 *
 * The value is a text field — "10,000", "99.9", "1.2M" — because that is how
 * people write numbers. So the digits are counted and the rest of the string
 * is left exactly as typed: "1.2M" counts to 1.2 and keeps the M, "10,000"
 * counts to ten thousand and keeps its comma.
 *
 * It starts when the section comes into view, not on mount, or the animation
 * has finished before anybody has scrolled to it. `prefers-reduced-motion` and
 * a browser without IntersectionObserver both get the final value immediately
 * — never a zero that stays.
 */
function useCountUp(value: string, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => (enabled ? null : value))

  useEffect(() => {
    if (!enabled) {
      setShown(value)
      return
    }
    const node = ref.current
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!node || reduced || typeof IntersectionObserver === "undefined") {
      setShown(value)
      return
    }

    const match = value.match(/^(\D*)([\d.,]+)(.*)$/)
    if (!match) {
      setShown(value)
      return
    }
    const [, before, digits, after] = match
    const target = Number(digits.replace(/,/g, ""))
    if (!Number.isFinite(target)) {
      setShown(value)
      return
    }
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0
    const grouped = digits.includes(",")

    let raf = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        const start = performance.now()
        const DURATION = 1200
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION)
          // Ease out, so it decelerates into the final number instead of
          // stopping dead on it.
          const eased = 1 - Math.pow(1 - t, 3)
          const current = target * eased
          const text = current.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: grouped,
          })
          setShown(`${before}${text}${after}`)
          if (t < 1) raf = requestAnimationFrame(tick)
          else setShown(value)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, enabled])

  return { ref, shown: shown ?? value }
}

function Stat({
  value,
  animate,
  color,
  className,
}: {
  value: string
  animate: boolean
  color: string
  className: string
}) {
  const { ref, shown } = useCountUp(value, animate)
  return (
    <div ref={ref} className={className} style={{ color }}>
      {shown}
    </div>
  )
}

export function StatsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.text_color) || c.heading
  const textColor = str(s.text_color) || c.paragraph
  const divider = str(s.divider_color) || c.inset_border
  const layout = str(s.layout, "grid")
  const showIcon = bool(s.show_icon, true)
  const animate = bool(s.animate_numbers, true)
  const blocks = section.blocks ?? []

  /**
   * "row" is a single divided line — the divider colour has a job at last —
   * "cards" gives each stat its own surface, "grid" is the even grid.
   */
  const container =
    layout === "row"
      ? "flex flex-col @[768px]:flex-row @[768px]:divide-x divide-y @[768px]:divide-y-0"
      : layout === "cards"
        ? "grid grid-cols-1 gap-4 @[560px]:grid-cols-2 @[860px]:grid-cols-4"
        : "grid grid-cols-2 gap-x-4 gap-y-8 @[768px]:grid-cols-4"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-[1230px] mx-auto px-5 @[768px]:px-8" style={sectionPadding(s, 40, 56)}>
        {!!s.heading && (
          <div className="text-center mb-6 @[768px]:mb-8">
            <h2
              className="font-bold text-2xl @[768px]:text-3xl"
              style={{ color: headingColor, fontFamily: theme.font_heading }}
            >
              {str(s.heading)}
            </h2>
            {!!s.subheading && (
              <p className="text-sm @[768px]:text-base mt-2" style={{ color: textColor }}>
                {str(s.subheading)}
              </p>
            )}
          </div>
        )}
        <div className={cn(container, "text-center")} style={{ borderColor: divider }}>
          {blocks.map((block) => {
            const b = block.settings
            const accent = str(b.color) || headingColor
            return (
              <div
                key={block.id}
                className={cn(
                  "min-w-0",
                  layout === "row" && "flex-1 px-4 py-6",
                  layout === "cards" && "rounded-2xl border p-6",
                )}
                style={layout === "cards" ? { borderColor: divider } : undefined}
              >
                {showIcon && !!b.icon && (
                  <div className="mb-2 flex justify-center" style={{ color: accent }}>
                    <DynamicIcon name={str(b.icon, "zap")} className="h-6 w-6" />
                  </div>
                )}
                <div className="mb-1 flex items-baseline justify-center gap-0.5 leading-tight">
                  {!!b.prefix && (
                    <span className="text-xl font-bold @[768px]:text-2xl" style={{ color: accent }}>
                      {str(b.prefix)}
                    </span>
                  )}
                  <Stat
                    value={str(b.value)}
                    animate={animate}
                    color={accent}
                    className="font-bold tabular-nums text-3xl @[768px]:text-4xl"
                  />
                  {!!b.suffix && (
                    <span className="text-xl font-bold @[768px]:text-2xl" style={{ color: accent }}>
                      {str(b.suffix)}
                    </span>
                  )}
                </div>
                <div className="text-[12px] @[768px]:text-[13px] leading-snug" style={{ color: textColor }}>
                  {str(b.label)}
                </div>
                {!!b.description && (
                  <div
                    className="mt-1 text-[11px] leading-snug"
                    style={{ color: textColor, opacity: 0.75 }}
                  >
                    {str(b.description)}
                  </div>
                )}
              </div>
            )
          })}
          {blocks.length === 0 && (
            <p className="col-span-full text-center text-sm opacity-40" style={{ color: textColor }}>
              Add stat blocks in the sidebar
            </p>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default StatsSection
