'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ===========================================================================
 *  A TOOLTIP THAT IS NEVER CUT OFF
 * ===========================================================================
 * "The tooltip there is cut off": Settings' Support Email note was a CSS
 * hover box with `whitespace-nowrap` inside the card, so a sentence wider
 * than the room ran out of the page and was clipped at "customer receip".
 *
 * Every tooltip here is drawn on the body (a portal), kept 12px inside the
 * screen on every side (`collisionPadding`), and wraps at 280px, or the
 * screen less 24px on a phone, so the whole sentence is always there.
 */

/*
  ONE PROVIDER FOR A SCREEN FULL OF TOOLTIPS (round 44). Each tooltip came in
  a provider of its own, three components more for every one, and the
  website builder draws about forty on a section pick (its bars, the
  section's toolbar, the fields): about 540 component renders of a four
  section walk (scripts/check-editor-perf.mjs PART=smooth HOOKS=1). Inside a
  TooltipProvider a tooltip uses that one. Its own delay is still 0 unless it
  asks for another, as it was with a provider of its own.
*/
const SharedProvider = React.createContext(false)

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <SharedProvider.Provider value>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      />
    </SharedProvider.Provider>
  )
}

function Tooltip({
  delayDuration,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const shared = React.useContext(SharedProvider)
  if (shared) return <TooltipPrimitive.Root data-slot="tooltip" delayDuration={delayDuration ?? 0} {...props} />
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" delayDuration={delayDuration} {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

/** The room a tooltip keeps from every edge of the screen. */
export const TOOLTIP_EDGE = 12

function TooltipContent({
  className,
  sideOffset = 6,
  collisionPadding = TOOLTIP_EDGE,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions
        className={cn(
          'z-[200] w-max max-w-[min(280px,calc(100vw-24px))] whitespace-normal break-words rounded-lg bg-[#1a1a2e] px-3 py-2 text-left text-[12px] leading-[1.45] text-white shadow-[0_8px_24px_-6px_rgba(17,24,39,0.35)]',
          'origin-(--radix-tooltip-content-transform-origin) animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow width={10} height={5} className="fill-[#1a1a2e]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * A small (i) that explains the field beside it. On a computer it opens on
 * hover and focus like any tooltip; a touch screen has no hover, so a tap
 * opens it and a tap anywhere else closes it. The button is 24px and sits in
 * a 44px hit area on a phone.
 */
function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState(false)
  /* How the press began: Radix closes a tooltip on any press of its trigger, which is right for a mouse and leaves a finger nothing. */
  const press = React.useRef<{ touch: boolean; wasOpen: boolean } | null>(null)
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-info-tip=""
          onPointerDown={(e) => {
            press.current = { touch: e.pointerType === 'touch', wasOpen: open }
          }}
          onClick={(e) => {
            /* Handled here, so Radix does not close it again straight after. */
            e.preventDefault()
            const p = press.current
            press.current = null
            setOpen(p?.touch ? !p.wasOpen : true)
          }}
          className={cn(
            'relative inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full text-[#9ca3af] outline-none transition-colors hover:text-[#6b7280] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20',
            'before:absolute before:-inset-2.5 before:content-[""] sm:before:hidden',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, InfoTip }
