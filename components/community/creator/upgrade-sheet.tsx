"use client"

/**
 * ===========================================================================
 *  THE THIRD COMMUNITY ON FREE: THE UPGRADE SHEET
 * ===========================================================================
 * Free includes two communities (lib/communities/plan-limit.ts). New
 * community, and Duplicate settings, open this instead of a form that would
 * only be refused: a dialog on a computer, a sheet on a phone (./parts
 * Dialog), with what Pro is and costs from the one table that sells it
 * (lib/billing/plans offeredPlan), and the way to the plans page every
 * other Upgrade in /app goes to.
 */
import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PRO_CHECKOUT_PLAN_ID, offeredPlan } from "@/lib/billing/plans"
import { FREE_COMMUNITY_LIMIT } from "@/lib/communities/plan-limit"
import { Dialog, buttonPrimary, buttonSecondary } from "./parts"

export const UPGRADE_HREF = "/app/settings/billing/upgrade"

export function UpgradeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pro = offeredPlan(PRO_CHECKOUT_PLAN_ID)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Run more communities on Pro"
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Not now
          </button>
          <Link href={UPGRADE_HREF} onClick={onClose} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-upgrade-link="">
            Upgrade to {pro.name}
          </Link>
        </>
      }
    >
      <div data-upgrade-sheet="">
        <p className="text-[14px] leading-relaxed text-[#4b5563]">
          The Free plan includes {FREE_COMMUNITY_LIMIT} communities. On {pro.name} there is no limit, and every community you have keeps its members, posts and prices.
        </p>
        <div className="mt-4 rounded-xl border border-[#e5e7eb] px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-semibold text-[#1a1a2e]">{pro.name}</p>
            <p className="text-[14px] tabular-nums text-[#4b5563]">
              {pro.price}
              <span className="text-[#9ca3af]">{pro.period}</span>
            </p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {["Unlimited communities", ...pro.features.slice(0, 3)].map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13.5px] leading-snug text-[#4b5563]">
                <Check aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#1a1a2e]" strokeWidth={2.5} />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-[12.5px] text-[#9ca3af]">{pro.note}</p>
      </div>
    </Dialog>
  )
}
