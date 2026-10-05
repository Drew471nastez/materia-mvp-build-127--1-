"use client"

import * as React from "react"
import { Ban, ChevronDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_GROUPS, searchIcons } from "@/lib/website-builder/icon-library"
import { ICON_MAP } from "@/components/website-builder/sections/icon-map"
import { FieldPopover, FIELD_TRIGGER, usePhoneLayout } from "@/components/website-builder/field-popover"

/**
 * ===========================================================================
 *  CHOOSING AN ICON
 * ===========================================================================
 * `type: "icon"` fields had no editor at all, so the only way to change a
 * feature's icon was to know that the value is a kebab-case lucide name and
 * type one.
 *
 * REDRAWN TO LOOK LIKE THE REST OF STORELIB'S PICKERS, not like a generated
 * grid: the owner read the old one (a black square on the chosen icon,
 * shouting group headings, "shopping-bag" written out as code) as "AI".
 *
 *   The field     the icon on a small white tile with a hairline and a touch
 *                 of depth, and its name in words: "Shopping bag".
 *   The panel     a search box, then the groups as a row of chips to narrow
 *                 the grid, then the grid. The chosen icon sits on the soft
 *                 grey the sidebar uses for a selected row, never black.
 *                 "No icon" is the first tile, so it is a choice like the
 *                 others rather than a row of its own.
 *   On a phone    the app's own bottom sheet (FieldPopover `float`), with its
 *                 pill, not a panel pushed into the sidebar.
 */

/** "shopping-bag" → "Shopping bag", "building2" → "Building". The stored value stays the kebab name. */
export function iconLabel(name: string): string {
  const words = name.replace(/\d+$/, "").split("-").filter(Boolean)
  if (!words.length) return name
  const text = words.join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const TILE =
  "flex h-10 items-center justify-center rounded-[10px] text-[#374151] transition-[background-color,box-shadow,scale] duration-150 hover:bg-[#f3f4f6] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15"
const TILE_ON = "bg-[#ebecef] text-[#111827] shadow-[inset_0_0_0_1px_#d4d7dd] hover:bg-[#ebecef]"

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
  const [group, setGroup] = React.useState<string | null>(null)

  const Current = ICON_MAP[value]
  const matches = React.useMemo(() => searchIcons(query), [query])
  const matched = React.useMemo(() => new Set(matches), [matches])
  /* Searching looks through every group: somebody typing "cart" should not have to know it is under Commerce. */
  const searching = query.trim() !== ""
  const groups = searching || !group ? ICON_GROUPS : ICON_GROUPS.filter((g) => g.label === group)

  const close = () => {
    setOpen(false)
    setQuery("")
    setGroup(null)
  }
  const pick = (name: string) => {
    onChange(name)
    close()
  }

  const search = (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#eceef1] px-3 py-2.5" data-icon-search="">
      <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" strokeWidth={2} />
      <input
        /* Not at a thumb: the keyboard would cover the grid this sheet just opened. */
        autoFocus={!phone}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons"
        aria-label="Search icons"
        className="h-7 w-full bg-transparent text-[14px] text-[#111827] outline-none placeholder:text-[#9ca3af] max-sm:text-[16px]"
      />
    </div>
  )

  return (
    <FieldPopover
      open={open}
      float
      sheetLabel="Choose an icon"
      sheetHeader={search}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      trigger={
        <button type="button" className={FIELD_TRIGGER} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} data-icon-trigger="">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-[#e5e7eb] bg-white text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
            {Current ? <Current className="h-3.5 w-3.5" strokeWidth={1.9} /> : <Ban className="h-3 w-3 text-[#9ca3af]" strokeWidth={2} />}
          </span>
          <span className={cn("min-w-0 flex-1 truncate", value ? "text-foreground" : "text-muted-foreground")}>{value ? iconLabel(value) : "No icon"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[rotate] duration-150", open && "rotate-180")} />
        </button>
      }
    >
      {/* At a computer the search box is part of the panel; on a phone the sheet carries it at the top. */}
      {!phone && search}

      {!searching && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-1 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-icon-groups="">
          {[null, ...ICON_GROUPS.map((g) => g.label)].map((label) => {
            const on = group === label
            return (
              <button
                key={label ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(label)}
                className={cn(
                  "h-7 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors max-sm:h-8 max-sm:text-[13.5px]",
                  on ? "bg-[#111827] text-white" : "bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e9eaee]",
                )}
              >
                {label ?? "All"}
              </button>
            )
          })}
        </div>
      )}

      {/* `data-sheet-scroll` so the phone sheet counts this when it measures how tall its content wants to be. */}
      <div data-sheet-scroll className="wb-slim-scroll max-h-[300px] overflow-y-auto overscroll-contain px-3 pb-3 pt-2 max-sm:max-h-none">
        {groups.map((g, gi) => {
          const names = g.names.filter((n) => matched.has(n))
          const none = allowNone && !searching && gi === 0
          if (names.length === 0 && !none) return null
          return (
            <div key={g.label} className="mb-3 last:mb-0" data-icon-group={g.label}>
              {(searching || !group) && <p className="mb-1 text-[12px] font-medium text-[#6b7280]">{g.label}</p>}
              <div className="grid grid-cols-6 gap-1 max-sm:grid-cols-6">
                {none && (
                  <button type="button" title="No icon" aria-label="No icon" aria-pressed={!value} onClick={() => pick("")} className={cn(TILE, !value && TILE_ON)} data-icon-none="">
                    <Ban className="h-4 w-4 text-[#9ca3af]" strokeWidth={1.75} />
                  </button>
                )}
                {names.map((name) => {
                  const Icon = ICON_MAP[name]
                  const on = value === name
                  return (
                    <button key={name} type="button" title={iconLabel(name)} aria-label={iconLabel(name)} aria-pressed={on} onClick={() => pick(name)} className={cn(TILE, on && TILE_ON)}>
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {matches.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-[#6b7280]">Nothing matches “{query.trim()}”.</p>
        )}
      </div>
    </FieldPopover>
  )
}
