"use client"

import { useState } from "react"
import { Check, Loader2, Plus } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { createBusiness, switchBusiness } from "@/lib/businesses/switch-client"
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
 *
 * "New business" makes the second account right there and goes straight
 * into the creator onboarding, the same "Name your store" everyone starts
 * with. No page in between: the row says it is setting up while it works.
 */

/** The size of a business's photo in each menu: the account sheet preloads the one it will draw. */
export const SWITCHER_AVATAR = { sheet: 32, dropdown: 26 } as const

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
  currentAvatar,
}: {
  businesses: BusinessRow[]
  variant: "dropdown" | "sheet"
  /** Closes the menu before a page change. Both actions reload the app, so nothing calls it now. */
  onNavigate?: () => void
  /**
   * The signed in person's photo as the header draws it (lib/account/
   * avatar-store). The business you are in is that person, so its row
   * changes the moment Settings changes the photo, with the header, instead
   * of waiting for the server's next list.
   */
  currentAvatar?: string | null
}) {
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

  const add = async () => {
    if (busy) return
    setError(null)
    setBusy("new")
    try {
      await createBusiness()
    } catch (e) {
      setBusy(null)
      setError(e instanceof Error ? e.message : "The business could not be created. Try again.")
    }
  }

  return (
    <div data-business-switcher="" className={sheet ? "pb-1" : "pb-0.5"}>
      {/* A label on the desktop menu only: on a phone the sheet's rows say it on their own. */}
      {!sheet && <p className="px-3 pb-1 pt-1.5 text-[11.5px] font-medium text-neutral-500">Businesses</p>}
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
          <AppAvatar
            src={b.current && currentAvatar !== undefined ? currentAvatar || null : b.avatarUrl}
            name={b.name}
            size={sheet ? SWITCHER_AVATAR.sheet : SWITCHER_AVATAR.dropdown}
            className="shrink-0 ring-1 ring-neutral-200"
          />
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
          onClick={add}
          data-business-new=""
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
            {busy === "new" ? (
              <Loader2 className={cn("animate-spin", sheet ? "h-4 w-4" : "h-3.5 w-3.5")} aria-hidden />
            ) : (
              <Plus className={sheet ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={2} />
            )}
          </span>
          {busy === "new" ? "Setting up your new business" : "New business"}
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
