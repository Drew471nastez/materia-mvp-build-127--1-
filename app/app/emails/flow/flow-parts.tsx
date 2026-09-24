"use client"

/**
 * The pieces a flow is drawn with, shared by the chooser (./new) and the
 * builder (./[id]): a step's mark, and a flow's shape in one line.
 *
 * A mark is the step's kind, not decoration: the trigger in the /app violet,
 * an email in ink, a wait in grey, a check in the attention yellow the
 * Orders badges use. Those four are the whole palette of a flow.
 */

import * as React from "react"
import { Clock3, Filter, Mail, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { waitText, type FlowStep } from "@/lib/automations/flow-model"

export type MarkKind = "trigger" | FlowStep["type"]

const MARK: Record<MarkKind, { box: string; Icon: typeof Mail }> = {
  trigger: { box: "bg-[#efe9fe] text-[#6d28d9] shadow-[inset_0_0_0_1px_rgba(139,92,246,0.22)]", Icon: Zap },
  email: { box: "bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(17,24,39,0.25)]", Icon: Mail },
  wait: { box: "bg-[#f1f2f4] text-[#4b5563] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)]", Icon: Clock3 },
  condition: { box: "bg-[#fff1c2] text-[#5c4300] shadow-[inset_0_0_0_1px_rgba(92,67,0,0.12)]", Icon: Filter },
}

export function StepMark({ kind, size = 32, className }: { kind: MarkKind; size?: 20 | 32; className?: string }) {
  const { box, Icon } = MARK[kind]
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", size === 32 ? "h-8 w-8 rounded-[9px]" : "h-5 w-5 rounded-[6px]", box, className)}
    >
      <Icon className={size === 32 ? "h-4 w-4" : "h-3 w-3"} strokeWidth={2.2} />
    </span>
  )
}

/**
 * A flow in one line: the trigger, then each step, joined by a hairline.
 * It wraps on a narrow card rather than scrolling, so every step is seen.
 */
export function FlowShape({ trigger, steps }: { trigger: string; steps: FlowStep[] }) {
  const items: Array<{ kind: MarkKind; text: string }> = [
    { kind: "trigger", text: trigger },
    ...steps.map((s) => ({ kind: s.type, text: s.type === "email" ? "Email" : s.type === "wait" ? waitText(s) : "Check" })),
  ]
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 sm:gap-x-0" aria-label="Steps">
      {items.map((it, i) => (
        <li key={i} className="flex items-center">
          {i > 0 ? <span aria-hidden className="mx-1 hidden h-px w-3 bg-[#d5d7dd] sm:block" /> : null}
          <span
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-lg pl-1 pr-2 text-[12px] font-medium",
              it.kind === "trigger" ? "bg-[#f7f4ff] text-[#5b21b6]" : "bg-white text-[#1a1a2e] shadow-[0_0_0_1px_#e8e9ed]",
            )}
          >
            <StepMark kind={it.kind} size={20} />
            {it.text}
          </span>
        </li>
      ))}
    </ol>
  )
}
