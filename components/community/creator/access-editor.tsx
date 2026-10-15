"use client"

/**
 * WHO MAY SEE A SPACE, A COURSE OR AN EVENT, as the creator sets it: every
 * member, or members on some tiers, and on top of that a level they must
 * have reached. The rule is evaluated by lib/communities/access.ts (and for
 * chat by the same rule in SQL); owners, admins and moderators always see
 * everything, so the editor does not offer roles.
 */
import type { AccessRuleJson } from "@/lib/communities/types"
import type { RuleOptions } from "./view-types"
import { CheckRow, SelectField, label } from "./parts"
import { tt } from "@/lib/i18n/text"

export function describeRule(rule: AccessRuleJson, options: RuleOptions): string {
  const tiers = (rule.tierIds ?? []).map((id) => options.tiers.find((t) => t.id === id)?.name).filter(Boolean) as string[]
  const level = rule.minLevel ? options.levels.find((l) => l.level === rule.minLevel) : null
  const parts: string[] = []
  parts.push(tiers.length ? tiers.join(", ") : tt("Every member"))
  if (rule.minLevel) parts.push(level ? tt("level {minLevel} ({name}) and up", { minLevel: rule.minLevel, name: level.name }) : tt("level {minLevel} and up", { minLevel: rule.minLevel }))
  return parts.join(", ")
}

export function AccessEditor({ value, onChange, options, idPrefix }: { value: AccessRuleJson; onChange: (v: AccessRuleJson) => void; options: RuleOptions; idPrefix: string }) {
  const tierIds = value.tierIds ?? []
  const everyone = tierIds.length === 0
  const toggle = (id: string) => {
    const next = tierIds.includes(id) ? tierIds.filter((x) => x !== id) : [...tierIds, id]
    onChange({ ...value, tierIds: next.length ? next : undefined })
  }
  return (
    <div className="space-y-3" data-access-editor="">
      {options.tiers.length > 1 ? (
        <fieldset>
          <legend className={label}>{tt("Who can see it")}</legend>
          <div className="space-y-0.5">
            <CheckRow checked={everyone} onChange={() => onChange({ ...value, tierIds: undefined })} title={tt("Every member")} />
            {options.tiers.map((t) => (
              <CheckRow key={t.id} checked={tierIds.includes(t.id)} onChange={() => toggle(t.id)} title={tt("Members on {name}", { name: t.name })} />
            ))}
          </div>
        </fieldset>
      ) : null}
      {options.levels.length > 1 ? (
        <div>
          <label htmlFor={`${idPrefix}-level`} className={label}>
            {tt("From level")}
          </label>
          <SelectField
            id={`${idPrefix}-level`}
            name="access-level"
            title={tt("From level")}
            value={String(value.minLevel ?? 1)}
            onChange={(v) => onChange({ ...value, minLevel: Number(v) > 1 ? Number(v) : undefined })}
            options={options.levels.map((l) => ({ value: String(l.level), label: l.level === 1 ? tt("Any level") : tt("Level {level}, {name}", { level: l.level, name: l.name }) }))}
          />
        </div>
      ) : null}
      {options.tiers.length <= 1 && options.levels.length <= 1 ? <p className="text-[13px] text-[#6b7280]">{tt("Every member can see it.")}</p> : null}
    </div>
  )
}
