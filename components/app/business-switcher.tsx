"use client"

import { useEffect, useId, useState } from "react"
import { ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { createBusiness, switchBusiness } from "@/lib/businesses/switch-client"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  YOUR BUSINESSES, AT THE TOP OF THE ACCOUNT MENU
 * ===========================================================================
 * ONE ROW UNTIL YOU ASK FOR MORE. The menu used to open on a "Businesses"
 * label, the business you are in with a check, and a "New business" row with
 * a dashed circle: three lines of the menu, every time it opened, for a
 * choice most people make once. Now the business you are in is a single row,
 * its photo, its name and its @handle, with the up and down chevron that
 * says "there is a list behind this" in every workspace switcher people
 * already know. A tap opens the list in place, under that row: the other
 * business (if there is one), then "New business" as a slim line of text.
 * Another tap, or closing the menu, folds it away again.
 *
 * No heading. The row is the business, so a label saying "Businesses" over
 * it was a word explaining a picture that already said it.
 *
 * The same rows in the desktop dropdown and the phone's account sheet, at
 * each surface's own size: 44px in the dropdown, 52px in the sheet, and the
 * "New business" line 36px and 44px (a finger still needs the 44).
 *
 * The list opens by `grid-template-rows: 0fr -> 1fr`, the way the rail's
 * groups do (sidebar-desktop-nav's Collapsible): a real auto height with no
 * measuring, and a tap in the middle of it turns it round from wherever it
 * is. Folded, the list is `inert`, so Tab and a screen reader skip what
 * cannot be seen.
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

/** How long the menu around it takes to go (the sheet's slide is the longer), before the list folds out of sight. */
const FOLD_AFTER_CLOSE_MS = 400

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
  open = true,
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
  /**
   * Whether the menu around it is showing. Both menus stay mounted while
   * shut, so the list is folded back once the menu has finished going, not
   * while it is still on screen, and the next open starts on the one row.
   */
  open?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => {
      setExpanded(false)
      setError(null)
    }, FOLD_AFTER_CLOSE_MS)
    return () => window.clearTimeout(t)
  }, [open])
  if (businesses.length === 0) return null
  const sheet = variant === "sheet"
  const current = businesses.find((b) => b.current) ?? businesses[0]
  const others = businesses.filter((b) => b !== current)
  /* The second business is made from the first; there is room for one. */
  const canAdd = businesses.length < 2 && current.role === "owner"
  /* Nothing behind the row (a business that cannot make another, and no other to go to): no chevron, no tap. */
  const hasList = others.length > 0 || canAdd

  const openBusiness = async (b: BusinessRow) => {
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

  const avatarSize = sheet ? SWITCHER_AVATAR.sheet : SWITCHER_AVATAR.dropdown
  const rowClass = cn(
    "flex w-full items-center text-left transition-colors disabled:cursor-default [-webkit-tap-highlight-color:transparent]",
    sheet ? "min-h-[52px] gap-3 rounded-xl px-3 py-2 active:bg-neutral-100" : "min-h-[44px] gap-2.5 rounded-lg px-3 py-1.5 hover:bg-neutral-50",
  )
  const nameAndHandle = (b: BusinessRow) => (
    <span className="min-w-0 flex-1">
      <span className={cn("block truncate font-medium text-neutral-900", sheet ? "text-[15px]" : "text-[13px]")}>{b.name}</span>
      <span className={cn("block truncate text-neutral-500", sheet ? "text-[13px]" : "text-[11.5px]")}>
        {!b.ready ? "Setting up" : b.handle ? `@${b.handle}` : ""}
      </span>
    </span>
  )

  return (
    <div data-business-switcher="" data-expanded={expanded ? "" : undefined} className={sheet ? "pb-1" : "pb-0.5"}>
      {/* The business you are in. With a list behind it, the row is the switch that opens it. */}
      <button
        type="button"
        onClick={hasList ? () => setExpanded((v) => !v) : undefined}
        disabled={!hasList}
        aria-current="true"
        aria-expanded={hasList ? expanded : undefined}
        aria-controls={hasList ? listId : undefined}
        data-business-row="current"
        className={cn(rowClass, hasList ? "cursor-pointer" : "cursor-default", expanded && (sheet ? "bg-neutral-100/70" : "bg-neutral-50"))}
      >
        <AppAvatar
          src={currentAvatar !== undefined ? currentAvatar || null : current.avatarUrl}
          name={current.name}
          size={avatarSize}
          className="shrink-0 ring-1 ring-neutral-200"
        />
        {nameAndHandle(current)}
        {hasList && (
          <ChevronsUpDown
            className={cn("shrink-0 text-neutral-400", sheet ? "h-[18px] w-[18px]" : "h-4 w-4")}
            strokeWidth={1.75}
            aria-label={expanded ? "Hide businesses" : "Switch business"}
          />
        )}
      </button>

      {hasList && (
        <div
          id={listId}
          data-business-list={expanded ? "open" : "closed"}
          inert={!expanded}
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            opacity: expanded ? 1 : 0,
            transition: "grid-template-rows 220ms cubic-bezier(0.2, 0, 0, 1), opacity 180ms ease",
          }}
        >
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            {others.map((b) => (
              <button
                key={b.userId}
                type="button"
                onClick={() => openBusiness(b)}
                disabled={!!busy}
                data-business-row="other"
                className={cn(rowClass, "cursor-pointer")}
              >
                <AppAvatar src={b.avatarUrl} name={b.name} size={avatarSize} className="shrink-0 ring-1 ring-neutral-200" />
                {nameAndHandle(b)}
                {busy === b.userId && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" aria-label="Opening" />}
              </button>
            ))}
            {canAdd && (
              /* A slim line of text, its plus in the photo's column so the words line up with the names above. */
              <button
                type="button"
                disabled={!!busy}
                onClick={add}
                data-business-new=""
                className={cn(
                  "flex w-full items-center font-medium text-neutral-600 transition-colors [-webkit-tap-highlight-color:transparent]",
                  sheet ? "min-h-[44px] gap-3 rounded-xl px-3 py-1.5 text-[15px] active:bg-neutral-100" : "min-h-[36px] gap-2.5 rounded-lg px-3 py-1 text-[13px] hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                <span className="grid shrink-0 place-items-center text-neutral-400" style={{ width: avatarSize }}>
                  {busy === "new" ? (
                    <Loader2 className={cn("animate-spin", sheet ? "h-[18px] w-[18px]" : "h-4 w-4")} aria-hidden />
                  ) : (
                    <Plus className={sheet ? "h-[18px] w-[18px]" : "h-4 w-4"} strokeWidth={1.75} />
                  )}
                </span>
                {busy === "new" ? "Setting up your new business" : "New business"}
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className={cn("px-3 pt-1 text-red-600", sheet ? "text-[13px]" : "text-[12px]")}>
          {error}
        </p>
      )}
    </div>
  )
}
