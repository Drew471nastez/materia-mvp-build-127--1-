"use client"

/**
 * The control for `link_list`: which of the store's menus a section shows.
 *
 * It was a bare select with a small "Edit" beside it, and Edit opened Theme
 * settings at General with Menus folded shut at the bottom of a long list.
 * Now it is one card, the way Shopify draws a menu setting: the menu's name
 * with its first links under it, so you can see what you picked without
 * opening anything, and a line under that, Edit menu, which opens that menu
 * in Navigation (its own panel; Back comes straight here).
 *
 * The name line is a native select drawn as the card, so a phone gets its
 * own picker and a keyboard gets the arrow keys. Main menu is always first:
 * it is the header's menu (lib/website-builder/main-menu.ts).
 *
 * `noneLabel: null` is for the header, which always shows a menu: its empty
 * value means the Main menu, so there is no "No menu" to offer.
 */
import { ChevronsUpDown, PencilLine } from "lucide-react"

import { cn } from "@/lib/utils"
import { MAIN_MENU } from "@/lib/website-builder/storefront-data"
import { useEditorFieldEnv } from "./context"
import { NOTE } from "./styles"

export function MenuPickerControl({
  value,
  onChange,
  label,
  noneLabel = "No menu",
}: {
  value: string
  onChange: (v: string) => void
  label?: string
  noneLabel?: string | null
}) {
  const env = useEditorFieldEnv()
  const menus = env?.menus ?? {}
  const handles = Object.keys(menus).sort((a, b) => (a === MAIN_MENU ? -1 : b === MAIN_MENU ? 1 : menus[a].title.localeCompare(menus[b].title)))
  if (noneLabel === null && !handles.includes(MAIN_MENU)) handles.unshift(MAIN_MENU)
  const raw = typeof value === "string" ? value : ""
  const current = noneLabel === null && !raw ? MAIN_MENU : raw
  const missing = current !== "" && current !== MAIN_MENU && !menus[current]
  const title = (h: string) => menus[h]?.title || (h === MAIN_MENU ? "Main menu" : h)
  const links = current && !missing ? (menus[current]?.links ?? []) : []
  const preview = links.length ? links.map((l) => l.title).join(", ") : current && !missing ? "No links yet" : ""
  const canEdit = !!env?.openMenus && !!current && !missing

  return (
    <div className="space-y-1" data-menu-picker="">
      <div className="overflow-hidden rounded-lg border border-border bg-white dark:bg-white/[0.04]">
        <div className="relative flex min-h-[52px] items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40 focus-within:bg-muted/40">
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px] font-medium max-sm:text-[15px]", current ? "text-foreground" : "text-muted-foreground")}>
              {current ? (missing ? `${current} (not made yet)` : title(current)) : noneLabel}
            </span>
            {preview && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground max-sm:text-[13px]" data-menu-preview="">{preview}</span>}
          </span>
          <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {/* The card is the select: transparent over it, so the platform's own list opens. */}
          <select
            aria-label={label ? `${label}: choose a menu` : "Choose a menu"}
            data-menu-select=""
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            value={current}
            onChange={(e) => onChange(e.target.value)}
          >
            {noneLabel !== null && <option value="">{noneLabel}</option>}
            {handles.map((h) => (
              <option key={h} value={h}>
                {title(h)}
              </option>
            ))}
            {missing && <option value={current}>{current} (not made yet)</option>}
          </select>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => env?.openMenus?.(current)}
            data-menu-edit=""
            className="flex h-9 w-full items-center gap-1.5 border-t border-border px-3 text-left text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:outline-none max-sm:h-11 max-sm:text-[14px]"
          >
            <PencilLine aria-hidden className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            Edit menu
          </button>
        )}
      </div>
      {missing && <p className={NOTE}>No menu has this name yet, so the section shows none.</p>}
    </div>
  )
}
