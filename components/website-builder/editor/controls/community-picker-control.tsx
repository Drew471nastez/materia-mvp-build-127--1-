"use client"

/**
 * The control for `community_picker`: which of the creator's own communities
 * a section shows. It holds the community's id; it lists the communities by
 * name, each saying when a visitor would not see it (a draft, a private
 * one), so the choice is made by recognising the community and nobody types
 * an id. While communities are switched off on Storelib it says so, and the
 * section draws nothing on the site.
 */
import { ChevronDown } from "lucide-react"

import { useEditorFieldEnv } from "./context"
import { NOTE, SELECT, TEXT_BUTTON } from "./styles"
import { tt } from "@/lib/i18n/text"

export function CommunityPickerControl({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const env = useEditorFieldEnv()
  const list = env?.communities
  const current = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (list === null) {
    return <p className={NOTE}>{tt("Communities are switched off on Storelib right now, so this section shows nothing on your site.")}</p>
  }
  const communities = list ?? []
  const picked = communities.find((c) => c.id.toLowerCase() === current)
  return (
    <div className="space-y-1">
      <div className="relative">
        <select aria-label={label} className={SELECT} value={picked ? picked.id : current} onChange={(e) => onChange(e.target.value)}>
          <option value="">{communities.length ? tt("Choose a community") : tt("No communities yet")}</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shows ? c.name : `${c.name} (${(c.why ?? "hidden").toLowerCase()})`}
            </option>
          ))}
          {current && !picked ? <option value={current}>{tt("Not one of yours")}</option> : null}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
      {picked && !picked.shows ? <p className={NOTE}>{tt("Visitors see this once {name} is published and public.", { name: picked.name })}</p> : null}
      {current && !picked ? <p className={NOTE}>{tt("This is not one of your communities, so the section shows nothing.")}</p> : null}
      {communities.length === 0 ? (
        <a href="/app/community" className={TEXT_BUTTON}>
          {tt("Create a community")}
        </a>
      ) : null}
    </div>
  )
}
