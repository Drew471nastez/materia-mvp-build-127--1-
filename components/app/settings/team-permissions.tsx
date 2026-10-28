"use client"

/**
 * ===========================================================================
 *  WHAT SOMEONE ON THE TEAM MAY DO (round 40)
 * ===========================================================================
 * The access picker of Settings › Team, for an invite and for changing a
 * member later: a preset first (Full access, Content editor, Support,
 * Custom), then every permission in its group, ticked by the preset and
 * changed one by one. Ticking by hand lands on whichever preset that is, or
 * Custom. A permission not open to the team yet is shown, unticked, and
 * says so; one the person giving access does not have themselves cannot be
 * given (lib/team/permissions grantable). The server checks both again.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import {
  PERMISSION_HINT,
  PERMISSION_LABEL,
  PRESET_LABEL,
  TEAM_PRESETS,
  normalizePermissions,
  permissionGroups,
  presetOf,
  presetPermissions,
  type TeamPermission,
  type TeamPreset,
} from "@/lib/team/permissions"

export function PermissionPicker({
  value,
  onChange,
  grant,
  open,
  disabled,
  idPrefix,
}: {
  value: TeamPermission[]
  onChange: (next: TeamPermission[]) => void
  /** What the person giving access may give. */
  grant: readonly TeamPermission[]
  /** What is open to the team today (the server's list). */
  open: readonly TeamPermission[]
  disabled?: boolean
  idPrefix: string
}) {
  const preset = presetOf(value)
  /* Custom stays chosen while it is being ticked, even when the ticks happen to make a preset. */
  const [customChosen, setCustomChosen] = React.useState(preset === "custom")
  const shown: TeamPreset = customChosen ? "custom" : preset
  const usable = (p: TeamPermission) => open.includes(p) && grant.includes(p)
  /* A preset only offers what this person can give: Full access from a member with Team is their own access, not more. */
  const presetValue = (p: TeamPreset) => presetPermissions(p).filter(usable)

  const choosePreset = (p: TeamPreset) => {
    setCustomChosen(p === "custom")
    if (p !== "custom") onChange(presetValue(p))
  }
  const toggle = (p: TeamPermission, on: boolean) => {
    const next = normalizePermissions(on ? [...value, p] : value.filter((x) => x !== p))
    setCustomChosen(presetOf(next) === "custom")
    onChange(next)
  }

  return (
    <div className="space-y-4" data-team-permissions="">
      <div role="radiogroup" aria-label={tt("Access")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TEAM_PRESETS.map((p) => {
          const empty = p !== "custom" && presetValue(p).length === 0
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={shown === p}
              disabled={disabled || empty}
              onClick={() => choosePreset(p)}
              data-team-preset={p}
              className={cn(
                "h-10 rounded-xl border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 disabled:cursor-not-allowed disabled:opacity-50",
                shown === p ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]",
              )}
            >
              {PRESET_LABEL[p]}
            </button>
          )
        })}
      </div>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {permissionGroups().map((g) => (
          <fieldset key={g.id} className="min-w-0">
            <legend className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">{g.label}</legend>
            <ul className="space-y-0.5">
              {g.keys.map((p) => {
                const id = `${idPrefix}-${p}`
                const can = usable(p)
                const checked = can && value.includes(p)
                const why = !open.includes(p) ? tt("Not open to the team yet") : !grant.includes(p) ? tt("Only the owner can give this") : PERMISSION_HINT[p]
                return (
                  <li key={p}>
                    <label htmlFor={id} className={cn("flex items-start gap-2.5 rounded-lg px-1 py-1.5", can && !disabled ? "cursor-pointer hover:bg-[#f8f9fa]" : "cursor-not-allowed")} data-team-permission={p}>
                      <input
                        id={id}
                        type="checkbox"
                        className="mt-[3px] h-4 w-4 shrink-0 accent-[#1a1a2e] disabled:opacity-50"
                        checked={checked}
                        disabled={disabled || !can}
                        onChange={(e) => toggle(p, e.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className={cn("block text-[14px] leading-5", can ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{PERMISSION_LABEL[p]}</span>
                        <span className={cn("block text-[12.5px] leading-[18px]", can ? "text-[#6b7280]" : "text-[#9ca3af]")}>{why}</span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  )
}
