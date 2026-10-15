"use client"

/**
 * ===========================================================================
 *  THE MARKS BESIDE A CREATOR'S NAME
 * ===========================================================================
 * The badges Storelib grants (lib/creators/badges.ts), drawn beside the name
 * on the creator page and on each of their product pages.
 *
 * WHAT IT SAYS, ON EVERY DEVICE. Hovering shows the badge's name on a
 * computer; a phone has no hover, so a tap shows it, and a tap anywhere
 * else, Escape, scrolling or three seconds put it away. Where the badge
 * sits inside a link (the product page's creator row is one), the tap is
 * the badge's and does not follow the link.
 *
 * The label is a small near-black pill in a portal, placed from the badge's
 * own position, so no clipping parent (a truncating name row, a bar with
 * overflow hidden) can cut it off. It rises on opacity and transform only.
 *
 * THE DRAWING. A shield in the name's own ink with two chevrons in it, the
 * mark a long service has always been counted in. A highlight across its
 * top and a hairline edge give it a little depth; nothing about it is blue,
 * because the blue check already means something else on this page.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { CREATOR_BADGES, type CreatorBadgeId } from "@/lib/creators/badges"
import { cn } from "@/lib/utils"
import { useSitePaint } from "@/lib/appearance/site-paint-context"

/** Near-black unless the page's type is light, then the reverse. */
function inkFor(color?: string): { shield: string; mark: string } {
  const hex = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return { shield: color || "#111113", mark: "#ffffff" }
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 150
  return light ? { shield: color!, mark: "#111113" } : { shield: color!, mark: "#ffffff" }
}

function VeteranMark({ ink, size }: { ink?: string; size: number }) {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const ink2 = inkFor(ink)
  /* Round 31: on Storelib's own product page the mark follows the person's look (lib/appearance/site-paint): the shield in the page's ink, the chevrons cut out of it in the page's ground. */
  const paint = useSitePaint()
  const shield = paint(ink2.shield, "ink")
  const mark = ink2.mark === "#ffffff" ? paint("#ffffff", "page") : paint(ink2.mark, "ink")
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`vt-sheen-${id}`} x1="10" y1="1.5" x2="10" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* The shield: flat across the top, drawn in to a soft point. */}
      <path
        d="M4.2 2.2h11.6c.99 0 1.8.8 1.8 1.8v5.35c0 3.5-2.64 6.45-6.9 8.33a1.8 1.8 0 01-1.4 0C5.04 15.8 2.4 12.85 2.4 9.35V4c0-1 .81-1.8 1.8-1.8z"
        style={{ fill: shield }}
      />
      <path
        d="M4.2 2.2h11.6c.99 0 1.8.8 1.8 1.8v5.35c0 3.5-2.64 6.45-6.9 8.33a1.8 1.8 0 01-1.4 0C5.04 15.8 2.4 12.85 2.4 9.35V4c0-1 .81-1.8 1.8-1.8z"
        fill={`url(#vt-sheen-${id})`}
        stroke="#000000"
        strokeOpacity="0.14"
        strokeWidth="0.6"
      />
      {/* Two chevrons, the upper one a shade quieter. */}
      <path d="M6.6 8.4L10 6.1l3.4 2.3" style={{ stroke: mark }} strokeOpacity="0.62" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6 11.8L10 9.5l3.4 2.3" style={{ stroke: mark }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Badge({ id, ink, size }: { id: CreatorBadgeId; ink?: string; size: number }) {
  const label = CREATOR_BADGES[id].label
  const ref = React.useRef<HTMLSpanElement>(null)
  const [open, setOpen] = React.useState(false)
  const [at, setAt] = React.useState<{ x: number; y: number } | null>(null)
  /* A touch opens on the tap; the hover that some phones fire after it must not undo that. */
  const touched = React.useRef(false)

  const place = React.useCallback(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setAt({ x: r.left + r.width / 2, y: r.top })
  }, [])

  const show = React.useCallback(() => {
    place()
    setOpen(true)
  }, [place])

  React.useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const timer = window.setTimeout(close, 3000)
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", close, { passive: true, capture: true })
    window.addEventListener("resize", close)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", close, { capture: true })
      window.removeEventListener("resize", close)
    }
  }, [open])

  return (
    <span
      ref={ref}
      role="img"
      aria-label={label}
      tabIndex={0}
      data-creator-badge={id}
      className="relative inline-flex shrink-0 cursor-default items-center justify-center rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-current/30 [-webkit-tap-highlight-color:transparent]"
      onPointerDown={(e) => {
        touched.current = e.pointerType !== "mouse"
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false)
      }}
      onFocus={() => {
        if (!touched.current) show()
      }}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        /* Inside a link, the badge's tap is the badge's. */
        e.preventDefault()
        e.stopPropagation()
        if (touched.current) {
          if (open) setOpen(false)
          else show()
        }
      }}
    >
      <VeteranMark ink={ink} size={size} />
      {open && at && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              data-creator-badge-label
              className="creator-badge-label pointer-events-none fixed z-[2147483500] whitespace-nowrap rounded-full bg-[#111113] px-2.5 py-1 text-[12px] font-medium leading-4 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.16),0_8px_20px_-8px_rgba(0,0,0,0.4)]"
              style={{ left: at.x, top: at.y - 8 }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

export function CreatorBadges({
  badges,
  ink,
  size = 18,
  className,
}: {
  badges?: CreatorBadgeId[] | null
  /** The colour of the name beside it, so the mark is in the same ink. */
  ink?: string
  size?: number
  className?: string
}) {
  if (!badges || badges.length === 0) return null
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 align-middle", className)}>
      {badges.map((id) => (
        <Badge key={id} id={id} ink={ink} size={size} />
      ))}
    </span>
  )
}
