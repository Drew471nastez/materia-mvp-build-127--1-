"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Plus } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { switchBusiness } from "@/lib/businesses/switch-client"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  YOUR BUSINESSES, AT THE TOP OF THE ACCOUNT MENU
 * ===========================================================================
 * The business you are in, with a check; the other one, a tap away; and
 * "New business" while there is room for one. The same rows in the desktop
 * dropdown and the phone's account sheet, at each surface's own size.
 *
 * A tap on the other business asks the server to switch (lib/businesses/
 * switch-client), which reloads the app as that business: its dashboard,
 * products, orders, pages, emails and payouts. A business still being set up
 * says so, and opening it carries on with its onboarding.
 */

export interface BusinessRow {
  userId: string
  name: string
  handle: string | null
  avatarUrl: string | null
  ready: boolean
  current: boolean
  role: "owner" | "member"
}

export function BusinessSwitcher({
  businesses,
  variant,
  onNavigate,
}: {
  businesses: BusinessRow[]
  variant: "dropdown" | "sheet"
  /** Closes the menu before a page change. */
  onNavigate: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (businesses.length === 0) return null
  const sheet = variant === "sheet"
  const current = businesses.find((b) => b.current)
  /* The second business is made from the first; there is room for one. */
  const canAdd = businesses.length < 2 && current?.role === "owner"

  const open = async (b: BusinessRow) => {
    if (b.current || busy) return
    setError(null)
    setBusy(b.userId)
    try {
      await switchBusiness(b.userId)
    } catch (e) {
      setBusy(null)
      setError(e instanceof Error ? e.message : "That business could not be opened. Try again.")
    }
  }

  return (
    <div data-business-switcher="" className={sheet ? "pb-1" : "pb-0.5"}>
      <p className={cn("font-medium text-neutral-500", sheet ? "px-3 pb-1.5 pt-1 text-[13px]" : "px-3 pb-1 pt-1.5 text-[11.5px]")}>
        Businesses
      </p>
      {businesses.map((b) => (
        <button
          key={b.userId}
          type="button"
          onClick={() => open(b)}
          disabled={!!busy}
          aria-current={b.current ? "true" : undefined}
          data-business-row={b.current ? "current" : "other"}
          className={cn(
            "flex w-full items-center text-left transition-colors disabled:cursor-default [-webkit-tap-highlight-color:transparent]",
            sheet ? "min-h-[52px] gap-3 rounded-xl px-3 py-2 active:bg-neutral-100" : "min-h-[44px] gap-2.5 rounded-lg px-3 py-1.5 hover:bg-neutral-50",
            b.current ? "cursor-default" : "cursor-pointer",
          )}
        >
          <AppAvatar src={b.avatarUrl} name={b.name} size={sheet ? 32 : 26} className="shrink-0 ring-1 ring-neutral-200" />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate font-medium text-neutral-900", sheet ? "text-[15px]" : "text-[13px]")}>{b.name}</span>
            <span className={cn("block truncate text-neutral-500", sheet ? "text-[13px]" : "text-[11.5px]")}>
              {!b.ready ? "Setting up" : b.handle ? `@${b.handle}` : ""}
            </span>
          </span>
          {busy === b.userId ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" aria-label="Opening" />
          ) : b.current ? (
            <Check className="h-4 w-4 shrink-0 text-neutral-900" strokeWidth={2.25} aria-label="Current business" />
          ) : null}
        </button>
      ))}
      {canAdd && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => {
            onNavigate()
            router.push("/onboarding/business")
          }}
          className={cn(
            "flex w-full items-center font-medium text-neutral-700 transition-colors [-webkit-tap-highlight-color:transparent]",
            sheet ? "min-h-[48px] gap-3 rounded-xl px-3 py-2 text-[15px] active:bg-neutral-100" : "min-h-[40px] gap-2.5 rounded-lg px-3 py-1.5 text-[13px] hover:bg-neutral-50",
          )}
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-full border border-dashed border-neutral-300 text-neutral-500",
              sheet ? "h-8 w-8" : "h-[26px] w-[26px]",
            )}
          >
            <Plus className={sheet ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={2} />
          </span>
          New business
        </button>
      )}
      {error && (
        <p role="alert" className={cn("px-3 pt-1 text-red-600", sheet ? "text-[13px]" : "text-[12px]")}>
          {error}
        </p>
      )}
    </div>
  )
}
