"use client"

/**
 * ===========================================================================
 *  GIVE THIS ONEPAGE TO THE PERSON IT IS FOR (round AR)
 * ===========================================================================
 * The owner, as Storelib's admin: "when I'm creating OnePages for creators,
 * how can I share them to their own so they have it".
 *
 * Round AK built the handover (lib/handoff): a page made in a business
 * added from the account menu is handed over with that business, through a
 * single use claim link that expires, kept only as its SHA-256, optionally
 * bound to the creator's email. The creator accepts it signed in to their
 * own login, and the business (its OnePage, at the same address) moves to
 * them in one transaction. The founder's payout accounts, plan, card and
 * other businesses never go with it; the creator connects their own payout
 * account.
 *
 * It lived only in Settings › Team. This is the way to it from the
 * OnePage editor: one row in Settings › Basic info, drawn only when the
 * server says this business can be handed over (GET /api/handoff
 * eligible), which is only for the business itself, signed in, and never
 * for a login's first business. Starting, sending and revoking stay in the
 * Team panel, where the server checks who is asking.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { useOnePageTeam } from "@/lib/onepage/team-context"

export const HANDOFF_SETTINGS_HREF = "/app/settings?tab=team"

/** Whether to draw the row, from GET /api/handoff's answer. Pure, for the tests. */
export function showsHandoffRow(answer: unknown): boolean {
  const a = answer as { ready?: unknown; eligible?: unknown } | null
  return !!a && a.ready === true && a.eligible === true
}

export function OnePageHandoffRow() {
  /* A team member edits somebody else's page: handing it over is never theirs to start. */
  const team = useOnePageTeam()
  const [shown, setShown] = useState(false)
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (team) return
    let live = true
    fetch("/api/handoff", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (!live) return
        setShown(showsHandoffRow(body))
        const pending = (body as { pending?: unknown } | null)?.pending
        setWaiting(!!pending)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [team])
  if (team || !shown) return null
  return (
    <Link
      href={HANDOFF_SETTINGS_HREF}
      data-onepage-handoff=""
      className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-left transition-colors duration-150 hover:bg-[#f7f7f8] active:bg-[#f1f2f4]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{tt("Give this page to its owner")}</span>
        <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">
          {waiting ? tt("A link is waiting for them. See it in Team.") : tt("Send them a link. When they accept, the page and this business are theirs.")}
        </span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
    </Link>
  )
}
