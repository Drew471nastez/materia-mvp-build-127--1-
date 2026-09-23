"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A LABEL WITH A DOTTED UNDERLINE EXPLAINS ITSELF
 * ═══════════════════════════════════════════════════════════════════════════
 * The dotted underline is a promise that there is more to read. It was kept
 * with a `title` attribute: a grey system box that appears after a second,
 * never on a phone, and looks like no part of Storelib.
 *
 * This is the card that answers it: on a pointer it opens as the pointer
 * rests on the label and closes as it leaves (with a moment's grace, so the
 * pointer can travel into the card); on a touch screen a tap opens it and a
 * tap anywhere else closes it. It never takes focus from the page and never
 * scrolls anything.
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"

const OPEN_DELAY = 120
const CLOSE_DELAY = 90

export function HelpLabel({
  label,
  title,
  description,
  className,
  as: Tag = "span",
}: {
  label: React.ReactNode
  /** The card's heading. Defaults to the label. */
  title?: React.ReactNode
  description: React.ReactNode
  className?: string
  as?: "span" | "h2" | "h3"
}) {
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)
  const clear = () => window.clearTimeout(timer.current)
  const later = (next: boolean, ms: number) => {
    clear()
    timer.current = window.setTimeout(() => setOpen(next), ms)
  }
  React.useEffect(() => clear, [])

  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") later(true, OPEN_DELAY)
  }
  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") later(false, CLOSE_DELAY)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Tag
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
          onFocus={() => later(true, 0)}
          onBlur={() => later(false, 0)}
          onClick={(e) => {
            /* A mouse already opened it by resting; a click only keeps it. */
            if ((e.nativeEvent as PointerEvent).pointerType === "mouse") {
              e.preventDefault()
              clear()
              setOpen(true)
            }
          }}
          className={cn(
            "w-fit cursor-help select-none underline decoration-[#c4c7cf] decoration-dotted underline-offset-[4px] outline-none transition-[text-decoration-color] duration-150 hover:decoration-[#6b7280] focus-visible:decoration-[#1a1a2e]",
            className,
          )}
        >
          {label}
        </Tag>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={(e) => e.pointerType === "mouse" && clear()}
          onPointerLeave={(e) => e.pointerType === "mouse" && later(false, CLOSE_DELAY)}
          className="help-card z-[2147483640] w-max max-w-[280px] rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-left shadow-[0_12px_32px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)] outline-none"
        >
          <p className="text-[13px] font-semibold leading-5 text-[#1a1a2e]">{title ?? label}</p>
          <p className="mt-1 text-[12.5px] leading-[18px] text-[#4b5563]">{description}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
