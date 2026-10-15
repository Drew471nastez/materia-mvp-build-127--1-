"use client"

/**
 * GAMIFICATION: points, levels and badges, off until the creator turns it
 * on. Members earn a point for each reaction their posts and comments get
 * (never from themselves), and points for courses and events; the levels
 * say how many points each step takes and what reaching it means. Badges
 * are given by hand from a member's row, as are extra points.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BadgeView, CommunityHead, LevelView } from "./view-types"
import { checkLevels } from "./logic"
import { Confirm, EditorCard, Notice, RemoveButton, Toggle, buttonPrimary, buttonSecondary, errorText, field, label, send, useToast } from "./parts"
import { tt } from "@/lib/i18n/text"

export function GamificationPanel({ head, levels: initialLevels, badges: initialBadges }: { head: CommunityHead; levels: LevelView[]; badges: BadgeView[] }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/gamification`
  const [enabled, setEnabled] = React.useState(head.gamificationEnabled)
  const [levels, setLevels] = React.useState(initialLevels.map((l) => ({ name: l.name, minPoints: String(l.minPoints), reward: l.reward ?? "" })))
  const [saved, setSaved] = React.useState(JSON.stringify(levels))
  const [badges, setBadges] = React.useState(initialBadges)
  const [badge, setBadge] = React.useState({ name: "", icon: "", description: "" })
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<BadgeView | null>(null)
  const dirty = JSON.stringify(levels) !== saved

  const toggle = async (on: boolean) => {
    setEnabled(on)
    const res = await send(base, "PATCH", { enabled: on })
    if (!res.ok) {
      setEnabled(!on)
      return toast(errorText(res.data.error))
    }
    toast(on ? tt("Points and levels are on") : tt("Points and levels are off"))
    router.refresh()
  }

  const saveLevels = async () => {
    const checked = checkLevels(levels)
    if (!checked.ok) return setError(checked.error)
    setBusy("levels")
    setError(null)
    const res = await send(base, "PATCH", { levels: checked.value })
    setBusy(null)
    if (!res.ok) return setError(errorText(res.data.error))
    setSaved(JSON.stringify(levels))
    toast(tt("Levels saved. Members moved to the level their points reach."))
  }

  const addBadge = async () => {
    if (!badge.name.trim()) return setError(tt("Give the badge a name."))
    setBusy("badge")
    setError(null)
    const res = await send<{ badge?: BadgeView }>(`${base}/badges`, "POST", badge)
    setBusy(null)
    if (!res.ok || !res.data.badge) return setError(errorText(res.data.error))
    setBadges((x) => [...x, res.data.badge as BadgeView])
    setBadge({ name: "", icon: "", description: "" })
    toast(tt("Badge added"))
  }

  const removeBadge = async () => {
    if (!deleting) return
    setBusy("delete")
    const res = await send(`${base}/badges/${deleting.id}`, "DELETE")
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    setBadges((x) => x.filter((b) => b.id !== deleting.id))
    setDeleting(null)
    toast(tt("Badge deleted"))
  }

  return (
    <div className="space-y-4" data-gamification="">
      <EditorCard>
        <Toggle checked={enabled} onChange={(v) => void toggle(v)} title={tt("Points and levels")} hint={tt("Members earn points when their posts and comments get reactions, and climb levels. A leaderboard shows in the community.")} />
      </EditorCard>

      <EditorCard title={tt("Levels")} hint={tt("How many points each level takes. Level 1 is where everyone starts.")} action={dirty ? <button type="button" onClick={() => void saveLevels()} disabled={busy === "levels"} className={buttonPrimary}>{busy === "levels" ? tt("Saving") : tt("Save levels")}</button> : null}>
        <ol className="space-y-2" data-levels="">
          {levels.map((l, i) => (
            <li key={i} className="grid grid-cols-[28px_1fr_92px_40px] items-center gap-2 sm:grid-cols-[28px_1fr_110px_1fr_40px]">
              <span className="text-[13px] font-semibold tabular-nums text-[#6b7280]">{i + 1}</span>
              <input aria-label={tt("Level {value} name", { value: i + 1 })} value={l.name} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 40) } : x)))} className={cn(field, "h-11 sm:h-10")} />
              <div className="relative">
                <input aria-label={tt("Points for level {value}", { value: i + 1 })} inputMode="numeric" disabled={i === 0} value={i === 0 ? "0" : l.minPoints} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, minPoints: e.target.value.replace(/\D/g, "").slice(0, 7) } : x)))} className={cn(field, "h-11 pr-8 tabular-nums sm:h-10")} />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#9ca3af]">{tt("pts")}</span>
              </div>
              <input aria-label={tt("What level {value} gives", { value: i + 1 })} value={l.reward} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, reward: e.target.value.slice(0, 200) } : x)))} placeholder={tt("What it gives (optional)")} className={cn(field, "hidden h-10 sm:block")} />
              {i > 0 && i === levels.length - 1 ? (
                <RemoveButton label={tt("Remove level {value}", { value: i + 1 })} onClick={() => setLevels(levels.slice(0, -1))} />
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
        {levels.length < 20 ? (
          <button type="button" onClick={() => setLevels([...levels, { name: "", minPoints: String((Number(levels[levels.length - 1]?.minPoints) || 0) * 2 || 10), reward: "" }])} className={cn(buttonSecondary, "self-start")}>
            <Plus aria-hidden className="h-4 w-4" />
            {tt("Add a level")}
          </button>
        ) : null}
      </EditorCard>

      <EditorCard title={tt("Badges")} hint={tt("Give them by hand from a member's row in Members.")}>
        {badges.length ? (
          <ul className="-my-1 divide-y divide-[#f1f2f4]" data-badges="">
            {badges.map((b) => (
              <li key={b.id} className="flex min-h-12 items-center gap-3 py-2">
                <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-[#f3f4f6] text-[18px]">
                  {b.icon || "🏅"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{b.name}</p>
                  <p className="truncate text-[12.5px] text-[#6b7280]">{[b.description, `${b.awarded} ${b.awarded === 1 ? tt("member has it") : tt("members have it")}`].filter(Boolean).join(" · ")}</p>
                </div>
                <RemoveButton label={tt("Delete {name}", { name: b.name })} onClick={() => setDeleting(b)} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid grid-cols-[64px_1fr] gap-2 sm:grid-cols-[64px_1fr_1.4fr_auto]">
          <div>
            <label htmlFor="b-icon" className={label}>
              {tt("Icon")}
            </label>
            <input id="b-icon" value={badge.icon} onChange={(e) => setBadge({ ...badge, icon: [...e.target.value].slice(-2).join("") })} placeholder="🏅" className={cn(field, "h-11 text-center text-[18px] sm:h-10")} />
          </div>
          <div>
            <label htmlFor="b-name" className={label}>
              {tt("Name")}
            </label>
            <input id="b-name" value={badge.name} onChange={(e) => setBadge({ ...badge, name: e.target.value.slice(0, 60) })} placeholder={tt("First win")} className={cn(field, "h-11 sm:h-10")} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="b-desc" className={label}>
              {tt("What it is for")}
            </label>
            <input id="b-desc" value={badge.description} onChange={(e) => setBadge({ ...badge, description: e.target.value.slice(0, 300) })} placeholder={tt("Optional")} className={cn(field, "h-11 sm:h-10")} />
          </div>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button type="button" onClick={() => void addBadge()} disabled={busy === "badge"} className={cn(buttonSecondary, "h-11 w-full sm:h-10 sm:w-auto")}>
              {busy === "badge" ? tt("Adding") : tt("Add badge")}
            </button>
          </div>
        </div>
      </EditorCard>
      {error ? <Notice>{error}</Notice> : null}
      <Confirm open={deleting !== null} onClose={() => setDeleting(null)} title={tt("Delete {value}?", { value: deleting?.name ?? tt("this badge") })} detail={tt("Members who have it lose it.")} action="Delete" danger busy={busy === "delete"} onConfirm={() => void removeBadge()} />
    </div>
  )
}
