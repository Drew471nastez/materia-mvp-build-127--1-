"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ChevronsUpDown, Plus } from "lucide-react"
import { AppAvatar, preloadAvatar } from "@/components/app/app-avatar"
import { SwitchingScreen, type SwitchingHandle } from "@/components/app/business-switch-screen"
import { STILL_AVATAR } from "@/components/app/shell-header-still"
import { iconDepth } from "@/components/ui/depth-button"
import { canAddBusiness, LIMIT_REACHED } from "@/lib/businesses/rules"
import { createBusiness, openAgain, SWITCH_FAILED, SwitchFailed, SwitchStalled, switchBusiness, type SwitchSteps } from "@/lib/businesses/switch-client"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  YOUR BUSINESSES, AT THE TOP OF THE ACCOUNT MENU
 * ===========================================================================
 * ONE ROW UNTIL YOU ASK FOR MORE. The business you are in is a single row,
 * its photo, its name and its @handle, with a small "+" square and the up and
 * down chevron that says "there is a list behind this" in every workspace
 * switcher people already know. A tap anywhere on the row, the "+" included,
 * opens the list in place, under it: the login's other businesses (up to two
 * more, lib/businesses/rules MAX_BUSINESSES), then "New business" as a slim
 * line, always. Another tap, or closing the menu, folds it away again.
 *
 * No heading. The row is the business, so a label saying "Businesses" over
 * it was a word explaining a picture that already said it.
 *
 * The same rows in the desktop dropdown and the phone's account sheet, at
 * each surface's own size: 44px in the dropdown, 52px in the sheet, and the
 * "New business" line 36px and 44px (a finger still needs the 44).
 *
 * THE "+" OPENS THE LIST, IT DOES NOT MAKE A BUSINESS. The owner: "the plus
 * should NOT redirect me to a new business directly: it needs to open up the
 * collapsible thing, and then there's the New business + button there." So
 * the square is part of the row, the same press as the name and the chevron,
 * and what makes a business is the "New business" line the list shows under
 * the others. A business is an account; it is made by a line that says so,
 * never by a square with no words.
 *
 * ON EVERY BUSINESS. "It doesn't matter which business I am on: when I
 * switch to Calvin, my other business, there is no plus icon there." The
 * square, the list and "New business" are on every business of the login,
 * the first or any other. A business made from the second is linked to the
 * first all the same (lib/businesses/server createBusinessAccount), so the
 * login stays one group.
 *
 * THE LIMIT IS SAID ON THE PRESS, NOT LEFT LYING IN THE MENU. The list used
 * to swap "New business" for a sentence about the limit as soon as the login
 * had three, so a full group read a paragraph every time it opened its own
 * account menu. The owner: "I don't want to show that text, 'you already
 * have three businesses, the most one' thing. Don't show it. When I click
 * create, it should show that, just only." So "New business" is there and
 * pressable on every business, whatever the count, and a press with three
 * already puts LIMIT_REACHED (lib/businesses/rules) on the one line this
 * menu says anything on: the role="alert" line at the bottom, the same line
 * a failed switch and a refused create use, in the same words. The count is
 * read here (canAddBusiness) so a press that cannot succeed never becomes a
 * request; the server checks it again and so does the database (run-now part
 * 38), because the menu's count is a courtesy and theirs is the rule. A
 * refusal that comes back from the server is the same sentence in the same
 * place, so there is one answer to "why not", wherever it was decided.
 *
 * The square wears iconDepth (components/ui/depth-button): the hairline and
 * 2px foot the Website page's icon buttons have, 28px in the dropdown and
 * 30px in the sheet. It is inside the row's one button, so the row keeps a
 * single press target the height of the row, and pressing the square also
 * shows the square pressed.
 *
 * The list opens by `grid-template-rows: 0fr -> 1fr`, the way the rail's
 * groups do (sidebar-desktop-nav's Collapsible): a real auto height with no
 * measuring, and a tap in the middle of it turns it round from wherever it
 * is. Folded, the list is `inert`, so Tab and a screen reader skip what
 * cannot be seen.
 *
 * A tap on the other business asks the server to switch (lib/businesses/
 * switch-client), which loads the app again as that business: its
 * dashboard, products, orders, pages, emails and payouts. A business still
 * being set up says so, and opening it carries on with its onboarding.
 *
 * THE SWITCH HAS ITS OWN SCREEN (components/app/business-switch-screen), up
 * on the frame after the tap, over the menu and the page: the shell's frame
 * with the business you are going to in its black bar (its photo and its
 * name, components/app/shell-header-still), the spinner, and a line that
 * follows the switch's real steps, "Switching to Loudlib", then "Opening
 * Loudlib's store" once the server has said yes. The new /app's HTML draws
 * the same screen and hands over to its page once that page is ready to
 * draw. So the photo is drawn in the bar from the first frame, the list
 * fetches and decodes the other businesses' photos at the bar's size as it
 * opens. If the switch fails the screen fades away over the business you are
 * still in, and the menu, still open under it, says why in a sentence.
 *
 * "New business" makes the new account right there and goes straight into
 * the creator onboarding, the same "Name your store" everyone starts with.
 * While it works the same screen as a switch comes up, on the plain white the
 * onboarding is drawn on, with its own two lines (lib/businesses/switch-
 * screen NEW_BUSINESS_STEPS), and /signup/success opens on the second of them
 * in the same place (components/app/business-switch-screen
 * NewBusinessScreen). The rows under it stay as they are,
 * pressed and waiting, with no spinner of their own.
 */

/** How long the menu around it takes to go (the sheet's slide is the longer), before the list folds out of sight. */
const FOLD_AFTER_CLOSE_MS = 400

/** The size of a business's photo in each menu: the account sheet preloads the one it will draw. */
export const SWITCHER_AVATAR = { sheet: 32, dropdown: 26 } as const

/** The "+" square on the row, per menu. */
const PLUS = { sheet: 30, dropdown: 28 } as const

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
  /* What Try again beside the error does: the same switch again. None for a refusal pressing again cannot change. */
  const [retry, setRetry] = useState<(() => void) | null>(null)
  const [expanded, setExpanded] = useState(false)
  /* The business being switched to, while its screen is up. */
  const [switching, setSwitching] = useState<BusinessRow | null>(null)
  /* A new business being made, while its screen is up. */
  const [creating, setCreating] = useState(false)
  const screen = useRef<SwitchingHandle | null>(null)
  const openRef = useRef<(b: BusinessRow) => void>(() => {})
  const screenGone = useCallback(() => {
    setSwitching(null)
    setCreating(false)
    setBusy(null)
  }, [])
  const listId = useId()
  useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => {
      setExpanded(false)
      setError(null)
      setRetry(null)
    }, FOLD_AFTER_CLOSE_MS)
    return () => window.clearTimeout(t)
  }, [open])
  const sheet = variant === "sheet"
  /*
    The other businesses' photos at the size the switch screen's bar draws
    them (the phone's bar from the sheet, the desktop's from the dropdown),
    fetched and decoded as the list opens: a press on one then has its photo
    in the bar on the first frame, and the new document finds it cached.
  */
  useEffect(() => {
    if (!expanded) return
    const size = sheet ? STILL_AVATAR.phone : STILL_AVATAR.desktop
    for (const b of businesses) if (!b.current) preloadAvatar(b.avatarUrl, size)
  }, [expanded, businesses, sheet])
  if (businesses.length === 0) return null
  const current = businesses.find((b) => b.current) ?? businesses[0]
  const others = businesses.filter((b) => b !== current)
  /* Room for another business on this login, whichever of its businesses this is (lib/businesses/rules MAX_BUSINESSES). */
  const canAdd = canAddBusiness(businesses.length)

  /*
    THE NEW PAGE NEVER CAME (lib/businesses/switch-flow). The browser holds
    the other business already, so the page under the screen is not one to
    go back to: the screen stays, says so in one line, and Try again asks
    for the page again, as many times as it takes.
  */
  const stalled = (next: string, steps: SwitchSteps) => {
    const again = () => {
      screen.current?.opening()
      openAgain(next, steps).catch(() => screen.current?.stall(again))
    }
    screen.current?.stall(again)
  }

  const openBusiness = async (b: BusinessRow) => {
    if (b.current || busy) return
    setError(null)
    setRetry(null)
    setBusy(b.userId)
    setSwitching(b)
    /* A business still being set up opens on its onboarding, not an /app for the screen to carry on in. */
    const steps: SwitchSteps = {
      arrival: b.ready ? { name: b.name, photo: b.avatarUrl } : undefined,
      business: b,
      onOpening: () => screen.current?.opening(),
    }
    try {
      await switchBusiness(b.userId, "/app", steps)
    } catch (e) {
      if (e instanceof SwitchStalled) {
        stalled(e.next, steps)
        return
      }
      setError(e instanceof Error && e.message ? e.message : SWITCH_FAILED)
      setRetry(() => (e instanceof SwitchFailed && !e.retry ? null : () => openRef.current(b)))
      /* Busy until the screen has gone, so nothing under it can be pressed twice. */
      if (screen.current) screen.current.fail()
      else screenGone()
    }
  }
  openRef.current = openBusiness

  const add = async () => {
    if (busy) return
    /*
      Three already: the sentence belongs here, at the press, and nowhere
      else. Decided from the count the menu was drawn with, so a press that
      cannot succeed is not a request the server has to refuse; the server
      and the database refuse it anyway if this count is stale, and that
      refusal lands on this very line with these very words.
    */
    if (!canAdd) {
      setError(LIMIT_REACHED)
      return
    }
    setError(null)
    setRetry(null)
    setBusy("new")
    setCreating(true)
    try {
      await createBusiness({ onOpening: () => screen.current?.opening() })
    } catch (e) {
      /* Made and held, only its setup page did not come: the screen says so and asks for it again. */
      if (e instanceof SwitchStalled) {
        stalled(e.next, {})
        return
      }
      setError(e instanceof Error && e.message ? e.message : tt("The business could not be created. Try again."))
      /* As a failed switch: busy until the screen has gone, then the menu under it says why. */
      if (screen.current) screen.current.fail()
      else screenGone()
    }
  }

  const avatarSize = sheet ? SWITCHER_AVATAR.sheet : SWITCHER_AVATAR.dropdown
  const plus = sheet ? PLUS.sheet : PLUS.dropdown
  const rowClass = cn(
    "flex w-full items-center text-left transition-colors disabled:cursor-default [-webkit-tap-highlight-color:transparent]",
    sheet ? "min-h-[52px] gap-3 rounded-xl px-3 py-2 active:bg-neutral-100" : "min-h-[44px] gap-2.5 rounded-lg px-3 py-1.5 hover:bg-neutral-50",
  )
  const nameAndHandle = (b: BusinessRow) => (
    <span className="min-w-0 flex-1">
      <span className={cn("block truncate font-medium text-neutral-900", sheet ? "text-[15px]" : "text-[13px]")}>{b.name}</span>
      <span className={cn("block truncate text-neutral-500", sheet ? "text-[13px]" : "text-[11.5px]")}>
        {!b.ready ? tt("Setting up") : b.handle ? `@${b.handle}` : ""}
      </span>
    </span>
  )
  /* The last line of the list, in the photo's column so its words line up with the names above. */
  const lastLine = cn(
    "flex w-full items-center font-medium",
    sheet ? "min-h-[44px] gap-3 rounded-xl px-3 py-1.5 text-[15px]" : "min-h-[36px] gap-2.5 rounded-lg px-3 py-1 text-[13px]",
  )

  return (
    <div data-business-switcher="" data-expanded={expanded ? "" : undefined} className={sheet ? "pb-1" : "pb-0.5"}>
      {/* The business you are in: one button, the "+" and the chevron inside it, that opens and folds the list. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-current="true"
        aria-expanded={expanded}
        aria-controls={listId}
        data-business-row="current"
        className={cn(
          rowClass,
          "group/current cursor-pointer",
          expanded && (sheet ? "bg-neutral-100/70" : "bg-neutral-50"),
        )}
      >
        <AppAvatar
          src={currentAvatar !== undefined ? currentAvatar || null : current.avatarUrl}
          name={current.name}
          size={avatarSize}
          className="shrink-0 ring-1 ring-neutral-200"
        />
        {nameAndHandle(current)}
        {/*
          The "+": a picture of a button inside the row's button (a button in
          a button is not allowed), so a press on it is a press on the row.
          It shows its own press all the same: `:active` holds for the
          element under the finger.
        */}
        <span
          aria-hidden="true"
          data-business-add=""
          className={cn(iconDepth, "p-0 text-[#374151]", sheet ? "rounded-[9px]" : "rounded-[8px]")}
          style={{ width: plus, height: plus }}
        >
          <Plus className={sheet ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={2} />
        </span>
        <ChevronsUpDown
          className={cn("shrink-0 text-neutral-400", sheet ? "h-[18px] w-[18px]" : "h-4 w-4")}
          strokeWidth={1.75}
          aria-label={expanded ? tt("Hide businesses") : tt("Switch business")}
        />
      </button>

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
            </button>
          ))}
          {/* Always here, whatever the count: with three already a press says so below instead of making one. */}
          <button
            type="button"
            disabled={!!busy}
            onClick={add}
            aria-busy={busy === "new" || undefined}
            data-business-new=""
            className={cn(
              lastLine,
              "text-neutral-600 transition-colors [-webkit-tap-highlight-color:transparent]",
              sheet ? "active:bg-neutral-100" : "hover:bg-neutral-50 hover:text-neutral-900",
            )}
          >
            <span className="grid shrink-0 place-items-center text-neutral-400" style={{ width: avatarSize }}>
              <Plus className={sheet ? "h-[18px] w-[18px]" : "h-4 w-4"} strokeWidth={1.75} />
            </span>
            {tt("New business")}
          </button>
        </div>
      </div>
      {/*
        The one place this menu says anything: a failed switch, a refused
        create, and the limit on a press of New business, all in the same
        sentence shape in the same spot. It goes with the menu, not with the
        list, so nothing is left sitting here at rest.
      */}
      {error && (
        <p role="alert" className={cn("px-3 pt-1 text-red-600", sheet ? "text-[13px]" : "text-[12px]")}>
          {retry ? error.replace(/\s*Try again\.?$/, "") : error}
          {retry && (
            <>
              {" "}
              <button type="button" onClick={retry} data-business-retry="" className="font-medium underline underline-offset-2 [-webkit-tap-highlight-color:transparent]">
                {tt("Try again")}
              </button>
            </>
          )}
        </p>
      )}
      {switching && <SwitchingScreen name={switching.name} photo={switching.avatarUrl} ready={switching.ready} handleRef={screen} onGone={screenGone} />}
      {creating && <SwitchingScreen mode="create" name="" ready={false} handleRef={screen} onGone={screenGone} />}
    </div>
  )
}
