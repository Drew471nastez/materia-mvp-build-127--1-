"use client"

import * as React from "react"
import { ChevronDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_GROUPS, searchIcons } from "@/lib/website-builder/icon-library"
import { ICON_MAP } from "@/components/website-builder/sections/icon-map"
import { FieldPopover, FIELD_TRIGGER, usePhoneLayout } from "@/components/website-builder/field-popover"

/**
 * ===========================================================================
 *  CHOOSING AN ICON
 * ===========================================================================
 * `type: "icon"` fields had no editor at all — they fell through to whatever
 * the last branch of FieldEditor happened to be — so the only way to change a
 * feature's icon was to know that the value is a kebab-case lucide name and
 * type one. And typing one that was not among the ten in the old map left you
 * with a lightning bolt and no way to tell why.
 *
 * The grid is the library, grouped, with a search box over it. Search is
 * shown only once there is enough to need it.
 */
export function IconPicker({
  value,
  onChange,
  allowNone = true,
}: {
  value: string
  onChange: (name: string) => void
  /** Some fields want "no icon" as an answer; a tab's icon does. */
  allowNone?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const phone = usePhoneLayout()
  const [query, setQuery] = React.useState("")

  const Current = ICON_MAP[value]
  const matches = React.useMemo(() => searchIcons(query), [query])
  const matched = React.useMemo(() => new Set(matches), [matches])

  const pick = (name: string) => {
    onChange(name)
    setOpen(false)
    setQuery("")
  }

  return (
    <FieldPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
      trigger={
        <button type="button" className={FIELD_TRIGGER} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
            {Current ? <Current className="h-4 w-4" strokeWidth={1.75} /> : <span className="text-[11px] text-muted-foreground">—</span>}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">{value || "No icon"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[rotate] duration-150", open && "rotate-180")} />
        </button>
      }
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          /* Not at a thumb: the keyboard would cover the list this panel
             just opened. Tapping the box still brings it up. */
          autoFocus={!phone}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons"
          className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* `data-sheet-scroll` so the phone sheet counts this when it measures
          how tall its content wants to be, rather than collapsing around it. */}
      <div data-sheet-scroll className="wb-slim-scroll max-h-[260px] overflow-y-auto overscroll-contain p-2">
        {allowNone && !query && (
          <button
            type="button"
            onClick={() => pick("")}
            className={cn(
              "mb-2 flex h-8 w-full items-center rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-muted",
              !value && "bg-muted font-medium",
            )}
          >
            No icon
          </button>
        )}

        {ICON_GROUPS.map((group) => {
          const names = group.names.filter((n) => matched.has(n))
          if (names.length === 0) return null
          return (
            <div key={group.label} className="mb-3 last:mb-0">
              {/* px-2, the same as the row above it, so every word in the panel starts at one x. */}
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-6 gap-1">
                {names.map((name) => {
                  const Icon = ICON_MAP[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      aria-label={name}
                      onClick={() => pick(name)}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted",
                        value === name && "bg-foreground text-background hover:bg-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {matches.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">Nothing matches “{query}”.</p>
        )}
      </div>
    </FieldPopover>
  )
}
