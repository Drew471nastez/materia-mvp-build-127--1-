"use client"

/**
 * ===========================================================================
 *  FREQUENT QUESTIONS
 * ===========================================================================
 * After the owner's reference: a two line title, the second line quiet, and
 * a way to ask on the right; then each question as its own soft card with a
 * plus that turns into a cross. The answer opens by its own height (a grid
 * row going from 0fr to 1fr), so it is never cut off and never pops, and it
 * fades in as it opens. Answers come from lib/billing/plans planQuestions,
 * which says what the code does.
 */
import { useId, useState } from "react"
import { ArrowUpRight, Plus } from "lucide-react"
import { planQuestions } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

function Item({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  const id = useId()
  return (
    <div
      data-faq-item=""
      data-open={open ? "" : undefined}
      className={cn(
        "rounded-2xl border transition-[background-color,border-color,box-shadow] duration-200",
        open ? "border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" : "border-[#eceef1] bg-[#f6f7f8] hover:bg-[#f2f3f5]",
      )}
    >
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left outline-none transition-transform duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:px-7 sm:py-6 [-webkit-tap-highlight-color:transparent]"
        >
          <span className="text-[15.5px] font-semibold leading-snug text-[#1a1a2e] sm:text-[18px]">{q}</span>
          <Plus
            aria-hidden
            strokeWidth={1.75}
            className={cn("h-5 w-5 shrink-0 text-[#4b5563] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:h-6 sm:w-6", open && "rotate-45")}
          />
        </button>
      </h3>
      <div
        id={id}
        role="region"
        className={cn("grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <p
            className={cn(
              "px-5 pb-4 text-[14.5px] leading-[1.6] text-[#4b5563] transition-opacity duration-300 sm:px-7 sm:pb-6 sm:text-[15px]",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  )
}

export function PlanFaq() {
  const questions = planQuestions()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section aria-labelledby="plan-faq-title" data-plan-faq="" className="mx-auto w-full max-w-[880px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="plan-faq-title" className="text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">
          {tt("Frequent questions")}
          <span className="block text-[#6b7280]">{tt("Find answers")}</span>
        </h2>
        {/* One line on a phone, two stacked under the title's right edge on a computer. */}
        <div className="flex flex-wrap items-baseline gap-x-2 sm:block sm:text-right">
          <p className="text-[14px] text-[#1a1a2e]">{tt("Any more questions?")}</p>
          <a
            href="mailto:support@storelib.com"
            className="inline-flex items-center gap-1 text-[14px] font-medium text-[#3b2bb8] underline-offset-4 hover:underline sm:mt-1"
          >
            {tt("Email support")}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
      <div className="mt-6 space-y-2.5 sm:mt-8 sm:space-y-3">
        {questions.map((item, i) => (
          <Item key={item.q} q={item.q} a={item.a} open={open === i} onToggle={() => setOpen((o) => (o === i ? null : i))} />
        ))}
      </div>
    </section>
  )
}
