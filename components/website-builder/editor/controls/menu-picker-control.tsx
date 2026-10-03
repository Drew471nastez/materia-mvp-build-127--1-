"use client"

/**
 * The control for `link_list`: which of the site's menus a section shows,
 * and an Edit beside it that opens that menu in Menus, because a menu is
 * usually picked by somebody who is about to change it. Main menu is always
 * first: it is the header's menu (lib/website-builder/main-menu.ts).
 *
 * `noneLabel: null` is for the header, which always shows a menu: its empty
 * value means the Main menu, so there is no "No menu" to offer.
 */
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { MAIN_MENU } from "@/lib/website-builder/storefront-data"
import { useEditorFieldEnv } from "./context"
import { NOTE, SELECT, TEXT_BUTTON } from "./styles"

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
  return (
    <div className="space-y-1" data-menu-picker="">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <select aria-label={label} className={SELECT} value={current} onChange={(e) => onChange(e.target.value)}>
            {noneLabel !== null && <option value="">{noneLabel}</option>}
            {handles.map((h) => (
              <option key={h} value={h}>
                {title(h)}
              </option>
            ))}
            {missing && <option value={current}>{current} (not made yet)</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        {env?.openMenus && current && !missing && (
          <button type="button" className={cn(TEXT_BUTTON, "-mr-1.5 shrink-0")} onClick={() => env.openMenus?.(current)} data-menu-edit="">
            Edit
          </button>
        )}
      </div>
      {missing && <p className={NOTE}>No menu has this name yet, so the section shows none.</p>}
    </div>
  )
}
