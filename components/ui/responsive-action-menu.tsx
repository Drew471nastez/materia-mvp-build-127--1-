"use client"

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export interface ActionMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
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
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            hideCloseButton
            enableDragToClose
            onDragClose={() => setSheetOpen(false)}
            className="p-0 rounded-t-[20px] overflow-hidden flex flex-col gap-0 border-t-0 shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)]"
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-2.5 pb-1.5 shrink-0 touch-none cursor-grab active:cursor-grabbing"
              data-drag-handle="true"
            >
              <div className="h-1 w-10 rounded-full bg-neutral-300" />
            </div>

            {/* Optional title */}
            {title ? (
              <div className="px-5 pt-1 pb-2 shrink-0" data-drag-handle="true">
                <SheetTitle className="text-[13px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {title}
                </SheetTitle>
              </div>
            ) : (
              <SheetTitle className="sr-only">Actions</SheetTitle>
            )}
            <SheetDescription className="sr-only">Choose an action</SheetDescription>

            {/* Actions */}
            <div className="px-3 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,_0px))]">
              {items.map((item, i) => (
                <React.Fragment key={i}>
                  {item.separatorBefore && i !== 0 && (
                    <div className="h-px bg-neutral-100 my-1.5 mx-2" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(false)
                      // Let the close animation begin before firing the action
                      // so the sheet dismissal feels snappy, not frozen.
                      setTimeout(() => item.onClick(), 140)
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium transition-colors active:scale-[0.98] active:bg-neutral-100",
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
                </React.Fragment>
              ))}
            </div>
          </SheetContent>
        </Sheet>
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
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
