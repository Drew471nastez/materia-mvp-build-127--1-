"use client"

/**
 * ===========================================================================
 *  ONE SHAPE FOR EVERY EDITOR ON A CREATOR PAGE
 * ===========================================================================
 * The page has four things a creator can open: the profile, the bar at the
 * top, the story, and the colour scheme. Three of them were written
 * separately and the fourth was a panel bolted to the workspace's toolbar, so
 * the page had four different ideas of what an editor looks like and two
 * different ideas of how one opens.
 *
 * This is the shape, taken from the profile dialog because that is the one
 * the owner pointed at: a column with a fixed header, a scrolling body and a
 * sticky footer, so the Save button is never below the fold on a short
 * window.
 *
 * IT OPENS AND CLOSES ON RADIX. That is the whole of "it must not glitch":
 * Dialog keeps the content mounted for the length of the exit animation and
 * restores focus on the way out, and both of those are the sort of thing that
 * is invisible when correct and looks like a flash when hand-rolled. The
 * previous version was a hand-rolled panel and it flashed.
 */

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function EditorField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * A row of choices that are words rather than colours: which sentence the bar
 * generates, which label the button carries. Wraps, because six presets do
 * not fit on one line of a phone.
 */
export function SchemeSwatchRow({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function EditorSheet({
  open,
  onClose,
  title,
  busy,
  error,
  onSave,
  saveLabel = "Save",
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  busy?: boolean
  error?: string | null
  onSave: () => void
  saveLabel?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={cn("flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0", wide ? "sm:max-w-lg" : "sm:max-w-md")}>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {children}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={busy}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
