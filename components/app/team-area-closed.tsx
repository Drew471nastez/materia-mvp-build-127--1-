import Link from "next/link"
import { ROLE_LABEL, type TeamArea } from "@/lib/team/roles"
import { tt } from "@/lib/i18n/text"

/**
 * A part of the store a team member's role does not have. Said, with the way
 * back, instead of the member's own account drawn in the store's place
 * (lib/team/server creatorFor "denied").
 */
const AREA_WORD: Partial<Record<TeamArea, string>> = {
  get orders() { return tt("Orders") },
  get customers() { return tt("Customers") },
  get products() { return tt("Products") },
  get emails() { return tt("Emails") },
  get analytics() { return tt("Analytics") },
  get website() { return tt("The website") },
  get content() { return tt("Content") },
  get payouts() { return tt("Payouts") },
  get billing() { return tt("Billing") },
  get team() { return tt("The team") },
  get store() { return tt("This part of the store") },
}

export function TeamAreaClosed({ area, store, role }: { area: TeamArea; store: string; role?: keyof typeof ROLE_LABEL }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-[440px] rounded-2xl border border-[#e5e7eb]/60 bg-white px-6 py-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-[17px] font-semibold text-[#1a1a2e]">{AREA_WORD[area] ?? tt("This")} {tt("is the owner's for now")}</p>
        <p className="mt-2 text-[14px] leading-[21px] text-[#6b7280]">
          {tt("You're working in {store}", { store })}{role ? tt(" as {role}", { role: ROLE_LABEL[role] }) : ""}{tt(". Team members work in Orders today; the rest of the store stays with its owner.")}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/app/orders" className="inline-flex items-center justify-center rounded-xl bg-[#1a1a2e] px-4 py-2.5 text-[14px] font-semibold text-white">
            {tt("Go to Orders")}
          </Link>
        </div>
      </div>
    </div>
  )
}
