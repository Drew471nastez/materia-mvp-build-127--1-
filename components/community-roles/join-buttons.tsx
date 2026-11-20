"use client"

/**
 * ===========================================================================
 *  JOIN THE DISCORD, JOIN THE TELEGRAM GROUP: THE BUYER'S BUTTONS
 * ===========================================================================
 * Shown on the receipt, in the library and on a membership's page, for the
 * products there that come with a Discord role or a Telegram chat
 * (lib/community-roles, GET /api/community-roles/options). Nothing is drawn
 * when none do, when the buyer has no access, or when Storelib's bots are
 * not switched on. A press goes to the server route, which checks the
 * purchase again before anything is given.
 *
 * Back from a join that did not work, the address carries ?discord= or
 * ?telegram= with the words to show, read once here.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { JoinOption } from "@/lib/community-roles/view-types"

function label(o: JoinOption): string {
  if (o.state === "sign_in") return o.provider === "discord" ? tt("Sign in to join the Discord") : tt("Sign in to join the Telegram group")
  if (o.state === "joined") return o.provider === "discord" ? tt("Open Discord") : tt("Open Telegram")
  return o.provider === "discord" ? tt("Join the Discord") : tt("Join the Telegram group")
}

function returnNote(): string | null {
  try {
    const url = new URL(window.location.href)
    for (const p of ["discord", "telegram"] as const) {
      const word = url.searchParams.get(p)
      if (!word || word === "connected") continue
      const message = url.searchParams.get(`${p}_message`)
      url.searchParams.delete(p)
      url.searchParams.delete(`${p}_message`)
      window.history.replaceState(window.history.state, "", url.toString())
      if (word === "no_access") return tt("This account does not have access to it. Sign in with the account you bought it with.")
      if (word === "declined") return tt("Nothing was changed. Press Join again when you are ready.")
      if (word === "expired") return tt("That took too long. Press Join again.")
      if (word === "not_available") return tt("Not available yet")
      return message || tt("That did not work. Try again in a moment.")
    }
  } catch {
    /* nothing to read */
  }
  return null
}

export function CommunityJoinButtons({ productIds, back, className, tone = "app" }: { productIds?: (string | null | undefined)[]; back?: string; className?: string; tone?: "app" | "receipt" }) {
  const [options, setOptions] = React.useState<JoinOption[] | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const ids = (productIds ?? []).filter((x): x is string => !!x)
  const key = productIds ? ids.join(",") : "*"

  React.useEffect(() => {
    setNote(returnNote())
    if (productIds && !key) return setOptions([])
    let live = true
    const q = productIds ? `?products=${encodeURIComponent(key)}` : ""
    fetch(`/api/community-roles/options${q}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((d: { options?: JoinOption[] }) => live && setOptions(Array.isArray(d.options) ? d.options : []))
      .catch(() => live && setOptions([]))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!options || options.length === 0) return note ? <p role="status" className={cn("rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13.5px] text-[#92400e]", className)}>{note}</p> : null
  const withBack = (o: JoinOption) => (o.state === "joined" && o.provider === "discord") || !back ? o.href : `${o.href}${o.href.includes("?") ? "&" : "?"}back=${encodeURIComponent(back)}`
  return (
    <div className={cn("space-y-2 print:hidden", className)} data-community-join="">
      {note ? <p role="status" className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13.5px] text-[#92400e]">{note}</p> : null}
      {options.map((o) => (
        <div
          key={`${o.provider}:${o.productId}:${o.name}`}
          className={cn("flex flex-col gap-3 rounded-2xl border bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between", tone === "receipt" ? "border-[#e4e7ec]/80" : "border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]")}
          data-join-provider={o.provider}
          data-join-state={o.state}
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{o.name}</p>
            <p className="text-[13px] text-[#6b7280]">{o.provider === "discord" ? (o.state === "joined" ? tt("You have the members' role.") : tt("Comes with your purchase: the members' Discord.")) : o.state === "joined" ? tt("You are in the group.") : tt("Comes with your purchase: a private Telegram group.")}</p>
          </div>
          <a
            href={withBack(o)}
            rel="noopener"
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2",
              o.state === "joined" ? "border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]" : "bg-[#1a1a2e] text-white hover:bg-[#2a2a40]",
            )}
          >
            {label(o)}
          </a>
        </div>
      ))}
    </div>
  )
}
