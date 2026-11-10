"use client"

import Link from "next/link"
import { Package, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY } from "@/components/physical/ui"
import { FAMILY_EMPTY } from "@/lib/emails/family-use"
import type { EmailFamily } from "@/lib/emails/customer-list"
import { tt } from "@/lib/i18n/text"

/**
 * A FAMILY THE STORE DOES NOT USE (wave 9): what it would send and how to start, in the list's own card
 * instead of rows that never go out. In All it is one quiet row under the family's name (icon, why, the
 * action at the end, stacked on a phone); alone, the house empty state, centred. Physical products can be
 * previewed anyway: their emails are drawn with sample orders. A community's need a community to draw.
 */
export function FamilyNotUsed({ family, bare, compact, onPreview }: { family: Exclude<EmailFamily, "digital">; bare: boolean; compact: boolean; onPreview?: () => void }) {
  const copy = FAMILY_EMPTY[family]
  const Icon = family === "physical" ? Package : Users
  const icon = (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#f1f2f4] text-[#4b5563]", compact ? "h-10 w-10" : "h-12 w-12")}>
      <Icon className={compact ? "h-[18px] w-[18px]" : "h-5 w-5"} strokeWidth={1.75} />
    </span>
  )
  const preview = onPreview ? (
    <button type="button" onClick={onPreview} className="inline-flex min-h-11 items-center whitespace-nowrap text-[13px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline sm:min-h-9" data-family-peek={family}>
      {tt("Preview the emails anyway")}
    </button>
  ) : null
  const action = (
    <Link href={copy.href} className={cn(BTN_PRIMARY, "inline-flex h-11 items-center justify-center sm:h-10")} data-family-start={family}>
      {copy.action}
    </Link>
  )
  if (compact)
    return (
      <div className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4", bare ? "mt-1.5 border-t border-[#f1f2f4] px-4 sm:px-5" : "mt-3 rounded-xl border border-[#eceef1] px-4")} data-family-empty={family}>
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          {icon}
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{copy.title}</p>
            <p className="mt-0.5 text-[13px] leading-[19px] text-[#6b7280]">
              {copy.body}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 pl-[52px] sm:flex-row-reverse sm:items-center sm:gap-4 sm:pl-0">
          {action}
          {preview}
        </div>
      </div>
    )
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center sm:py-14", !bare && "mt-3 rounded-xl border border-[#eceef1]")} data-family-empty={family}>
      {icon}
      <p className="mt-4 text-[15px] font-semibold text-[#1a1a2e]">{copy.title}</p>
      <p className="mt-1 max-w-[420px] text-[14px] leading-[21px] text-[#6b7280]">{copy.body}</p>
      <div className="mt-5 flex flex-col items-center gap-1 sm:flex-row-reverse sm:gap-4">
        {action}
        {preview}
      </div>
    </div>
  )
}
