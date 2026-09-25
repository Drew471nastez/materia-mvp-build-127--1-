"use client"

/**
 * The pieces a flow is drawn with, shared by the chooser (./new) and the
 * builder (./[id]): a step's mark, and the icon for what starts a flow.
 *
 * A mark is the step's kind, not decoration. What starts a flow is a plain
 * line drawing of the thing that happened (a person joining, a cart, a bag,
 * a receipt) on a neutral tile; an email is in ink, because it is the step
 * that sends; a wait is grey; a check is in the attention yellow the Orders
 * badges use, because it is where people can leave. No violet, no glow.
 */

import * as React from "react"
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  Clock3,
  Filter,
  Mail,
  Plus,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Star,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlowStep, TriggerType } from "@/lib/automations/flow-model"

export type MarkKind = "trigger" | FlowStep["type"]

/** What happened, drawn: a person joined, a cart was left, a bag was bought, an order was placed. */
export const TRIGGER_ICON: Record<TriggerType, LucideIcon> = {
  new_subscriber: UserRoundPlus,
  abandoned_checkout: ShoppingCart,
  first_purchase: ShoppingBag,
  purchase: ReceiptText,
}

/** Each starting point by what it is for, in the same line style. */
export const TEMPLATE_ICON: Record<string, LucideIcon> = {
  welcome: UserRoundPlus,
  checkout_reminder: ShoppingCart,
  first_order: ShoppingBag,
  thank_you: ReceiptText,
  how_to_use: BookOpen,
  check_in: CalendarCheck,
  review_request: Star,
  win_back: CalendarClock,
  blank: Plus,
}

const MARK: Record<MarkKind, { box: string; Icon: LucideIcon }> = {
  trigger: { box: "bg-white text-[#374151] shadow-[inset_0_0_0_1px_#e3e4e8]", Icon: ReceiptText },
  email: { box: "bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(17,24,39,0.25)]", Icon: Mail },
  wait: { box: "bg-[#f1f2f4] text-[#4b5563] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)]", Icon: Clock3 },
  condition: { box: "bg-[#fff1c2] text-[#5c4300] shadow-[inset_0_0_0_1px_rgba(92,67,0,0.12)]", Icon: Filter },
}

export function StepMark({ kind, trigger, size = 32, className }: { kind: MarkKind; trigger?: TriggerType; size?: 20 | 32; className?: string }) {
  const { box, Icon: base } = MARK[kind]
  const Icon = kind === "trigger" && trigger ? TRIGGER_ICON[trigger] : base
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", size === 32 ? "h-8 w-8 rounded-[9px]" : "h-5 w-5 rounded-[6px]", box, className)}
    >
      <Icon className={size === 32 ? "h-4 w-4" : "h-3 w-3"} strokeWidth={kind === "trigger" ? 1.9 : 2.2} />
    </span>
  )
}

/** A template's or a trigger's icon on its neutral tile, 36px, for a list row. */
export function ListIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f4f4f6] text-[#3f3f46] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.07)]", className)}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  )
}
