"use client"

/**
 * ===========================================================================
 *  WHAT CAN BE DONE TO A MEMBER, IN ONE PLACE
 * ===========================================================================
 * The Members list, Moderation's Restricted list and each report's author
 * menu all act on people the same way, through this hook:
 *
 *   which      memberChoices (./logic), the same rules the server applies
 *              (can() and never on somebody ranked the same or above)
 *   where      PATCH /api/app/community/<id>/members/<userId> for mute,
 *              unmute, suspend, unsuspend, ban, unban, remove, reinstate,
 *              approve, reject, role, feature and unfeature;
 *              POST .../members for complimentary access;
 *              POST .../gamification/points and .../badges/<id> for points
 *              and badges
 *   asking     a confirmation with an optional reason (kept in the audit
 *              log) before a decline, a suspension, a removal or a ban, and
 *              before each undo, which says what the person gets back (and
 *              that a paid tier nobody pays for comes back as free); a
 *              small sheet to pick how long a mute lasts
 *
 * `onDone` hears every change, so the list it came from can read itself
 * again.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { Role } from "@/lib/communities/types"
import type { BadgeView, CommunityHead, MemberActionTaken } from "./view-types"
import { MUTE_CHOICES, memberChoices, memberConfirmText, memberDoneText, type MemberChoice } from "./logic"
import { Confirm, Dialog, Notice, Segmented, SelectField, buttonPrimary, buttonSecondary, errorText, field, label, send, useToast } from "./parts"
import { tt } from "@/lib/i18n/text"

export interface ActOnPerson {
  userId: string
  name: string
  role: Role
  status: string
  source: string
  mutedUntil: string | null
  approved?: boolean
  /** The community features them (round 34): the menu then offers Stop featuring. */
  featured?: boolean
  points?: number
  /** Who took their access away, when and why: what the undo's rank rule reads. */
  acted?: MemberActionTaken | null
}

type Open =
  | { kind: "confirm"; person: ActOnPerson; choice: MemberChoice }
  | { kind: "mute"; person: ActOnPerson }
  | { kind: "comp"; person: ActOnPerson }
  | { kind: "points"; person: ActOnPerson }
  | { kind: "badge"; person: ActOnPerson }
  | null

/** A group of choices by its name in the reader's language (round 32: the menu and the member sheet showed the English key). */
const SECTION_TITLE: Record<string, string> = {
  get Role() { return tt("Role") },
  get Access() { return tt("Access") },
  get Points() { return tt("Points") },
  get Moderate() { return tt("Moderate") },
  get Recognise() { return tt("Recognise") },
}
export const sectionTitle = (key: string): string => SECTION_TITLE[key] ?? key

export function useMemberActions({ head, meId, tiers, badges, onDone }: { head: CommunityHead; meId: string; tiers: { id: string; name: string; kind: string }[]; badges: BadgeView[]; onDone: (choice: MemberChoice, person: ActOnPerson) => void }) {
  const toast = useToast()
  const base = `/api/app/community/${head.id}`
  const [open, setOpen] = React.useState<Open>(null)
  const [busy, setBusy] = React.useState(false)

  const choicesFor = React.useCallback(
    (p: ActOnPerson) => memberChoices({ userId: meId, role: head.role, can: head.can, gamification: head.gamificationEnabled, badges: badges.length }, p),
    [meId, head.role, head.can, head.gamificationEnabled, badges.length],
  )

  /** Sends one member action; true when it worked. */
  const patch = async (person: ActOnPerson, choice: MemberChoice, extra: Record<string, unknown> = {}) => {
    setBusy(true)
    const res =
      choice.action === "end_complimentary"
        ? await send(`${base}/members`, "POST", { action: "end_complimentary", userId: person.userId })
        : await send(`${base}/members/${person.userId}`, "PATCH", { action: choice.action, role: choice.role, ...extra })
    setBusy(false)
    if (!res.ok) {
      toast(errorText(res.data.error))
      return false
    }
    setOpen(null)
    toast(memberDoneText({ ...choice, hours: typeof extra.until === "number" ? extra.until : choice.hours }, person.name))
    onDone(choice, person)
    return true
  }

  /** What pressing a choice does: ask first, open its sheet, or send it. */
  const run = (choice: MemberChoice, person: ActOnPerson) => {
    if (choice.action === "mute") return setOpen({ kind: "mute", person })
    if (choice.action === "complimentary") return setOpen({ kind: "comp", person })
    if (choice.action === "points") return setOpen({ kind: "points", person })
    if (choice.action === "badge") return setOpen({ kind: "badge", person })
    if (choice.confirm) return setOpen({ kind: "confirm", person, choice })
    void patch(person, choice)
  }

  /** The row's menu: the choices as ActionMenuItems, a heading over each group. */
  const menuItems = (person: ActOnPerson, skip: string[] = []): ActionMenuItem[] => {
    let last: string | undefined
    return choicesFor(person)
      .filter((c) => !skip.includes(c.key))
      .map((c) => {
        const starts = c.section !== last
        last = c.section
        return { label: c.label, onClick: () => run(c, person), variant: c.danger ? "destructive" : undefined, section: starts && c.section ? sectionTitle(c.section) : undefined }
      })
  }

  const dialogs = (
    <>
      {open?.kind === "confirm" ? (
        <Confirm
          open
          onClose={() => setOpen(null)}
          {...(() => {
            const t = memberConfirmText(open.choice, open.person.name, { source: open.person.source })
            return { title: t.title, detail: t.detail, action: t.verb }
          })()}
          danger={open.choice.danger}
          busy={busy}
          reason={open.choice.action !== "reject"}
          onConfirm={(reason) => void patch(open.person, open.choice, { reason: reason || undefined })}
        />
      ) : null}
      {open?.kind === "mute" ? <MuteDialog name={open.person.name} busy={busy} onClose={() => setOpen(null)} onMute={(hours, reason) => void patch(open.person, { key: "mute", label: tt("Mute"), action: "mute", hours }, { until: hours, reason: reason || undefined })} /> : null}
      {open?.kind === "comp" ? <CompDialog base={base} tiers={tiers} person={open.person} onClose={() => setOpen(null)} onDone={() => { setOpen(null); toast(tt("Complimentary access given")); onDone({ key: "comp", label: "", action: "complimentary" }, open.person) }} /> : null}
      {open?.kind === "points" ? <PointsDialog base={base} person={open.person} onClose={() => setOpen(null)} onDone={(n) => { setOpen(null); toast(tt("{value}{n} points for {name}", { value: n > 0 ? "+" : "", n, name: open.person.name })); onDone({ key: "points", label: "", action: "points" }, open.person) }} /> : null}
      {open?.kind === "badge" ? <BadgeDialog base={base} badges={badges} person={open.person} onClose={() => setOpen(null)} onDone={(b) => { setOpen(null); toast(tt("{b} given to {name}", { b, name: open.person.name })) }} /> : null}
    </>
  )

  return { choicesFor, run, menuItems, dialogs, busy }
}

/* ── The sheets ─────────────────────────────────────────────────────────── */

function MuteDialog({ name, busy, onClose, onMute }: { name: string; busy: boolean; onClose: () => void; onMute: (hours: number, reason: string) => void }) {
  const [hours, setHours] = React.useState<string>("24")
  const [reason, setReason] = React.useState("")
  return (
    <Dialog
      open
      onClose={onClose}
      title={tt("Mute {name}", { name })}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {tt("Cancel")}
          </button>
          <button type="button" disabled={busy} onClick={() => onMute(Number(hours), reason)} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-mute-confirm="">
            {busy ? tt("Working") : tt("Mute")}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] leading-snug text-[#4b5563]">{tt("They can read everything but cannot post, comment, react or chat until it ends.")}</p>
      <Segmented value={hours} onChange={setHours} label={tt("How long")} className="w-full" options={MUTE_CHOICES.map((c) => ({ value: String(c.hours), label: c.label }))} />
      <div className="mt-3">
        <label htmlFor="mute-reason" className={label}>
          {tt("Reason (kept in the audit log)")}
        </label>
        <input id="mute-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder={tt("Optional")} className={cn(field, "h-11 sm:h-10")} />
      </div>
    </Dialog>
  )
}

function CompDialog({ base, tiers, person, onClose, onDone }: { base: string; tiers: { id: string; name: string; kind: string }[]; person: ActOnPerson; onClose: () => void; onDone: () => void }) {
  const [tier, setTier] = React.useState(tiers.find((t) => t.kind === "paid")?.id ?? tiers[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    const res = await send(`${base}/members`, "POST", { action: "complimentary", userId: person.userId, tierId: tier })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onDone()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={tt("Complimentary access for {name}", { name: person.name })}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {tt("Cancel")}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !tier} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? tt("Working") : tt("Give access")}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] leading-snug text-[#4b5563]">{tt("They get this tier without paying, until you end it.")}</p>
      <label htmlFor="comp-tier" className={label}>
        {tt("Tier")}
      </label>
      {/* Round 32: the app's own pick (a dropdown on a computer, the shared sheet on a phone), never the browser's select. */}
      <SelectField id="comp-tier" name="comp-tier" title={tt("Tier")} value={tier} onChange={setTier} options={tiers.map((t) => ({ value: t.id, label: t.name }))} />
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </Dialog>
  )
}

function PointsDialog({ base, person, onClose, onDone }: { base: string; person: ActOnPerson; onClose: () => void; onDone: (n: number) => void }) {
  const [points, setPoints] = React.useState("10")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    const n = Number(points)
    const res = await send(`${base}/gamification/points`, "POST", { userId: person.userId, points: n, note })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onDone(n)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={tt("Points for {name}", { name: person.name })}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {tt("Cancel")}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? tt("Working") : tt("Give points")}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-[#6b7280]">{typeof person.points === "number" ? tt("They have {points} now. ", { points: person.points }) : ""}{tt("A negative number takes points away.")}</p>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <div>
          <label htmlFor="pts-n" className={label}>
            {tt("Points")}
          </label>
          <input id="pts-n" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, "").slice(0, 6))} className={cn(field, "h-11 tabular-nums sm:h-10")} />
        </div>
        <div>
          <label htmlFor="pts-note" className={label}>
            {tt("What for")}
          </label>
          <input id="pts-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder={tt("Optional")} className={cn(field, "h-11 sm:h-10")} />
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </Dialog>
  )
}

function BadgeDialog({ base, badges, person, onClose, onDone }: { base: string; badges: BadgeView[]; person: ActOnPerson; onClose: () => void; onDone: (name: string) => void }) {
  const [badge, setBadge] = React.useState(badges[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    const res = await send(`${base}/gamification/badges/${badge}`, "POST", { userId: person.userId, on: true })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onDone(badges.find((b) => b.id === badge)?.name ?? tt("Badge"))
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={tt("A badge for {name}", { name: person.name })}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {tt("Cancel")}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !badge} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? tt("Working") : tt("Give badge")}
          </button>
        </>
      }
    >
      <ul className="space-y-1">
        {badges.map((b) => (
          <li key={b.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-[#f7f7f8]">
              <input type="radio" name="badge" checked={badge === b.id} onChange={() => setBadge(b.id)} className="h-4 w-4 accent-[#1a1a2e]" />
              <span className="text-[18px] leading-none">{b.icon || "🏅"}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{b.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </Dialog>
  )
}
