"use client"

/**
 * The control for `link_list`: which of the site's menus a section shows.
 * The header's own links are always there as Main menu; the rest are the
 * menus made in Theme settings › Menus, which is one tap away from here
 * because a menu is usually picked by somebody who is about to change it.
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
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const env = useEditorFieldEnv()
  const menus = env?.menus ?? {}
  const handles = Object.keys(menus).sort((a, b) => (a === MAIN_MENU ? -1 : b === MAIN_MENU ? 1 : menus[a].title.localeCompare(menus[b].title)))
  const current = typeof value === "string" ? value : ""
  const missing = current !== "" && !menus[current]
  const picked = menus[current]
  return (
    <div className="space-y-1">
      <div className="relative">
        <select aria-label={label} className={SELECT} value={current} onChange={(e) => onChange(e.target.value)}>
          <option value="">No menu</option>
          {handles.map((h) => (
            <option key={h} value={h}>
              {h === MAIN_MENU ? `${menus[h].title} (the header's links)` : menus[h].title}
            </option>
          ))}
          {missing && <option value={current}>{current} (not made yet)</option>}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className={NOTE}>
          {missing
            ? "No menu has this name yet, so the section shows none."
            : picked
              ? `${picked.links.length} ${picked.links.length === 1 ? "link" : "links"}`
              : ""}
        </p>
        {env?.openMenus && (
          /* -mr-1.5 pulls its padding back, so the words end on the field's right edge, as the note beside it starts on its left. */
          <button type="button" className={cn(TEXT_BUTTON, "-mr-1.5")} onClick={env.openMenus}>
            Edit menus
          </button>
        )}
      </div>
    </div>
  )
}
