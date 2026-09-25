"use client"

/**
 * ===========================================================================
 *  THE OWNER'S MENUS: A MENU UNDER A MOUSE, A SHEET UNDER A THUMB
 * ===========================================================================
 * The three dots on the cover and the three dots on each product card were
 * Radix dropdowns everywhere, so on a phone they opened as a small floating
 * list anchored to a 36px button, with rows sized for a pointer. On a phone
 * they are the app's own bottom sheet now (components/ui/bottom-sheet), the
 * same one every editor on the page is: it rises from the bottom, follows the
 * finger, and leaves at the speed it is flicked. On a computer they stay the
 * dropdown they were.
 *
 * NOT MODAL, under a mouse either. A modal dropdown turns pointer events off
 * on the whole page and locks its scroll while it is open, and both have to
 * be undone on close; these are lists of links and have nothing to protect.
 *
 * IN THE WORKSPACE, EVERY ROW LEAVES THE FRAME. The rows go to /app, which
 * the canvas refuses to load (lib/store-builder/editor-channel), so without
 * `target="_top"` a row inside the frame did nothing at all. The caller says
 * whether it is framed.
 *
 * The rows are links and nothing else, so there is no action to run after
 * the sheet has gone: the browser follows the link.
 */

import * as React from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SmartLink } from "@/components/smart-link"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { cn } from "@/lib/utils"

export interface OwnerMenuLink {
  href: string
  label: string
  /** A second, quieter line under the label. */
  detail?: string
  target?: "_top"
}

/**
 * THE OWNER'S BUTTONS ON THE COVER, A LITTLE RAISED ON A PHONE. Three soft
 * shadows stacked (a contact line, a near one, a far one) and a hairline
 * ring, so the white buttons stand off a pale or busy banner. From `sm` up
 * they keep the plain `shadow-md` they have always had.
 */
export const OWNER_CONTROL_DEPTH =
  "shadow-[0_1px_1px_rgba(15,23,42,0.08),0_2px_6px_-1px_rgba(15,23,42,0.18),0_10px_22px_-8px_rgba(15,23,42,0.34)] ring-1 ring-black/[0.06] sm:shadow-md sm:ring-0"

export function OwnerActionsMenu({
  ariaLabel,
  title,
  heading,
  links,
  triggerClassName,
  icon,
  menuClassName = "w-60",
  stopClicks = false,
}: {
  ariaLabel: string
  /** Heads the phone sheet. */
  title: string
  /** A quiet line above the rows in the dropdown ("Only you can see this"). */
  heading?: string
  links: OwnerMenuLink[]
  triggerClassName: string
  icon: React.ReactNode
  menuClassName?: string
  /** The trigger sits inside a link (a product card): a press must not follow it. */
  stopClicks?: boolean
}) {
  const phone = useIsPhone()
  const [open, setOpen] = React.useState(false)

  if (phone) {
    return (
      <>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }}
          className={triggerClassName}
        >
          {icon}
        </button>
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={title} label={title} hideFrom={null}>
          {/*
            A click in here still bubbles to the trigger's React parents
            through the portal, and on a product card that parent is a link:
            without this, choosing a row also opened the product.
          */}
          <div className="px-2 pb-1 pt-1.5" onClick={(e) => e.stopPropagation()}>
            {heading && <p className="px-3 pb-1.5 pt-0.5 text-[12.5px] font-medium text-[#6b7280]">{heading}</p>}
            {links.map((link) => (
              <SmartLink
                key={link.href}
                href={link.href}
                target={link.target}
                onClick={() => setOpen(false)}
                className="flex min-h-[56px] w-full flex-col justify-center rounded-xl px-3 py-2 text-left no-underline outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:bg-[#f1f2f4]"
              >
                <span className="text-[16px] font-medium text-[#1a1a2e]">{link.label}</span>
                {link.detail && <span className="text-[13px] text-[#6b7280]">{link.detail}</span>}
              </SmartLink>
            ))}
          </div>
        </BottomSheet>
      </>
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        onClick={stopClicks ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
        className={triggerClassName}
      >
        {icon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={menuClassName} onClick={stopClicks ? (e) => e.stopPropagation() : undefined}>
        {heading && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{heading}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {links.map((link) => (
          <DropdownMenuItem key={link.href} asChild className={cn("cursor-pointer", link.detail && "py-2")}>
            <SmartLink href={link.href} target={link.target}>
              {link.detail ? (
                <span className="flex flex-col">
                  <span className="text-sm">{link.label}</span>
                  <span className="text-xs text-muted-foreground">{link.detail}</span>
                </span>
              ) : (
                link.label
              )}
            </SmartLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
