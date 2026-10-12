"use client"

/**
 * The product editor's Custom fields card: named details such as Material,
 * Care or Dimensions (lib/products/custom-fields.ts). Each field is a name,
 * a type (text, long text, number, link), its value, and whether buyers see
 * it under Details on the product page. The name becomes what a template
 * reads (`fields.material`, and `product.metafields.custom.material` in an
 * imported theme), shown quietly under it for whoever writes the theme.
 * A value that does not fit its type says so here, and Save says it too.
 */
import { Plus, X } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { FIELD_TYPES, FIELD_TYPE_LABEL, MAX_FIELDS, MAX_FIELD_VALUE, fieldKey, fieldProblem, type CustomField, type FieldType } from "@/lib/products/custom-fields"
import { tt } from "@/lib/i18n/text"

const INPUT = "h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 sm:h-10 sm:text-[14px]"

const PLACEHOLDER: Record<FieldType, string> = { get text() { return tt("Waxed cotton canvas") }, get multiline() { return tt("Machine wash cold.\nDry flat.") }, number: "42", url: "https://" }

export function CustomFieldsCard({ fields, onChange, cardClass, titleClass }: { fields: CustomField[]; onChange: (next: CustomField[]) => void; cardClass: string; titleClass: string }) {
  const set = (i: number, patch: Partial<CustomField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const keys = fields.map((f) => fieldKey(f.key))
  return (
    <div className={cardClass} data-custom-fields="" id="custom-fields">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={titleClass}>{tt("Custom fields")}</h2>
          <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">{tt("Details like material, care or size. Shown under Details on the product page, or used by your theme.")}</p>
        </div>
        {fields.length < MAX_FIELDS ? (
          <button type="button" onClick={() => onChange([...fields, { key: "", value: "", type: "text", show: true }])} className={cn(secondaryDepth, "h-10 shrink-0 rounded-[10px] px-3 text-[14px] sm:h-8 sm:rounded-lg sm:text-[13px]")}>
            <Plus className="h-4 w-4 text-[#6b7280]" />
            {tt("Add field")}
          </button>
        ) : null}
      </div>
      {fields.length > 0 ? (
        <ul className="mt-3 divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
          {fields.map((f, i) => {
            const key = keys[i]
            const type: FieldType = f.type ?? "text"
            const taken = !!key && keys.indexOf(key) !== i
            const problem = taken ? tt("Another field has this name") : f.value.trim() ? fieldProblem(f) : null
            const label = f.key.trim() || tt("Field")
            return (
              <li key={i} className="space-y-2.5 p-3" data-custom-field={key || i}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                  <div className="min-w-0">
                    <input className={INPUT} value={f.key} maxLength={40} placeholder={tt("Material")} aria-label={tt("Field name")} onChange={(e) => set(i, { key: e.target.value })} />
                  </div>
                  <select
                    aria-label={tt("{label} type", { label })}
                    value={type}
                    onChange={(e) => set(i, { type: e.target.value as FieldType })}
                    className={cn(INPUT, "col-span-2 row-start-2 cursor-pointer pr-8 sm:col-span-1 sm:row-start-auto")}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <button type="button" aria-label={tt("Remove {label}", { label })} onClick={() => onChange(fields.filter((_, j) => j !== i))} className="col-start-2 row-start-1 flex h-11 w-11 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f6f7f8] hover:text-[#b42318] sm:col-start-auto sm:row-start-auto sm:h-10 sm:w-10">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {type === "multiline" ? (
                  <textarea className={cn(INPUT, "h-auto min-h-[84px] resize-y py-2.5")} value={f.value} maxLength={MAX_FIELD_VALUE} placeholder={PLACEHOLDER[type]} aria-label={tt("{label} value", { label })} onChange={(e) => set(i, { value: e.target.value })} />
                ) : (
                  <input
                    className={INPUT}
                    value={f.value}
                    maxLength={MAX_FIELD_VALUE}
                    inputMode={type === "number" ? "decimal" : type === "url" ? "url" : undefined}
                    type={type === "url" ? "url" : "text"}
                    placeholder={PLACEHOLDER[type]}
                    aria-label={tt("{label} value", { label })}
                    onChange={(e) => set(i, { value: e.target.value })}
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#374151]">
                    <Switch checked={f.show !== false} onCheckedChange={(v) => set(i, { show: v })} aria-label={tt("Show {label} to buyers", { label })} />
                    {tt("Show on the product page")}
                  </label>
                  <span className={cn("text-[12px]", problem ? "text-[#b42318]" : "text-[#9ca3af]")}>{problem ?? (key ? `fields.${key}` : "")}</span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
