"use client"

/**
 * The product editor's Personalization card, for a product that ships: what
 * the buyer is asked when they buy it (lib/products/personalization.ts). A
 * name to engrave, a message for a card, a photo to print. Each field is a
 * label (shown exactly as typed, and the name the answer is kept under on
 * the order), a type (text, long text, photo upload), required or not, and
 * for text a character limit, a hint inside the box and a line under it.
 * The product page draws them above the buy buttons on every theme; the
 * answers reach the cart, the checkout, the order and the emails.
 */
import { Plus, X } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { MAX_ANSWER, MAX_HELP, MAX_LABEL, MAX_PERSONALIZATION_FIELDS, MAX_PLACEHOLDER, PERSONALIZATION_TYPES, blankField, cleanLabel, type PersonalizationField, type PersonalizationType } from "@/lib/products/personalization"
import { tt } from "@/lib/i18n/text"

const INPUT = "h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 sm:h-10 sm:text-[14px]"

const TYPE_NAME: Record<PersonalizationType, () => string> = { text: () => tt("Text"), multiline: () => tt("Long text"), image: () => tt("Photo upload") }

const TYPE_HINT: Record<PersonalizationType, () => string> = {
  text: () => tt("One line, like a name or initials."),
  multiline: () => tt("A few lines, like a message for a card."),
  image: () => tt("A photo the buyer uploads: JPG, PNG or WEBP, up to 10 MB."),
}

export function PersonalizationCard({ fields, onChange, cardClass, titleClass }: { fields: PersonalizationField[]; onChange: (next: PersonalizationField[]) => void; cardClass: string; titleClass: string }) {
  const set = (i: number, patch: Partial<PersonalizationField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const labels = fields.map((f) => cleanLabel(f.label).toLowerCase())
  return (
    <div className={cardClass} data-personalization-card="" id="personalization">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={titleClass}>{tt("Personalization")}</h2>
          <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">{tt("Ask buyers for a name, a message or a photo when they buy. You see their answers on the order.")}</p>
        </div>
        {fields.length < MAX_PERSONALIZATION_FIELDS ? (
          <button type="button" data-personalization-add="" onClick={() => onChange([...fields, blankField()])} className={cn(secondaryDepth, "h-10 shrink-0 rounded-[10px] px-3 text-[14px] sm:h-8 sm:rounded-lg sm:text-[13px]")}>
            <Plus className="h-4 w-4 text-[#6b7280]" />
            {tt("Add field")}
          </button>
        ) : null}
      </div>
      {fields.length > 0 ? (
        <ul className="mt-3 divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
          {fields.map((f, i) => {
            const name = f.label.trim() || tt("Field")
            const taken = !!labels[i] && labels.indexOf(labels[i]) !== i
            const problem = taken ? tt("Another field has this name") : /^_/.test(f.label.trim()) ? tt("A name cannot start with _") : null
            const text = f.type !== "image"
            return (
              <li key={f.id} className="space-y-2.5 p-3" data-personalization-field={f.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                  <input className={INPUT} value={f.label} maxLength={MAX_LABEL} placeholder={f.type === "image" ? tt("Your photo") : tt("Name to engrave")} aria-label={tt("Field name")} onChange={(e) => set(i, { label: e.target.value })} />
                  <select
                    aria-label={tt("{label} type", { label: name })}
                    value={f.type}
                    onChange={(e) => {
                      const type = e.target.value as PersonalizationType
                      set(i, type === "image" ? { type, maxLength: null, placeholder: "" } : { type })
                    }}
                    className={cn(INPUT, "col-span-2 row-start-2 cursor-pointer pr-8 sm:col-span-1 sm:row-start-auto")}
                  >
                    {PERSONALIZATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_NAME[t]()}
                      </option>
                    ))}
                  </select>
                  <button type="button" aria-label={tt("Remove {label}", { label: name })} onClick={() => onChange(fields.filter((_, j) => j !== i))} className="col-start-2 row-start-1 flex h-11 w-11 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f6f7f8] hover:text-[#b42318] sm:col-start-auto sm:row-start-auto sm:h-10 sm:w-10">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[12.5px] leading-5 text-[#9ca3af]">{TYPE_HINT[f.type]()}</p>
                {text ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                    <input className={INPUT} value={f.placeholder} maxLength={MAX_PLACEHOLDER} placeholder={tt("Hint inside the box (optional)")} aria-label={tt("{label} hint", { label: name })} onChange={(e) => set(i, { placeholder: e.target.value })} />
                    <input
                      className={INPUT}
                      inputMode="numeric"
                      value={f.maxLength ?? ""}
                      placeholder={tt("Limit: {n}", { n: MAX_ANSWER })}
                      aria-label={tt("{label} character limit", { label: name })}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 3)
                        set(i, { maxLength: digits ? Math.min(MAX_ANSWER, Math.max(1, Number(digits))) : null })
                      }}
                    />
                  </div>
                ) : null}
                <input className={INPUT} value={f.help} maxLength={MAX_HELP} placeholder={tt("A line under it for the buyer (optional)")} aria-label={tt("{label} help text", { label: name })} onChange={(e) => set(i, { help: e.target.value })} />
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#374151]">
                    <Switch checked={f.required} onCheckedChange={(v) => set(i, { required: v })} aria-label={tt("{label} is required", { label: name })} />
                    {tt("Required")}
                  </label>
                  {problem ? <span className="text-[12px] text-[#b42318]">{problem}</span> : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
