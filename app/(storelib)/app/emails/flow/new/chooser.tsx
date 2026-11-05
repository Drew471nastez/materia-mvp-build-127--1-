"use client"

/**
 * ===========================================================================
 *  A NEW AUTOMATION: WHERE TO START
 * ===========================================================================
 * One list, in the order a person meets a creator: joining the list, a
 * checkout left behind, then everything after an order. Each row is what the
 * automation is (a drawing of what it is about, made for this page, on a
 * small white tile: ../flow-parts.tsx), its name, one line on what it does,
 * and its steps in words: "Email, wait 3 days, email". Nothing to decode,
 * nothing in violet.
 *
 * On a phone it is a page of its own over the whole screen, with its own bar
 * (../layout.tsx); from 768px a page in the shell, its header 24px under the
 * black bar, 1200px wide from lg, the product editor's frame.
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
import { StatusBadge } from "../../../orders/order-parts"
import { FlowTopBar, ListIcon, TEMPLATE_ICON, backButton } from "../flow-parts"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { backThen } from "@/lib/navigation/go-back"
import { leaveLayer } from "../../layer-nav"
import { refreshMatching } from "@/components/email/emails-cache"
import { tt } from "@/lib/i18n/text"

/** Where Back goes: the Emails page, on the tab this flow belongs to. */
const FLOWS_HREF = "/app/emails?tab=flows"

/**
 * The page's width: the 1200px every /app page uses from lg, the product
 * editor's (app/app/products/new/product-editor.tsx). Below lg a column of
 * 760px at most, the product editor's too.
 */
const WIDTH = "max-w-[760px] lg:max-w-[1200px]"

const GROUPS: Array<{ title: string; triggers: TriggerType[] }> = [
  { get title() { return tt("When someone joins your list") }, triggers: ["new_subscriber"] },
  { get title() { return tt("When someone leaves checkout") }, triggers: ["abandoned_checkout"] },
  { get title() { return tt("After an order") }, triggers: ["first_purchase", "purchase"] },
]

/**
 * A row: the drawing, the name and what it does, its steps, and where it
 * goes. On a phone and a tablet the steps are a line under the words; from
 * lg, where the page is 1200px wide, they are a column of their own, so a
 * row reads across the width like a line in an index rather than a short
 * paragraph with a long gap after it.
 */
const row =
  "group grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3.5 text-left transition-colors duration-100 hover:bg-[#fafbfb] active:bg-[#f4f4f6] focus-visible:bg-[#f4f4f6] focus-visible:outline-none disabled:cursor-wait sm:gap-x-3.5 sm:px-5 lg:grid-cols-[40px_minmax(0,1fr)_minmax(0,320px)_120px] lg:items-center lg:gap-x-5 lg:px-6 lg:py-4"

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
      if (!res.ok || !out.id) throw new Error(out.error || tt("Could not create it. Try again."))
      /* The Emails list has a new row to show when it is seen again. */
      refreshMatching("emails:flows")
      /* Replace, not push: Back from the new flow goes to the Emails page,
         not to this list again. */
      router.replace(`/app/emails/flow/${out.id}`)
    } catch (error) {
      setBusy(null)
      toast({ title: tt("Not created"), description: error instanceof Error ? error.message : tt("Try again."), variant: "destructive" })
    }
  }

  /*
    Back returns: the browser's own back when the page behind is Emails,
    instant and where it was scrolled. A back that does nothing (an entry the
    browser replaced, this page opened straight from a link) is followed by
    Emails itself within BACK_WATCH_MS, rather than leaving the layer up over
    a dimmed arrow (lib/navigation/go-back backThen).
  */
  const back = () =>
    leaveLayer(() => {
      if (canReturnTo("/app/emails")) backThen(() => router.replace(FLOWS_HREF))
      else router.push(FLOWS_HREF)
    })

  return (
    <div className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter">
      <FlowTopBar width={WIDTH} className="flex h-14 items-center gap-1.5 md:h-auto md:gap-2 md:pt-6">
        <button type="button" aria-label={tt("Back to Emails")} title={tt("Emails")} className={cn(backButton, "-ml-2.5 md:-ml-1.5")} onClick={back}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 truncate text-[17px] font-semibold leading-6 text-[#1a1a2e] md:text-[24px] md:font-bold md:leading-9 lg:text-[28px]">{tt("New automation")}</h1>
      </FlowTopBar>

      <div className={cn("mx-auto w-full app-gutter pb-[calc(24px+env(safe-area-inset-bottom))] pt-1 md:pb-10 md:pt-2", WIDTH)}>
        <p className="text-[14px] leading-5 text-[#6b7280]">{tt("Pick one to start from. You can change every step, and nothing is sent until you turn it on.")}</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-5">
          <ul aria-label={tt("Starting points")}>
            {GROUPS.map((g, gi) => {
              const list = TEMPLATES.filter((t) => g.triggers.includes(t.trigger))
              return (
                <React.Fragment key={g.title}>
                  <li aria-hidden className={cn(groupHead, gi > 0 && "border-t border-[#eef0f2]")}>
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
            <li aria-hidden className={cn(groupHead, "border-t border-[#eef0f2]")}>
              {tt("Or build your own")}
            </li>
            <li>
              <ResponsiveActionMenu
                title={tt("What starts it?")}
                align="end"
                menuWidth="w-72"
                items={TRIGGER_ORDER.map((trigger) => ({ label: TRIGGERS[trigger].sentence, onClick: () => void start(`blank:${trigger}`, { template: BLANK_TEMPLATE, trigger }) }))}
                trigger={
                  <button type="button" className={row} disabled={busy !== null} aria-label={tt("Start from scratch")}>
                    <ListIcon icon={TEMPLATE_ICON.blank} dashed />
                    <span className="min-w-0 self-center">
                      <span className="block text-[14px] font-semibold leading-5 text-[#1a1a2e]">{tt("Start from scratch")}</span>
                      <span className="block text-[13px] leading-5 text-[#6b7280]">{tt("Choose what starts it, then add your own steps.")}</span>
                    </span>
                    <span aria-hidden className="hidden lg:block" />
                    <RowEnd busy={busy?.startsWith("blank:") ?? false} label={tt("Start")} />
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

const groupHead = "flex h-9 items-center border-b border-[#eef0f2] bg-[#fafbfb] px-4 text-[12px] font-medium text-[#6b7280] sm:px-5 lg:px-6"

function RowEnd({ busy, label }: { busy: boolean; label: string }) {
  return (
    <span className="ml-1 flex min-h-10 shrink-0 items-center gap-1 self-center text-[13px] font-medium text-[#1a1a2e] lg:ml-0 lg:justify-end">
      <span className="hidden sm:inline">{busy ? tt("Opening") : label}</span>
      <ChevronRight aria-hidden className="h-4 w-4 text-[#9ca3af] transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-[#4b5563]" />
    </span>
  )
}

function TemplateRow({ template, mine, busy, disabled, onPick }: { template: FlowTemplate; mine: boolean; busy: boolean; disabled: boolean; onPick: () => void }) {
  const steps = stepsText(normalizeSteps(template.steps))
  const forNews = audienceOf(template.trigger, { template: template.id, audience: template.audience }) === "subscribers"
  return (
    <button type="button" disabled={disabled} onClick={onPick} className={cn(row, disabled && !busy && "opacity-60")}>
      <ListIcon icon={TEMPLATE_ICON[template.id] ?? TEMPLATE_ICON.blank} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold leading-5 text-[#1a1a2e]">{template.name}</span>
          {mine ? <StatusBadge tone="neutral">{tt("You have this")}</StatusBadge> : null}
        </span>
        <span className="block text-[13px] leading-5 text-[#6b7280]">{template.purpose}</span>
        <span className="mt-1 block text-[12px] leading-4 text-[#6b7280] lg:hidden">
          <span className="text-[#4b5563]">{steps}</span>
          {forNews ? <span> · {tt("Only to people who asked for your news")}</span> : null}
        </span>
      </span>
      {/* From lg, the steps in a column of their own. */}
      <span className="hidden min-w-0 text-[13px] leading-5 lg:block">
        <span className="block text-[#374151]">{steps}</span>
        {forNews ? <span className="block text-[12px] leading-4 text-[#6b7280]">{tt("Only to people who asked for your news")}</span> : null}
      </span>
      <RowEnd busy={busy} label={mine ? tt("Open yours") : tt("Use")} />
    </button>
  )
}
