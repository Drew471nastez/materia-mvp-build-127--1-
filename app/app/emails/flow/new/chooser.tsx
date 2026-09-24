"use client"

/**
 * ===========================================================================
 *  A NEW AUTOMATION: WHERE TO START
 * ===========================================================================
 * This was a dialog with two rows, an icon and a sentence each, that made a
 * flow and dropped you into a form. It said nothing about what you would get.
 *
 * Now it is a page of starting points, each drawn as what it is: the trigger
 * and every step in order, the way the builder will show it, so the choice
 * is made by looking rather than by reading. Only automations the platform
 * can actually start are offered (lib/automations/templates.ts). A template
 * you already made opens yours instead of making a second one that would
 * send alongside it.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { TRIGGERS, entryText, stepSummary, type TriggerType } from "@/lib/automations/flow-model"
import { BLANK_TEMPLATE, TEMPLATES, type FlowTemplate } from "@/lib/automations/templates"
import { GUTTER, LIST_WIDTH, PaneBar, StatusBadge, iconButton } from "../../../orders/order-parts"
import { FlowShape, StepMark } from "../flow-parts"

const lift =
  "transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-[#d5d7dd] hover:shadow-[0_1px_0_rgba(17,24,39,0.03),0_14px_30px_-14px_rgba(17,24,39,0.24)] active:translate-y-0 active:shadow-[0_1px_0_rgba(17,24,39,0.03),0_2px_6px_-2px_rgba(17,24,39,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]"

export function FlowChooser({ existing }: { existing: Record<string, string> }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)

  const start = async (key: string, body: { template: string; trigger?: TriggerType }) => {
    const mine = existing[body.template]
    if (mine) {
      router.push(`/app/emails/flow/${mine}`)
      return
    }
    setBusy(key)
    try {
      const res = await fetch("/api/automations/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.id) throw new Error(out.error || "Could not create it. Try again.")
      router.push(`/app/emails/flow/${out.id}`)
    } catch (error) {
      setBusy(null)
      toast({ title: "Not created", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" })
    }
  }

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <PaneBar width={LIST_WIDTH} className="flex min-h-[60px] items-center gap-2 py-2">
        <button type="button" aria-label="Back to Emails" className={cn(iconButton, "-ml-1.5")} onClick={() => router.push("/app/emails?tab=flows")}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">New automation</h1>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-10", LIST_WIDTH, GUTTER)}>
        <p className="max-w-[560px] text-[14px] text-[#6b7280]">Pick a starting point. You can change every step, and nothing is sent until you turn it on.</p>

        <ul className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Starting points">
          {TEMPLATES.map((t) => (
            <li key={t.id} className="flex">
              <TemplateCard template={t} mine={Boolean(existing[t.id])} busy={busy === t.id} disabled={busy !== null} onPick={() => void start(t.id, { template: t.id })} />
            </li>
          ))}
        </ul>

        <section aria-labelledby="scratch" className="mt-9">
          <h2 id="scratch" className="text-[15px] font-semibold text-[#1a1a2e]">Start from scratch</h2>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">One empty email, and you add the rest.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(Object.keys(TRIGGERS) as TriggerType[]).map((trigger) => (
              <button
                key={trigger}
                type="button"
                disabled={busy !== null}
                onClick={() => void start(`blank:${trigger}`, { template: BLANK_TEMPLATE, trigger })}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl border border-[#e5e7eb]/80 bg-white px-4 py-3 text-left shadow-[0_1px_0_rgba(17,24,39,0.03),0_1px_3px_rgba(17,24,39,0.06)] disabled:cursor-wait disabled:opacity-70",
                  lift,
                )}
              >
                <StepMark kind="trigger" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-[#6d28d9]">Starts when</span>
                  <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{TRIGGERS[trigger].sentence}</span>
                </span>
                <span className="text-[13px] font-medium text-[#4b5563] group-hover:text-[#1a1a2e]">{busy === `blank:${trigger}` ? "Setting up" : "Start"}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function TemplateCard({ template, mine, busy, disabled, onPick }: { template: FlowTemplate; mine: boolean; busy: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "group flex w-full flex-col rounded-2xl border border-[#e5e7eb]/80 bg-white text-left shadow-[0_1px_0_rgba(17,24,39,0.03),0_1px_3px_rgba(17,24,39,0.06)] disabled:cursor-wait",
        lift,
        disabled && !busy && "opacity-70",
      )}
    >
      <span className="block px-4 pt-4">
        <span className="flex items-start justify-between gap-3">
          <span className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{template.name}</span>
          {mine ? <StatusBadge tone="neutral" className="mt-0.5 shrink-0">You have this</StatusBadge> : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-5 text-[#6b7280]">{template.purpose}</span>
      </span>
      <span className="mx-4 mt-3.5 block rounded-xl bg-[#f6f6f8] px-3 py-3 shadow-[inset_0_1px_2px_rgba(17,24,39,0.06)]">
        <FlowShape trigger={TRIGGERS[template.trigger].name} steps={template.steps} />
      </span>
      <span className="mt-auto flex items-center justify-between gap-3 px-4 pb-3.5 pt-3 text-[13px]">
        <span className="min-w-0 truncate text-[#6b7280]">
          {stepSummary(template.steps)} · {entryText(template.trigger, template.entry)}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[#1a1a2e]">
          {busy ? "Setting up" : mine ? "Open yours" : "Use this"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  )
}
