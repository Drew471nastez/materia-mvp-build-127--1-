"use client"

/**
 * The product editor's Custom fields card: named values a website section
 * can print, such as Material or Care (lib/products/custom-fields.ts). A row
 * is a name and a value; the name becomes what a template reads, shown under
 * it so a theme author knows to write `fields.material`.
 */
import { Plus, X } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { MAX_FIELDS, MAX_FIELD_VALUE, fieldKey, type CustomField } from "@/lib/products/custom-fields"

const INPUT = "h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 sm:h-10 sm:text-[14px]"

export function CustomFieldsCard({ fields, onChange, cardClass, titleClass }: { fields: CustomField[]; onChange: (next: CustomField[]) => void; cardClass: string; titleClass: string }) {
  const set = (i: number, patch: Partial<CustomField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const keys = fields.map((f) => fieldKey(f.key))
  return (
    <div className={cardClass} data-custom-fields="">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={titleClass}>Custom fields</h2>
          <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">Details your website can show, such as material or care.</p>
        </div>
        {fields.length < MAX_FIELDS ? (
          <button type="button" onClick={() => onChange([...fields, { key: "", value: "" }])} className={cn(secondaryDepth, "h-10 shrink-0 rounded-[10px] px-3 text-[14px] sm:h-8 sm:rounded-lg sm:text-[13px]")}>
            <Plus className="h-4 w-4 text-[#6b7280]" />
            Add field
          </button>
        ) : null}
      </div>
      {fields.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {fields.map((f, i) => {
            const key = keys[i]
            const taken = !!key && keys.indexOf(key) !== i
            return (
              <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-start">
                <div>
                  <input className={INPUT} value={f.key} maxLength={40} placeholder="Material" aria-label="Field name" onChange={(e) => set(i, { key: e.target.value })} />
                  <p className={cn("mt-1 text-[12px]", taken ? "text-[#b42318]" : "text-[#9ca3af]")}>{taken ? "Another field has this name." : key ? `fields.${key}` : "A name"}</p>
                </div>
                <input className={INPUT} value={f.value} maxLength={MAX_FIELD_VALUE} placeholder="Waxed cotton canvas" aria-label={`${f.key || "Field"} value`} onChange={(e) => set(i, { value: e.target.value })} />
                <button type="button" aria-label={`Remove ${f.key || "field"}`} onClick={() => onChange(fields.filter((_, j) => j !== i))} className="flex h-11 w-11 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f6f7f8] hover:text-[#b42318] sm:h-10 sm:w-10">
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
