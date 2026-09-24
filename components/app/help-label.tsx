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
 * rests on the label and closes as it leaves; on a touch screen a tap opens
 * it and a tap anywhere else closes it. It never takes focus from the page
 * and never scrolls anything.
 *
 * HOW IT ARRIVES AND LEAVES. In over 160ms, a fade and a 4px lift, and out
 * over 120ms on the same curve (app/globals.css .help-card). It used to have
 * no way out: it vanished the frame the pointer left, which is the "closing
 * more smoothly when I hover out". And the pointer has 160ms of grace to
 * cross the 8px between the label and the card, so travelling into the card
 * never closes it and opens it again.
 *
 * The same card, and the same timing, carries the note behind a change
 * figure on the Analytics tabs (HoverNote below), which was a `title` too.
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"

/** How long a pointer rests before the card opens: long enough that passing over a label does not. */
export const HOVER_OPEN_DELAY = 120
/** How long it has to get from the label to the card, or back, before the card closes. */
export const HOVER_CLOSE_DELAY = 160

const CARD =
  "help-card z-[2147483640] w-max max-w-[280px] rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-left shadow-[0_12px_32px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)] outline-none"

/** Open on a resting pointer, close with grace when it leaves, and forget any timer on the way out. */
function useHover() {
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)
  const clear = React.useCallback(() => window.clearTimeout(timer.current), [])
  const later = React.useCallback(
    (next: boolean, ms: number) => {
      clear()
      timer.current = window.setTimeout(() => setOpen(next), ms)
    },
    [clear],
  )
  React.useEffect(() => clear, [clear])
  const enter = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") later(true, HOVER_OPEN_DELAY)
  }
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") later(false, HOVER_CLOSE_DELAY)
  }
  /* Over the card itself: stay open; leaving it starts the same grace. */
  const cardEvents = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") clear()
    },
    onPointerLeave: leave,
  }
  return { open, setOpen, clear, later, enter, leave, cardEvents }
}

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
  const { open, setOpen, clear, later, enter, leave, cardEvents } = useHover()

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Tag
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onPointerEnter={enter}
          onPointerLeave={leave}
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
          {...cardEvents}
          className={CARD}
        >
          <p className="text-[13px] font-semibold leading-5 text-[#1a1a2e]">{title ?? label}</p>
          <p className="mt-1 text-[12.5px] leading-[18px] text-[#4b5563]">{description}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * A NOTE BEHIND A FIGURE, for a pointer. The change beside each Analytics
 * figure said what it was compared with in a `title`, the grey system box
 * that appears a second late and blinks away. This is the same card as the
 * label's, arriving and leaving the same way. It is not a button, because it
 * sits inside one (the tab), so it opens on hover only; the figure itself
 * says the same in the words the tab is read with.
 */
export function HoverNote({ children, note, className }: { children: React.ReactNode; note: React.ReactNode; className?: string }) {
  const { open, setOpen, enter, leave, cardEvents } = useHover()
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <span className={className} onPointerEnter={enter} onPointerLeave={leave} data-hover-note>
          {children}
        </span>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          {...cardEvents}
          className={cn(CARD, "px-3 py-2")}
        >
          <p className="text-[12.5px] leading-[18px] text-[#4b5563]">{note}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
