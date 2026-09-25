"use client"

/**
 * ===========================================================================
 *  A NEW AUTOMATION: WHERE TO START
 * ===========================================================================
 * One list, in the order a person meets a creator: joining the list, a
 * checkout left behind, then everything after an order. Each row is what the
 * automation is (a plain line drawing of what it is about, on a neutral
 * tile), its name, one line on what it does, and its steps in words:
 * "Email, wait 3 days, email". Nothing to decode, nothing in violet.
 *
 * Only automations the platform can actually start are offered
 * (lib/automations/templates.ts). A template you already made opens yours
 * instead of making a second one that would send alongside it. Start from
 * scratch asks what starts it, then opens an empty flow.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { TRIGGERS, TRIGGER_ORDER, audienceOf, normalizeSteps, stepsText, type TriggerType } from "@/lib/automations/flow-model"
import { BLANK_TEMPLATE, TEMPLATES, type FlowTemplate } from "@/lib/automations/templates"
import { PaneBar, StatusBadge, iconButton } from "../../../orders/order-parts"
import { ListIcon, TEMPLATE_ICON } from "../flow-parts"

/** Narrower than a list page: rows of words read better at this measure. */
const WIDTH = "max-w-[760px]"

const GROUPS: Array<{ title: string; triggers: TriggerType[] }> = [
  { title: "When someone joins your list", triggers: ["new_subscriber"] },
  { title: "When someone leaves checkout", triggers: ["abandoned_checkout"] },
  { title: "After an order", triggers: ["first_purchase", "purchase"] },
]

const row =
  "group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-100 hover:bg-[#fafbfb] active:bg-[#f4f4f6] focus-visible:bg-[#f4f4f6] focus-visible:outline-none disabled:cursor-wait sm:gap-3.5 sm:px-5"

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
      /* Replace, not push: Back from the new flow goes to the Emails page,
         not to this list again. */
      router.replace(`/app/emails/flow/${out.id}`)
    } catch (error) {
      setBusy(null)
      toast({ title: "Not created", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" })
    }
  }

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <PaneBar width={WIDTH} className="flex min-h-[60px] items-center gap-2 py-2">
        <button type="button" aria-label="Back to Emails" className={cn(iconButton, "-ml-1.5 h-9 w-9")} onClick={() => router.push("/app/emails?tab=flows")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">New automation</h1>
      </PaneBar>

      <div className={cn("mx-auto px-4 pb-24 sm:px-6 md:pb-10 lg:px-8", WIDTH)}>
        <p className="text-[14px] leading-5 text-[#6b7280]">Pick one to start from. You can change every step, and nothing is sent until you turn it on.</p>

        <div className="mt-5 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <ul aria-label="Starting points">
            {GROUPS.map((g, gi) => {
              const list = TEMPLATES.filter((t) => g.triggers.includes(t.trigger))
              return (
                <React.Fragment key={g.title}>
                  <li aria-hidden className={cn("flex h-9 items-center bg-[#fafbfb] px-4 text-[12px] font-medium text-[#6b7280] sm:px-5", gi > 0 && "border-t border-[#eef0f2]", "border-b border-[#eef0f2]")}>
                    {g.title}
                  </li>
                  {list.map((t, i) => (
                    <li key={t.id} className={cn(i > 0 && "border-t border-[#f1f2f4]")}>
                      <TemplateRow template={t} mine={Boolean(existing[t.id])} busy={busy === t.id} disabled={busy !== null} onPick={() => void start(t.id, { template: t.id })} />
                    </li>
                  ))}
                </React.Fragment>
              )
            })}
            <li aria-hidden className="flex h-9 items-center border-y border-[#eef0f2] bg-[#fafbfb] px-4 text-[12px] font-medium text-[#6b7280] sm:px-5">
              Or build your own
            </li>
            <li>
              <ResponsiveActionMenu
                title="What starts it?"
                align="end"
                menuWidth="w-72"
                items={TRIGGER_ORDER.map((trigger) => ({ label: TRIGGERS[trigger].sentence, onClick: () => void start(`blank:${trigger}`, { template: BLANK_TEMPLATE, trigger }) }))}
                trigger={
                  <button type="button" className={row} disabled={busy !== null} aria-label="Start from scratch">
                    <ListIcon icon={TEMPLATE_ICON.blank} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold leading-5 text-[#1a1a2e]">Start from scratch</span>
                      <span className="block text-[13px] leading-5 text-[#6b7280]">Choose what starts it, then add your own steps.</span>
                    </span>
                    <RowEnd busy={busy?.startsWith("blank:") ?? false} label="Start" />
                  </button>
                }
              />
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function RowEnd({ busy, label }: { busy: boolean; label: string }) {
  return (
    <span className="ml-1 flex min-h-10 shrink-0 items-center gap-1 self-center text-[13px] font-medium text-[#1a1a2e]">
      <span className="hidden sm:inline">{busy ? "Opening" : label}</span>
      <ChevronRight aria-hidden className="h-4 w-4 text-[#9ca3af] transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-[#4b5563]" />
    </span>
  )
}

function TemplateRow({ template, mine, busy, disabled, onPick }: { template: FlowTemplate; mine: boolean; busy: boolean; disabled: boolean; onPick: () => void }) {
  const steps = stepsText(normalizeSteps(template.steps))
  const forNews = audienceOf(template.trigger, { template: template.id, audience: template.audience }) === "subscribers"
  return (
    <button type="button" disabled={disabled} onClick={onPick} className={cn(row, disabled && !busy && "opacity-60")}>
      <ListIcon icon={TEMPLATE_ICON[template.id] ?? TEMPLATE_ICON.blank} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold leading-5 text-[#1a1a2e]">{template.name}</span>
          {mine ? <StatusBadge tone="neutral">You have this</StatusBadge> : null}
        </span>
        <span className="block text-[13px] leading-5 text-[#6b7280]">{template.purpose}</span>
        <span className="mt-1 block text-[12px] leading-4 text-[#6b7280]">
          <span className="text-[#4b5563]">{steps}</span>
          {forNews ? <span> · Only to people who asked for your news</span> : null}
        </span>
      </span>
      <RowEnd busy={busy} label={mine ? "Open yours" : "Use"} />
    </button>
  )
}
