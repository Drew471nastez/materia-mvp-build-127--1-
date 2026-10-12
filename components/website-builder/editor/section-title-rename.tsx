"use client"

/**
 * A section's name at the top of its settings, renamed where it is shown.
 * Hovering it shows a quiet pencil; a click turns it into a field. Enter or
 * leaving the field keeps the new name, Escape puts the old one back, and an
 * empty name goes back to what the section's code calls it. Raised over the
 * Back row's press area (components/website-builder/panel-back.tsx), so a
 * click on the name renames and a click on the arrow goes back.
 */
import * as React from "react"
import { Pencil } from "lucide-react"
import { tt } from "@/lib/i18n/text"

export function SectionTitleRename({ name, onRename }: { name: string; onRename: (next: string | null) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(name)
  const input = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])
  React.useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const done = (keep: boolean) => {
    setEditing(false)
    if (!keep) return setDraft(name)
    const next = draft.replace(/\s+/g, " ").trim().slice(0, 80)
    if (next === name) return
    onRename(next || null)
  }

  if (editing) {
    return (
      <input
        ref={input}
        data-section-rename=""
        aria-label={tt("Section name")}
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); done(true) }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false) }
        }}
        className="relative z-[1] h-8 w-full min-w-0 rounded-md border border-[#d1d5db] bg-white px-2 text-[15px] font-semibold text-[#1a1a2e] outline-none focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 md:h-7 md:text-sm"
      />
    )
  }
  return (
    <button
      type="button"
      data-section-title=""
      onClick={() => setEditing(true)}
      title={tt("Rename")}
      className="group/name relative z-[1] -ml-1 flex max-w-full min-w-0 cursor-text items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none transition-colors hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
    >
      <span className="truncate text-[15px] font-semibold md:text-sm">{name}</span>
      <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#9ca3af] opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100" />
    </button>
  )
}
