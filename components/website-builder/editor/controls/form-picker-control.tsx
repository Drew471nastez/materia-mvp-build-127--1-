"use client"

/**
 * The control for `form_picker`: which of the store's published forms a
 * section shows. It holds the form's id and lists the forms by title, so the
 * choice is made by recognising the form and nobody pastes a link. A form
 * that is not one of the store's, or no longer published, says so: the
 * section draws nothing for it on the site.
 *
 * Basic on purpose (round L4): L5 owns how it looks beside the other pickers.
 */
import { ChevronDown } from "lucide-react"

import { useEditorFieldEnv } from "./context"
import { NOTE, SELECT, TEXT_BUTTON } from "./styles"
import { tt } from "@/lib/i18n/text"

export function FormPickerControl({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const env = useEditorFieldEnv()
  const forms = env?.forms ?? []
  const current = typeof value === "string" ? value.trim().toLowerCase() : ""
  const picked = forms.find((f) => f.id.toLowerCase() === current)
  return (
    <div className="space-y-1">
      <div className="relative">
        <select aria-label={label} className={SELECT} value={picked ? picked.id : current} onChange={(e) => onChange(e.target.value)}>
          <option value="">{forms.length ? tt("Choose a form") : tt("No published forms yet")}</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.kind === "booking" ? `${f.title} (${tt("booking")})` : f.title}
            </option>
          ))}
          {current && !picked ? <option value={current}>{tt("Not one of yours")}</option> : null}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
      {current && !picked ? <p className={NOTE}>{tt("This form is not one of your published forms, so the section shows nothing.")}</p> : null}
      {forms.length === 0 ? (
        <a href="/app/contacts/forms" className={TEXT_BUTTON}>
          {tt("Make a form")}
        </a>
      ) : null}
    </div>
  )
}
