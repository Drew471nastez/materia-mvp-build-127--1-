import Link from "next/link"
import { PERMISSION_LABEL, homeArea, homeFor, type TeamArea, type TeamPermission } from "@/lib/team/permissions"
import { tt } from "@/lib/i18n/text"

/**
 * A part of the store a team member was not given. Said, with the way to
 * what they can use, instead of the page (components/app/team-bar), and
 * drawn by a page itself when the server refuses it (lib/team/server
 * teamPageStore "denied"), so the store's data never reaches the browser.
 */
export function TeamAreaClosed({ area, store, home, permissions }: { area: TeamArea; store: string; home?: string; permissions?: readonly TeamPermission[] }) {
  const name = area === "store" ? tt("This page") : PERMISSION_LABEL[area]
  const perms = permissions ?? []
  const to = home ?? homeFor(perms)
  const first = permissions ? homeArea(perms) : null
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12" data-team-closed={area}>
      <div className="w-full max-w-[440px] rounded-2xl border border-[#e5e7eb]/60 bg-white px-6 py-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-[17px] font-semibold text-[#1a1a2e]">{area === "store" ? tt("You don't have access to this page") : tt("You don't have access to {area}", { area: name })}</p>
        <p className="mt-2 text-[14px] leading-[21px] text-[#6b7280]">
          {area === "store" ? tt("It stays with the owner of {store}.", { store }) : tt("Ask the owner of {store} if you need it.", { store })}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={to} className="inline-flex items-center justify-center rounded-xl bg-[#1a1a2e] px-4 py-2.5 text-[14px] font-semibold text-white">
            {first ? tt("Go to {area}", { area: PERMISSION_LABEL[first] }) : to.startsWith("/app/settings") ? tt("Go to Settings") : tt("Go back")}
          </Link>
        </div>
      </div>
    </div>
  )
}
