"use client"

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
/**
 * The phone container is the editor's own bottom sheet, not the generic
 * Sheet with a hand-rolled drag-to-close. The generic one moved on release,
 * not under the finger; this one has detents, velocity and real-time drag,
 * and a second implementation of any of that is a second set of bugs.
 */
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { cn } from "@/lib/utils"

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
  separatorBefore?: boolean
}

/**
 * Shows a standard dropdown menu on desktop (≥640px) and an iOS-style
 * bottom sheet on mobile, with a drag handle and drag-to-close.
 */
export function ResponsiveActionMenu({
  trigger,
  items,
  title,
  align = "end",
  menuWidth = "w-48",
}: {
  trigger: React.ReactElement
  items: ActionMenuItem[]
  title?: string
  align?: "start" | "end" | "center"
  menuWidth?: string
}) {
  const [isMobile, setIsMobile] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  React.useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 639px)").matches)
    check()
    const mql = window.matchMedia("(max-width: 639px)")
    mql.addEventListener("change", check)
    return () => mql.removeEventListener("change", check)
  }, [])

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
          setSheetOpen(true)
        },
      },
    )

    return (
      <>
        {triggerWithHandler}
        {/* `fit`: as tall as its rows and no taller. At half a screen a
            six-row menu was clipped at the bottom — "Back to Dashboard"
            under the browser's toolbar — and a three-row one floated over
            empty space. */}
        <MobileEditorSheet open={sheetOpen} onOpenChange={setSheetOpen} detents={[0.5, 0.92]} layer="raised" peekHeight={0} fit>
          {title ? (
            <div className="px-5 pt-0.5 pb-1.5 shrink-0">
              <p className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-400">{title}</p>
            </div>
          ) : null}

          {/* Actions — scroll only if there really are more rows than screen. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-0.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,_0px))]">
            {items.map((item, i) => (
              <React.Fragment key={i}>
                {item.separatorBefore && i !== 0 && (
                  <div className="h-px bg-neutral-100 my-1.5 mx-2" />
                )}
                {item.href ? (
                  <a
                    href={item.href}
                    target={item.target}
                    rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                    onClick={() => setSheetOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-900 transition-[background-color,transform] duration-150 hover:bg-neutral-50 active:scale-[0.98] active:bg-neutral-100"
                  >
                    {item.icon && <span className="flex shrink-0 items-center justify-center text-neutral-500">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                  </a>
                ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSheetOpen(false)
                    // Let the close begin before the action lands, so the
                    // dismissal reads as a response rather than a freeze.
                    setTimeout(() => item.onClick?.(), 140)
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] active:bg-neutral-100",
                    item.variant === "destructive" &&
                      "text-red-600 hover:bg-red-50 active:bg-red-100",
                    item.variant === "warning" &&
                      "text-amber-600 hover:bg-amber-50 active:bg-amber-100",
                    (!item.variant || item.variant === "default") &&
                      "text-neutral-900 hover:bg-neutral-50",
                  )}
                >
                  {item.icon && (
                    <span
                      className={cn(
                        "shrink-0 flex items-center justify-center",
                        item.variant === "destructive"
                          ? "text-red-600"
                          : item.variant === "warning"
                          ? "text-amber-600"
                          : "text-neutral-500",
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
                )}
              </React.Fragment>
            ))}
          </div>
        </MobileEditorSheet>
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={menuWidth}>
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {item.separatorBefore && i !== 0 && <DropdownMenuSeparator />}
            {item.href ? (
              <DropdownMenuItem asChild>
                <a href={item.href} target={item.target} rel={item.target === "_blank" ? "noopener noreferrer" : undefined}>
                  {item.icon && <span className="mr-2 inline-flex">{item.icon}</span>}
                  {item.label}
                </a>
              </DropdownMenuItem>
            ) : (
            <DropdownMenuItem
              onClick={item.onClick}
              className={cn(
                item.variant === "destructive" && "text-red-600",
                item.variant === "warning" && "text-amber-600",
              )}
            >
              {item.icon && <span className="mr-2 inline-flex">{item.icon}</span>}
              {item.label}
            </DropdownMenuItem>
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
