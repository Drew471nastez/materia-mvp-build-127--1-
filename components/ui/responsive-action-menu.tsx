"use client"

/**
 * ===========================================================================
 *  THE ACTION LIST: A MENU ON A COMPUTER, A SHEET ON A PHONE
 * ===========================================================================
 * Shaped like Shopify's action list. On a computer, a small white popover
 * anchored to the button: rows in groups, a hairline between the groups, a
 * small grey icon at the start of each row, and anything destructive in red
 * at the end. It opens and closes in 150ms, on transform and opacity only.
 * On a phone, the same groups as big rows in the shared sheet
 * (components/ui/bottom-sheet.tsx), so this sheet moves, drags and closes
 * exactly like every other sheet in the app.
 *
 * Groups come from the items: `separatorBefore` starts a new one, and
 * `section` names it. The order is the caller's, and the caller puts
 * destructive rows last.
 *
 * ONE MOTION AT A TIME, ON A PHONE. A row's action used to land 140ms into
 * the sheet's 340ms close, so Rename's dialog, the builder's settings sheet
 * or a page change started while the menu was still sliding away: two
 * things moving at once, which is what read as clunky. The action now waits
 * for the sheet to have left (`onClosed`), and a link still goes at once,
 * because the browser, not this menu, is what follows it.
 *
 * NOTHING TO REDO WHILE IT MOVES. The rows are built once per set of items
 * and the component is memoised, so a busy parent (the builder re-renders on
 * every autosave and every poll) does not rebuild the sheet under a finger.
 */

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { createPortal } from "react-dom"
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export interface ActionMenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  /**
   * A link instead of an action. Rendered as a real anchor on both surfaces,
   * so `target="_blank"` is honoured by the browser itself — a `window.open`
   * from inside a timeout is exactly the call a phone's pop-up rule blocks.
   */
  href?: string
  target?: "_blank"
  variant?: "default" | "destructive" | "warning"
  /** Starts a new group, with a hairline above it. */
  separatorBefore?: boolean
  /** Names the group this row starts. Implies `separatorBefore`. */
  section?: string
  /** Shown, and not pressable. `hint` says why, under the label. */
  disabled?: boolean
  /** A short second line: why a row is disabled, say. */
  hint?: string
  /** A stable hook for tests and browser checks. */
  id?: string
}

export interface Group {
  title?: string
  items: ActionMenuItem[]
}

export function groupsOf(items: ActionMenuItem[]): Group[] {
  const groups: Group[] = []
  for (const item of items) {
    const starts = groups.length === 0 || item.separatorBefore || item.section
    if (starts) groups.push({ title: item.section, items: [item] })
    else groups[groups.length - 1].items.push(item)
  }
  return groups
}

/* ── the look ───────────────────────────────────────────────────────────── */

/** The same white surface as the date picker's popover. */
const SURFACE =
  "action-list z-[2147483640] max-h-(--radix-dropdown-menu-content-available-height) min-w-[12rem] overflow-y-auto overflow-x-hidden rounded-xl border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)] outline-none"

const TONE = {
  default: {
    row: "text-[#303036] hover:bg-[#f1f2f4] focus:bg-[#f1f2f4] data-[highlighted]:bg-[#f1f2f4] active:bg-[#e9eaed]",
    icon: "text-[#6b7280]",
    tap: "text-[#1a1a2e] active:bg-[#f1f2f4]",
  },
  destructive: {
    row: "text-[#c4290c] hover:bg-[#fef1ee] focus:bg-[#fef1ee] data-[highlighted]:bg-[#fef1ee] active:bg-[#fde4df]",
    icon: "text-[#c4290c]",
    tap: "text-[#c4290c] active:bg-[#fef1ee]",
  },
  warning: {
    row: "text-[#8a5a00] hover:bg-[#fff6e0] focus:bg-[#fff6e0] data-[highlighted]:bg-[#fff6e0] active:bg-[#ffefc7]",
    icon: "text-[#b07800]",
    tap: "text-[#8a5a00] active:bg-[#fff6e0]",
  },
} as const

const toneOf = (item: ActionMenuItem) => TONE[item.variant ?? "default"]

/* ── the component ─────────────────────────────────────────────────────── */

export const ResponsiveActionMenu = React.memo(function ResponsiveActionMenu({
  trigger,
  items,
  title,
  align = "end",
  menuWidth = "w-56",
  opener,
}: {
  trigger: React.ReactElement
  items: ActionMenuItem[]
  /**
   * Round 30: filled with a function that opens the menu (or the sheet), for a caller that opens it on its own: the
   * composer's Post pressed before a space is chosen opens the space picker.
   */
  opener?: React.MutableRefObject<(() => void) | null>
  /** Heads the phone sheet, and names it for a screen reader. */
  title?: string
  align?: "start" | "end" | "center"
  menuWidth?: string
}) {
  const [isMobile, setIsMobile] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const groups = React.useMemo(() => groupsOf(items), [items])
  /** The row pressed, run once the sheet has finished leaving. */
  const pendingRef = React.useRef<(() => void) | null>(null)
  /** A row was pressed: the sheet closes now and the action runs when it has gone. */
  const pick = React.useCallback((run: (() => void) | null) => {
    pendingRef.current = run
    setSheetOpen(false)
  }, [])

  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)")
    const check = () => setIsMobile(mql.matches)
    check()
    mql.addEventListener("change", check)
    return () => mql.removeEventListener("change", check)
  }, [])

  React.useEffect(() => {
    if (!opener) return
    opener.current = () => {
      pendingRef.current = null
      if (isMobile) setSheetOpen(true)
      else setMenuOpen(true)
    }
    return () => {
      opener.current = null
    }
  }, [opener, isMobile])

  if (isMobile) {
    // Inject onClick into the provided trigger element so it opens the sheet.
    const triggerWithHandler = React.cloneElement(
      trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>,
      {
        onClick: (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          const original = (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick
          original?.(e)
          pendingRef.current = null
          /* Felt as the press lands, before anything has moved. */
          hapticTap("soft")
          setSheetOpen(true)
        },
      },
    )

    return (
      <>
        {triggerWithHandler}
        <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)}
          onClosed={() => {
            const run = pendingRef.current
            pendingRef.current = null
            run?.()
          }}
          title={title}
          label={title ?? tt("Actions")}
        >
          <ActionSheetRows groups={groups} onPick={pick} />
        </BottomSheet>
      </>
    )
  }

  return (
    /**
     * NOT MODAL. A modal dropdown mounts `react-remove-scroll`, which cancels
     * every touch gesture outside it and locks the body — and if the lock is
     * not released on close, the page cannot be scrolled again until it is
     * reloaded. A row's action menu should never do that; it is not a dialog,
     * and you should be able to scroll the page it sits on.
     */
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <ActionDropdownContent groups={groups} align={align} menuWidth={menuWidth} />
    </DropdownMenu>
  )
})

/**
 * The dropdown's surface and rows, for a caller that holds its own
 * DropdownMenu root (a grid of pictures that builds one only for the tile
 * whose menu is open, rather than one per tile). Inside a DropdownMenu.
 */
export function ActionDropdownContent({
  groups,
  align = "end",
  menuWidth = "w-56",
  onCloseAutoFocus,
  sideOffset = 6,
  collisionBoundary,
  collisionPadding = 12,
}: {
  groups: Group[]
  align?: "start" | "end" | "center"
  menuWidth?: string
  /** Where the focus goes back to when the trigger is a stand in (a menu held against something else). */
  onCloseAutoFocus?: (e: Event) => void
  /** How far from the trigger. */
  sideOffset?: number
  /** What the menu stays inside and flips against (a window it opened from), rather than the whole screen. */
  collisionBoundary?: Element | null
  collisionPadding?: number
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-action-list=""
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionBoundary={collisionBoundary ?? undefined}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(SURFACE, menuWidth)}
      >
        {groups.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <DropdownMenuPrimitive.Separator className="h-px bg-[#ebecef]" />}
            <DropdownMenuPrimitive.Group className="p-1.5">
              {group.title && (
                <DropdownMenuPrimitive.Label className="px-2 pb-1 pt-1 text-[12px] font-medium text-[#6b7280]">
                  {group.title}
                </DropdownMenuPrimitive.Label>
              )}
              {group.items.map((item, i) => {
                const tone = toneOf(item)
                /**
                 * Three ways of saying "the pointer is on this row", because
                 * only one of them was firing and the menu read as a list of
                 * labels rather than a list of buttons. Radix marks the row it
                 * has highlighted, focuses it on pointer move, and the plain
                 * hover covers the case where neither has happened yet.
                 */
                const row = cn(
                  "flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 text-[13px] font-medium outline-none transition-colors duration-100 [&_svg]:h-4 [&_svg]:w-4",
                  item.hint ? "min-h-8 py-1.5" : "h-8",
                  item.disabled ? "cursor-default text-[#303036] data-[disabled]:pointer-events-none" : tone.row,
                )
                const body = (
                  <>
                    {item.icon && <span className={cn("inline-flex shrink-0", item.disabled ? "text-[#b4b8bf]" : tone.icon)}>{item.icon}</span>}
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("truncate", item.disabled && "text-[#9ca3af]")}>{item.label}</span>
                      {item.hint && <span className="truncate text-[12px] font-normal leading-4 text-[#6b7280]">{item.hint}</span>}
                    </span>
                  </>
                )
                return item.href ? (
                  <DropdownMenuPrimitive.Item key={i} asChild className={row}>
                    <a
                      href={item.href}
                      target={item.target}
                      rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                    >
                      {body}
                    </a>
                  </DropdownMenuPrimitive.Item>
                ) : (
                  <DropdownMenuPrimitive.Item key={i} data-action-item={item.id} disabled={item.disabled} onSelect={() => item.onClick?.()} className={row}>
                    {body}
                  </DropdownMenuPrimitive.Item>
                )
              })}
            </DropdownMenuPrimitive.Group>
          </React.Fragment>
        ))}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

/**
 * The phone sheet's rows, memoised on the groups: drawn once when the sheet
 * opens and left alone while it slides, whatever the page behind it does.
 */
export const ActionSheetRows = React.memo(function ActionSheetRows({
  groups,
  onPick,
}: {
  groups: Group[]
  /** A row was pressed: close, then run this. Null for a link, which the browser follows. */
  onPick: (run: (() => void) | null) => void
}) {
  const pick = React.useRef(onPick)
  pick.current = onPick
  return (
    <div data-action-sheet="" className="px-2 pb-1 pt-1.5">
      {groups.map((group, gi) => (
        <div key={gi} role="group" aria-label={group.title}>
          {gi > 0 && <div aria-hidden className="mx-3 my-1.5 h-px bg-[#ebecef]" />}
          {group.title && (
            <p className="px-3 pb-1 pt-1.5 text-[12.5px] font-medium text-[#6b7280]">{group.title}</p>
          )}
          {group.items.map((item, i) => {
            const tone = toneOf(item)
            const row = cn(
              "flex min-h-[52px] w-full items-center gap-3.5 rounded-xl px-3 text-left text-[16px] font-medium outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] [&_svg]:h-5 [&_svg]:w-5",
              item.disabled ? "text-[#1a1a2e]" : tone.tap,
            )
            const body = (
              <>
                {item.icon && <span className={cn("flex shrink-0 items-center justify-center", item.disabled ? "text-[#b4b8bf]" : tone.icon)}>{item.icon}</span>}
                <span className="flex min-w-0 flex-col py-1">
                  <span className={cn("truncate", item.disabled && "text-[#9ca3af]")}>{item.label}</span>
                  {item.hint && <span className="truncate text-[13px] font-normal leading-5 text-[#6b7280]">{item.hint}</span>}
                </span>
              </>
            )
            return item.href ? (
              <a
                key={i}
                href={item.href}
                target={item.target}
                rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                onClick={() => pick.current(null)}
                className={row}
              >
                {body}
              </a>
            ) : (
              <button
                key={i}
                type="button"
                data-action-item={item.id}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                onClick={() => pick.current(item.onClick ?? null)}
                className={row}
              >
                {body}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
})

/**
 * ===========================================================================
 *  THE SAME MENU, OPENED AT A PLACE RATHER THAN BY ITS OWN BUTTON
 * ===========================================================================
 * For a list that has one menu for all its rows: the "..." of whichever row
 * was pressed, the pointer where a row was right clicked, a row held down
 * on a touch screen. `at.box` is where it opens (a button's box, or a 1px
 * box at the pointer), held against a stand in drawn into the body, the way
 * the files library holds its menu. `at.phone` opens the shared sheet
 * instead, and the row's action runs once the sheet has gone.
 */
export interface ActionMenuPlace {
  box: { left: number; top: number; width: number; height: number }
  phone: boolean
  /** "start" under a pointer, "end" under a button at the end of a row. */
  align?: "start" | "end"
  /** Where the focus goes back to when the menu closes. */
  focus?: HTMLElement | null
}

export function ActionMenuAt({
  at,
  items,
  title,
  onClose,
  menuWidth = "w-52",
}: {
  at: ActionMenuPlace | null
  items: ActionMenuItem[]
  title?: string
  onClose: () => void
  menuWidth?: string
}) {
  const groups = React.useMemo(() => groupsOf(items), [items])
  const pendingRef = React.useRef<(() => void) | null>(null)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  /* The sheet keeps its rows while it slides away, after the caller has let go of the place. */
  const [sheetGroups, setSheetGroups] = React.useState<Group[]>([])
  const sheetOpen = !!at?.phone
  React.useEffect(() => {
    if (!sheetOpen) return
    pendingRef.current = null
    setSheetGroups(groups)
  }, [sheetOpen, groups])
  React.useEffect(() => {
    if (sheetOpen) hapticTap("soft")
  }, [sheetOpen])
  const desktop = at && !at.phone ? at : null

  return (
    <>
      {desktop && mounted ? (
        <DropdownMenuPrimitive.Root open modal={false} onOpenChange={(next) => { if (!next) onClose() }}>
          {createPortal(
            <DropdownMenuPrimitive.Trigger asChild>
              <span
                aria-hidden
                data-action-anchor=""
                style={{ position: "fixed", left: desktop.box.left, top: desktop.box.top, width: desktop.box.width, height: desktop.box.height, pointerEvents: "none" }}
              />
            </DropdownMenuPrimitive.Trigger>,
            document.body,
          )}
          <ActionDropdownContent
            groups={groups}
            align={desktop.align ?? "start"}
            menuWidth={menuWidth}
            sideOffset={desktop.align === "end" ? 4 : 2}
            collisionPadding={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              desktop.focus?.focus({ preventScroll: true })
            }}
          />
        </DropdownMenuPrimitive.Root>
      ) : null}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={onClose}
        onClosed={() => {
          const run = pendingRef.current
          pendingRef.current = null
          run?.()
        }}
        title={title}
        label={title ?? tt("Actions")}
        hideFrom={null}
      >
        <ActionSheetRows
          groups={sheetGroups}
          onPick={(run) => {
            pendingRef.current = run
            onClose()
          }}
        />
      </BottomSheet>
    </>
  )
}
