"use client"

/**
 * ===========================================================================
 *  COMPARE PLANS
 * ===========================================================================
 * The comparison under the cards on the upgrade page: the plan names across
 * the top, then groups of rows, the feature on the left and each plan's
 * answer centred under its name. A number or a word where the answer is
 * one; a check in a green disc or a cross in a grey one where it is yes or
 * no. Pro's column is tinted all the way down, so the eye reads down it.
 *
 * WHAT IT DOES NOW:
 *
 *   EACH GROUP FOLDS. Its title is a button; the rows under it open and
 *   close by their own height (a grid row going from 0fr to 1fr, as the
 *   questions under it do), so nothing is cut off and nothing pops. Every
 *   group starts open, and one control opens or folds them all.
 *
 *   THE PLAN NAMES STAY. The row with Free and Pro sticks under the page's
 *   bar while the comparison scrolls past, so a row far down still says
 *   which column is which. The box clips rather than hides its overflow,
 *   which is what lets a row inside it stick to the page's scroller.
 *
 *   ON A PHONE the two answer columns are narrow and fixed and the feature
 *   takes the rest, in type that stays readable at 390px.
 *
 * Every row comes from lib/billing/plans planComparison, which reads the
 * fee, site and storage tables, so nothing here can claim what a plan does
 * not do.
 */
import { useId, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { formatPlanPrice, planComparison, planDisplayName, PRO_CHECKOUT_PLAN_ID, PRO_PRICE_CENTS, type ComparisonValue } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"
/* The feature, then Free, then Pro: one set of columns for the header, the group titles and the rows. */
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_76px_84px] sm:grid-cols-[minmax(0,1fr)_152px_152px]"
const PRO_TINT = "bg-[#f6f5ff]"

function Answer({ value }: { value: ComparisonValue }) {
  if (typeof value === "string") {
    return <span className="text-[13px] font-medium tabular-nums text-[#374151] sm:text-[14px]">{value}</span>
  }
  return value ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#e3f5e9]" role="img" aria-label={tt("Included")}>
      <Check className="h-3.5 w-3.5 text-[#15803d]" strokeWidth={3} aria-hidden />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f2f4]" role="img" aria-label={tt("Not included")}>
      <X className="h-3.5 w-3.5 text-[#9ca3af]" strokeWidth={3} aria-hidden />
    </span>
  )
}

function Group({
  title,
  rows,
  open,
  onToggle,
}: {
  title: string
  rows: { label: string; free: ComparisonValue; pro: ComparisonValue }[]
  open: boolean
  onToggle: () => void
}) {
  const id = useId()
  return (
    <div data-compare-group={title} data-open={open ? "" : undefined} className="border-t border-[#eef0f2] [[data-compare-head]+&]:border-t-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className={cn(COLUMNS, "w-full cursor-pointer items-stretch text-left outline-none transition-colors duration-150 hover:bg-[#fafafb] focus-visible:bg-[#f6f7f8] [-webkit-tap-highlight-color:transparent]")}
        >
          <span className="flex min-w-0 items-center gap-2.5 px-4 py-4 sm:px-6 sm:py-5">
            <ChevronDown
              aria-hidden
              strokeWidth={2}
              className={cn("h-[18px] w-[18px] shrink-0 text-[#6b7280] transition-transform duration-300", EASE, !open && "-rotate-90")}
            />
            <span className="truncate text-[16px] font-semibold text-[#1a1a2e] sm:text-[18px]">{title}</span>
            <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-[#6b7280]">{rows.length}</span>
          </span>
          <span aria-hidden />
          <span aria-hidden className={PRO_TINT} />
        </button>
      </h3>
      <div id={id} role="region" aria-label={title} className={cn("grid transition-[grid-template-rows] duration-300", EASE, open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden" inert={!open || undefined}>
          <ul className={cn("transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}>
            {rows.map((row) => (
              <li key={row.label} data-compare-row={row.label} className={cn(COLUMNS, "group/row min-h-[54px] sm:min-h-[58px]")}>
                <span className="flex items-center border-t border-[#f0f1f3] px-4 py-3 text-[13.5px] leading-[1.35] text-[#1a1a2e] transition-colors duration-150 group-hover/row:bg-[#fafafb] sm:px-6 sm:text-[14.5px]">
                  {row.label}
                </span>
                <span className="flex items-center justify-center border-t border-[#f0f1f3] px-1.5 text-center transition-colors duration-150 group-hover/row:bg-[#fafafb]">
                  <span className="sr-only">{planDisplayName("free")}: </span>
                  <Answer value={row.free} />
                </span>
                <span className={cn("flex items-center justify-center border-t border-[#ebe8ff] px-1.5 text-center transition-colors duration-150 group-hover/row:bg-[#f0eeff]", PRO_TINT)}>
                  <span className="sr-only">{planDisplayName(PRO_CHECKOUT_PLAN_ID)}: </span>
                  <Answer value={row.pro} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function ComparePlans() {
  const sections = planComparison()
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((s) => [s.title, true])))
  const allOpen = sections.every((s) => open[s.title])
  const setAll = (value: boolean) => setOpen(Object.fromEntries(sections.map((s) => [s.title, value])))

  return (
    <section aria-labelledby="compare-plans-title" data-compare-plans="" className="mx-auto w-full max-w-[880px]">
      <div className="flex items-end justify-between gap-4">
        <h2 id="compare-plans-title" className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">
          {tt("Compare plans")}
        </h2>
        <button
          type="button"
          onClick={() => setAll(!allOpen)}
          data-compare-all=""
          className="mb-1 inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-colors duration-150 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:mb-2 [-webkit-tap-highlight-color:transparent]"
        >
          {allOpen ? tt("Collapse all") : tt("Expand all")}
        </button>
      </div>

      <div data-compare-box="" className="mt-6 overflow-clip rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mt-8">
        {/* The plan names, held under the page's bar while the rows scroll past. */}
        <div data-compare-head="" className={cn(COLUMNS, "sticky top-14 z-10 border-b border-[#eef0f2] bg-white sm:top-16")}>
          <span className="flex items-center px-4 text-[12.5px] font-medium text-[#6b7280] sm:px-6 sm:text-[13px]">{tt("Features")}</span>
          <span className="flex flex-col items-center justify-center py-3.5 text-center sm:py-4">
            <span className="text-[14px] font-semibold text-[#1a1a2e] sm:text-[16px]">{planDisplayName("free")}</span>
            <span className="text-[11.5px] text-[#6b7280] sm:text-[12px]">{formatPlanPrice(0)}</span>
          </span>
          <span className={cn("flex flex-col items-center justify-center py-3.5 text-center sm:py-4", PRO_TINT)}>
            <span className="text-[14px] font-semibold text-[#3b2bb8] sm:text-[16px]">{planDisplayName(PRO_CHECKOUT_PLAN_ID)}</span>
            <span className="text-[11.5px] text-[#5f6570] sm:text-[12px]">
              {formatPlanPrice(PRO_PRICE_CENTS)}
              <span className="hidden sm:inline"> {tt("a month")}</span>
              <span className="sm:hidden">{tt("/mo")}</span>
            </span>
          </span>
        </div>

        {sections.map((section) => (
          <Group
            key={section.title}
            title={section.title}
            rows={section.rows}
            open={!!open[section.title]}
            onToggle={() => setOpen((o) => ({ ...o, [section.title]: !o[section.title] }))}
          />
        ))}

        <div aria-hidden className={COLUMNS}>
          <span className="h-3" />
          <span />
          <span className={PRO_TINT} />
        </div>
      </div>
    </section>
  )
}
