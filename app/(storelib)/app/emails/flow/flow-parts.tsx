"use client"

/**
 * The pieces a flow is drawn with, shared by the chooser (./new) and the
 * builder (./[id]): a step's mark, the icon for what starts a flow, and the
 * bar at the top of both pages.
 *
 * A mark is the step's kind, not decoration. What starts a flow is a drawing
 * of the thing that happened (a person joining, a cart, a bag, a receipt) on
 * a neutral tile; an email is in ink, because it is the step that sends; a
 * wait is grey; a check is in the attention yellow the Orders badges use,
 * because it is where people can leave. No violet, no glow.
 */

import * as React from "react"
import { Clock3, Filter, Mail, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlowStep, TriggerType } from "@/lib/automations/flow-model"

/* ─── The drawings ────────────────────────────────────────────────────────
 *
 * Drawn for these pages rather than taken from an icon set: "the icons are
 * too basic". Each is on a 20px grid and shown at 20px, so a line lands on
 * the pixel instead of between two. One ink, a 1.5 line with round ends,
 * and one soft wash of the same ink (FILL) inside the shape that carries
 * the meaning, which is where the depth comes from. No second colour.
 *
 * A drawing takes the same two props a lucide icon does (className and
 * strokeWidth), so StepMark draws either.
 */
export type FlowIcon = (props: { className?: string; strokeWidth?: number }) => React.ReactElement

const FILL = { fill: "currentColor", fillOpacity: 0.12, stroke: "none" } as const

function drawing(name: string, body: React.ReactNode): FlowIcon {
  const Icon: FlowIcon = ({ className, strokeWidth = 1.5 }) => (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-flow-icon={name}
      className={className}
    >
      {body}
    </svg>
  )
  return Icon
}

/** Someone joins the list: a person, and the plus of being added. */
export const JoinIcon = drawing(
  "join",
  <>
    <path {...FILL} d="M2.75 16.25c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75z" />
    <circle {...FILL} cx="8" cy="6.5" r="3" />
    <circle cx="8" cy="6.5" r="3" />
    <path d="M2.75 16.25c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75" />
    <path d="M15.75 5.75v4.5M13.5 8h4.5" />
  </>,
)

/** A checkout left behind: the cart, its basket washed in. */
export const CartIcon = drawing(
  "cart",
  <>
    <path {...FILL} d="M5.1 6h11.15l-1.4 5.1a1 1 0 0 1-.96.73H7.3a1 1 0 0 1-.97-.76z" />
    <path d="M2.25 3.25h1.5c.46 0 .86.31.97.76L6.33 11.07a1 1 0 0 0 .97.76h6.59a1 1 0 0 0 .96-.73l1.4-5.1H5.1" />
    <circle cx="7.75" cy="15.5" r="1.25" />
    <circle cx="13.75" cy="15.5" r="1.25" />
  </>,
)

/** A first order: the bag, with a 1 on it. */
export const FirstBagIcon = drawing(
  "first-bag",
  <>
    <path {...FILL} d="M4.9 6.25h10.2l.6 9.5a1.4 1.4 0 0 1-1.4 1.5H5.7a1.4 1.4 0 0 1-1.4-1.5z" />
    <path d="M4.9 6.25h10.2l.6 9.5a1.4 1.4 0 0 1-1.4 1.5H5.7a1.4 1.4 0 0 1-1.4-1.5z" />
    <path d="M7.5 6.25V5.5a2.5 2.5 0 0 1 5 0v.75" />
    <path d="M9.1 10.25l1.15-.85v4.85" />
  </>,
)

/** Any order: the receipt it leaves. */
export const ReceiptIcon = drawing(
  "receipt",
  <>
    <path {...FILL} d="M5 2.75h10c.41 0 .75.34.75.75v13.75l-2.1-1.3-1.8 1.3-1.85-1.3-1.85 1.3-1.8-1.3-2.1 1.3V3.5c0-.41.34-.75.75-.75z" />
    <path d="M5 2.75h10c.41 0 .75.34.75.75v13.75l-2.1-1.3-1.8 1.3-1.85-1.3-1.85 1.3-1.8-1.3-2.1 1.3V3.5c0-.41.34-.75.75-.75z" />
    <path d="M7.5 6.75h5M7.5 9.75h5M7.5 12.75h2.5" />
  </>,
)

/** A thank you: a card with a heart on it, the heart solid. */
export const HeartCardIcon = drawing(
  "heart-card",
  <>
    <rect {...FILL} x="2.75" y="4.25" width="14.5" height="11.5" rx="2" />
    <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2" />
    <path
      fill="currentColor"
      strokeWidth="1"
      d="M10 13.05s-3.05-1.75-3.05-3.95a1.55 1.55 0 0 1 3.05-.55 1.55 1.55 0 0 1 3.05.55c0 2.2-3.05 3.95-3.05 3.95z"
    />
  </>,
)

/** How to use it: an open book. */
export const BookIcon = drawing(
  "book",
  <>
    <path {...FILL} d="M10 5.5C8.6 4.4 6.6 3.9 3.25 4v11c3.35-.1 5.35.4 6.75 1.5 1.4-1.1 3.4-1.6 6.75-1.5V4c-3.35-.1-5.35.4-6.75 1.5z" />
    <path d="M10 5.5C8.6 4.4 6.6 3.9 3.25 4v11c3.35-.1 5.35.4 6.75 1.5M10 5.5c1.4-1.1 3.4-1.6 6.75-1.5v11c-3.35-.1-5.35.4-6.75 1.5M10 5.5v11" />
  </>,
)

/** A week later: the calendar, ticked. */
export const CalendarTickIcon = drawing(
  "calendar-tick",
  <>
    <path {...FILL} d="M5.25 4.25h9.5a2 2 0 0 1 2 2V8H3.25V6.25a2 2 0 0 1 2-2z" />
    <rect x="3.25" y="4.25" width="13.5" height="12.5" rx="2" />
    <path d="M3.25 8h13.5M7 2.75v2.5M13 2.75v2.5" />
    <path d="M7.6 12.2l1.65 1.6 3.15-3.3" />
  </>,
)

/** A review: a star, said in a speech bubble. */
export const ReviewIcon = drawing(
  "review",
  <>
    <path {...FILL} d="M4.75 3.25h10.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-3.5 2.75v-2.75H4.75a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
    <path d="M4.75 3.25h10.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-3.5 2.75v-2.75H4.75a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
    <path fill="currentColor" strokeWidth="0.75" d="M10 5.4L10.85 7.53L13.14 7.68L11.38 9.15L11.94 11.37L10 10.15L8.06 11.37L8.62 9.15L6.86 7.68L9.15 7.53Z" />
  </>,
)

/** Bring buyers back: the way round, back to the start. */
export const ReturnIcon = drawing(
  "return",
  <>
    <circle {...FILL} cx="10" cy="10" r="6.25" />
    <path d="M3.75 10a6.25 6.25 0 1 0 1.83-4.42L3.75 7.4" />
    <path d="M3.75 3.9v3.5h3.5" />
    <circle fill="currentColor" stroke="none" cx="10" cy="10" r="1.6" />
  </>,
)

/** Your own: a plus. Its tile is dashed, an empty place to fill (ListIcon). */
export const PlusIcon = drawing("plus", <path d="M10 5v10M5 10h10" />)

/** What happened, drawn: a person joined, a cart was left, a first order, an order. */
export const TRIGGER_ICON: Record<TriggerType, FlowIcon> = {
  new_subscriber: JoinIcon,
  abandoned_checkout: CartIcon,
  first_purchase: FirstBagIcon,
  purchase: ReceiptIcon,
  membership_started: CalendarTickIcon,
}

/** Each starting point by what it is for, in the same hand. */
export const TEMPLATE_ICON: Record<string, FlowIcon> = {
  welcome: JoinIcon,
  checkout_reminder: CartIcon,
  first_order: FirstBagIcon,
  thank_you: HeartCardIcon,
  how_to_use: BookIcon,
  check_in: CalendarTickIcon,
  review_request: ReviewIcon,
  win_back: ReturnIcon,
  course_onboarding: BookIcon,
  membership_onboarding: CalendarTickIcon,
  blank: PlusIcon,
}

/* ─── A step's mark ─────────────────────────────────────────────────────── */

export type MarkKind = "trigger" | FlowStep["type"]

const MARK: Record<MarkKind, { box: string; Icon: LucideIcon | FlowIcon }> = {
  trigger: {
    box: "bg-white text-[#27272a] shadow-[inset_0_0_0_1px_#e3e4e8,inset_0_-1px_0_rgba(17,24,39,0.05),0_1px_2px_rgba(17,24,39,0.05)]",
    Icon: ReceiptIcon,
  },
  email: { box: "bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(17,24,39,0.25)]", Icon: Mail },
  wait: { box: "bg-[#f1f2f4] text-[#4b5563] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)]", Icon: Clock3 },
  condition: { box: "bg-[#fff1c2] text-[#5c4300] shadow-[inset_0_0_0_1px_rgba(92,67,0,0.12)]", Icon: Filter },
}

export function StepMark({ kind, trigger, size = 32, className }: { kind: MarkKind; trigger?: TriggerType; size?: 20 | 32; className?: string }) {
  const { box, Icon: base } = MARK[kind]
  const Icon = kind === "trigger" && trigger ? TRIGGER_ICON[trigger] : base
  const drawn = kind === "trigger"
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", size === 32 ? "h-8 w-8 rounded-[9px]" : "h-5 w-5 rounded-[6px]", box, className)}
    >
      <Icon className={size === 32 ? (drawn ? "h-[18px] w-[18px]" : "h-4 w-4") : "h-3 w-3"} strokeWidth={drawn ? 1.6 : 2.2} />
    </span>
  )
}

/**
 * A starting point's drawing on its tile, 40px, for a list row: white, with
 * a hairline, a shade inside its foot and a soft shadow under it, the depth
 * of the app's secondary buttons, so it reads as a small object rather than
 * a grey square. Start from scratch has a dashed tile and no shadow: a place
 * to fill, not a thing.
 */
export function ListIcon({ icon: Icon, dashed = false, className }: { icon: FlowIcon; dashed?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-list-icon=""
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[#27272a]",
        dashed
          ? "border border-dashed border-[#c7c9cf] bg-transparent text-[#4b5563]"
          : "bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.09),inset_0_-1.5px_0_rgba(17,24,39,0.05),0_1px_2px_rgba(17,24,39,0.06),0_3px_8px_-4px_rgba(17,24,39,0.10)]",
        className,
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={1.5} />
    </span>
  )
}

/* ─── The bar at the top of both pages ────────────────────────────────────
 *
 * The product editor's frame (app/app/products/new/product-editor.tsx):
 *
 *   ON A PHONE the pages are a layer of their own over the whole screen
 *   (../layout.tsx), and this is their bar: stuck to the top, starting under
 *   the status bar (env(safe-area-inset-top), 0 in a browser), with a
 *   hairline and a soft shadow once something has scrolled under it.
 *
 *   FROM 768px it is the page's header, in the page, 24px under the app's
 *   black bar, the way the product editor's header sits: not stuck, no
 *   shadow, on the page's own grey.
 *
 * The scroll is written straight onto the element (data-scrolled), so
 * scrolling never renders anything.
 */
export function FlowTopBar({ width, className, children }: { width: string; className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    const bar = ref.current
    const pane = bar?.closest<HTMLElement>(".orders-pane")
    if (!bar || !pane) return
    let under = false
    const read = () => {
      const now = pane.scrollTop > 0
      if (now === under) return
      under = now
      bar.dataset.scrolled = now ? "true" : "false"
    }
    read()
    pane.addEventListener("scroll", read, { passive: true })
    return () => pane.removeEventListener("scroll", read)
  }, [])
  return (
    <header
      ref={ref}
      data-flow-bar=""
      data-scrolled="false"
      className={cn(
        "sticky top-0 z-20 bg-[#f8f9fa] transition-shadow duration-150",
        "max-md:data-[scrolled=true]:shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]",
        "max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)]",
        "md:static md:bg-transparent",
      )}
    >
      <div className={cn("mx-auto w-full app-gutter", width, className)}>{children}</div>
    </header>
  )
}

/**
 * The app's back button, the one the product editor's header and an order's
 * bar use: an arrow on a quiet square that only shows when pressed or
 * hovered, no border. 40px on a phone, 36px from 768px.
 */
export const backButton =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] text-[#1a1a2e] transition-colors duration-100 hover:bg-[#eceef1] active:bg-[#e4e6ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:rounded-lg [-webkit-tap-highlight-color:transparent]"
