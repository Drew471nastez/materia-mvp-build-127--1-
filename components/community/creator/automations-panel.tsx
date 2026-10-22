"use client"

/**
 * ===========================================================================
 *  SETTINGS > AUTOMATED MESSAGES (round 38, part 272)
 * ===========================================================================
 * The owner: "admins can send message automations inside their community, so
 * they can send people messages inside chats, and make sure they receive
 * those." One list of what the community sends by itself, each with when it
 * goes and how it is doing (sent, waiting, not sent), and one sheet to write
 * or change one:
 *
 *   WHEN     someone joins, a member reaches a level, some days after
 *            joining, a paid membership starts or is cancelled, or once:
 *            now or at a time, to everyone or to some (a level and up, a
 *            tier, joined in the last days)
 *   WHERE    into each member's messages, or into a channel
 *   FROM     the owner, an admin or a moderator: a real person on the team,
 *            so an answer reaches somebody
 *   WORDS    with {first_name}, {name}, {community} and {level} filled in;
 *            the sheet shows the message as one member reads it, and how
 *            many members a broadcast goes to, before anything is sent
 *
 * A row's menu pauses, resumes or deletes. Everything is read from and saved
 * to /api/app/community/<id>/chat/automations; sending is the server's
 * (lib/communities/server/chat-automations.ts), each member once.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { AUTOMATION_VARIABLES, renderAutomation, type AutomationSegment, type AutomationStatus, type AutomationTarget, type AutomationTrigger } from "@/lib/communities/chat-automations"
import type { CommunityHead } from "./view-types"
import { Confirm, Dialog, EditorCard, Notice, RowMenu, SelectField, Segmented, buttonPrimary, buttonSecondary, errorText, field, label, send, useToast } from "./parts"

interface Automation {
  id: string
  name: string
  trigger: AutomationTrigger
  triggerLevel: number | null
  triggerDays: number | null
  target: AutomationTarget
  spaceId: string | null
  senderId: string | null
  body: string
  segment: AutomationSegment
  status: AutomationStatus
  sendAt: string | null
  sent: number
  failed: number
  pending: number
  lastSentAt: string | null
  createdAt: string
}

interface Data {
  ready: boolean
  automations: Automation[]
  senders: { userId: string; name: string; role: string }[]
  channels: { id: string; name: string; slug: string }[]
  tiers: { id: string; name: string }[]
  chatEnabled: boolean
  canEdit: boolean
}

type Audience = "all" | "level" | "tier" | "recent"

interface Draft {
  id: string | null
  name: string
  trigger: AutomationTrigger
  triggerLevel: string
  triggerDays: string
  target: AutomationTarget
  spaceId: string
  senderId: string
  body: string
  audience: Audience
  minLevel: string
  tierId: string
  joinedWithinDays: string
  when: "now" | "later"
  date: string
  time: string
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function localParts(iso: string | null): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

function blank(senderId: string): Draft {
  const later = localParts(null)
  return { id: null, name: "", trigger: "join", triggerLevel: "3", triggerDays: "7", target: "dm", spaceId: "", senderId, body: "", audience: "all", minLevel: "2", tierId: "", joinedWithinDays: "30", when: "now", date: later.date, time: later.time }
}

function draftOf(a: Automation): Draft {
  const at = localParts(a.sendAt)
  const audience: Audience = a.segment.minLevel ? "level" : a.segment.tierId ? "tier" : a.segment.joinedWithinDays ? "recent" : "all"
  return {
    id: a.id,
    name: a.name,
    trigger: a.trigger,
    triggerLevel: String(a.triggerLevel ?? 3),
    triggerDays: String(a.triggerDays ?? 7),
    target: a.target,
    spaceId: a.spaceId ?? "",
    senderId: a.senderId ?? "",
    body: a.body,
    audience,
    minLevel: String(a.segment.minLevel ?? 2),
    tierId: a.segment.tierId ?? "",
    joinedWithinDays: String(a.segment.joinedWithinDays ?? 30),
    when: a.sendAt && Date.parse(a.sendAt) > Date.now() + 60_000 ? "later" : "now",
    date: at.date,
    time: at.time,
  }
}

/** What the sheet sends: the server checks it all again (lib/communities/chat-automations.ts automationInput). */
function payloadOf(d: Draft): Record<string, unknown> {
  const segment: AutomationSegment = {}
  if (d.trigger === "broadcast") {
    if (d.audience === "level") segment.minLevel = Number(d.minLevel)
    if (d.audience === "tier" && d.tierId) segment.tierId = d.tierId
    if (d.audience === "recent") segment.joinedWithinDays = Number(d.joinedWithinDays)
  }
  const sendAt = d.trigger === "broadcast" && d.when === "later" ? new Date(`${d.date}T${d.time || "09:00"}`).toISOString() : null
  return {
    name: d.name,
    trigger: d.trigger,
    triggerLevel: d.trigger === "level" ? Number(d.triggerLevel) : null,
    triggerDays: d.trigger === "days" ? Number(d.triggerDays) : null,
    target: d.target,
    spaceId: d.target === "channel" ? d.spaceId : null,
    senderId: d.senderId || null,
    body: d.body,
    segment,
    sendAt,
  }
}

function statusWord(a: Automation): string {
  switch (a.status) {
    case "paused":
      return tt("Paused")
    case "scheduled":
      return a.sendAt && Date.parse(a.sendAt) > Date.now() ? tt("Sends {when}", { when: new Date(a.sendAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) }) : tt("Sending")
    case "sending":
      return tt("Sending")
    case "done":
      return tt("Sent")
    default:
      return tt("On")
  }
}

/** One line for when a row sends, and where. */
function whenLine(a: Automation, channel: string | null): string {
  const when =
    a.trigger === "join"
      ? tt("When someone joins")
      : a.trigger === "level"
        ? tt("When a member reaches level {n}", { n: a.triggerLevel ?? 2 })
        : a.trigger === "days"
          ? a.triggerDays === 1
            ? tt("1 day after someone joins")
            : tt("{n} days after someone joins", { n: a.triggerDays ?? 7 })
          : a.trigger === "paid_start"
            ? tt("When a paid membership starts")
            : a.trigger === "paid_cancel"
              ? tt("When a paid membership is cancelled")
              : tt("Once")
  const where = a.target === "channel" ? tt("in #{channel}", { channel: channel ?? tt("a channel") }) : tt("in their messages")
  return `${when} · ${where}`
}

const TRIGGERS: { value: AutomationTrigger; get label(): string }[] = [
  { value: "join", get label() { return tt("When someone joins") } },
  { value: "level", get label() { return tt("When a member reaches a level") } },
  { value: "days", get label() { return tt("Some days after someone joins") } },
  { value: "paid_start", get label() { return tt("When a paid membership starts") } },
  { value: "paid_cancel", get label() { return tt("When a paid membership is cancelled") } },
  { value: "broadcast", get label() { return tt("Once, now or at a time") } },
]

export function AutomationsPanel({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const base = `/api/app/community/${head.id}/chat/automations`
  const [d, setD] = React.useState<Data | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [deleting, setDeleting] = React.useState<Automation | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const res = await send<Data>(base, "GET")
    if (!res.ok) return setFailed(true)
    setFailed(false)
    setD(res.data)
  }, [base])
  React.useEffect(() => {
    void load()
  }, [load])
  /* While something is going out, the counts follow it. */
  React.useEffect(() => {
    if (!d?.automations.some((a) => a.pending > 0 || a.status === "sending")) return
    const t = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(t)
  }, [d, load])

  if (failed) return <Notice>{tt("Automated messages did not load. Refresh the page.")}</Notice>
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" aria-label={tt("Loading")} />

  const owner = d.senders.find((s) => s.role === "owner") ?? d.senders[0]
  const act = async (a: Automation, action: "pause" | "resume" | "delete") => {
    setBusy(true)
    const res = await send(base, "POST", { action, id: a.id })
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setDeleting(null)
    toast(action === "delete" ? tt("Deleted") : action === "pause" ? tt("Paused") : tt("Turned on"))
    void load()
  }
  const channelName = (id: string | null) => d.channels.find((c) => c.id === id)?.name ?? null

  return (
    <div className="space-y-4" data-automations="">
      {!d.ready ? <Notice tone="warn">{tt("Automated messages need the database update for chat (run-now part 272).")}</Notice> : null}
      {d.ready && !d.chatEnabled ? <Notice tone="info">{tt("Chat is off in this community, so nothing is sent until it is on again.")}</Notice> : null}
      <EditorCard
        hint={tt("Sent by someone on the team into each member's messages, or into a channel. Each member gets each one once.")}
        action={
          d.canEdit && d.ready ? (
            <button type="button" className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} onClick={() => setDraft(blank(owner?.userId ?? ""))} data-automation-new="">
              {tt("New message")}
            </button>
          ) : null
        }
      >
        {d.automations.length ? (
          <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]" data-automation-list="">
            {d.automations.map((a) => {
              const items = d.canEdit
                ? [
                    ...(a.status !== "done" && !(a.trigger === "broadcast" && (a.status === "sending" || a.sent > 0)) ? [{ label: tt("Edit"), onClick: () => setDraft(draftOf(a)) }] : []),
                    ...(a.status === "paused" ? [{ label: tt("Turn on again"), onClick: () => void act(a, "resume") }] : a.status !== "done" ? [{ label: tt("Pause"), onClick: () => void act(a, "pause") }] : []),
                    { label: tt("Delete"), variant: "destructive" as const, onClick: () => setDeleting(a) },
                  ]
                : []
              return (
                <li key={a.id} className="flex items-start gap-3 px-3 py-3" data-automation={a.trigger}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{a.name}</p>
                    <p className="mt-0.5 text-[12.5px] leading-5 text-[#6b7280]">{whenLine(a, channelName(a.spaceId))}</p>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#4b5563] [overflow-wrap:anywhere]">{a.body}</p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-[12.5px] tabular-nums text-[#6b7280]" data-automation-counts="">
                      <span className={a.status === "paused" ? "font-medium text-[#92400e]" : "font-medium text-[#1a1a2e]"}>{statusWord(a)}</span>
                      {a.sent || a.status !== "scheduled" ? <span>{tt("{n} sent", { n: a.sent })}</span> : null}
                      {a.pending ? <span>{tt("{n} waiting", { n: a.pending })}</span> : null}
                      {a.failed ? <span className="text-[#b42318]">{tt("{n} not sent", { n: a.failed })}</span> : null}
                    </p>
                  </div>
                  <RowMenu items={items} label={tt("More for {name}", { name: a.name })} />
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-[#e1e3e7] px-4 py-6 text-center" data-automation-empty="">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Nothing is sent automatically yet")}</p>
            <p className="mx-auto mt-1 max-w-[420px] text-[13px] leading-5 text-[#6b7280]">{tt("A welcome for new members is a good first one. It arrives in their messages, from you, the moment they join.")}</p>
            {d.canEdit && d.ready ? (
              <button
                type="button"
                className={cn(buttonSecondary, "mt-3 h-10 px-4 sm:h-9")}
                onClick={() => setDraft({ ...blank(owner?.userId ?? ""), name: tt("Welcome"), body: tt("Hi {first_name}, welcome to {community}! Say hello in the chat and tell us what brought you here.") })}
              >
                {tt("Write a welcome")}
              </button>
            ) : null}
          </div>
        )}
      </EditorCard>
      <Editor
        base={base}
        data={d}
        communityName={head.name}
        draft={draft}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSaved={(sent) => {
          setDraft(null)
          toast(sent ? tt("Sending now") : tt("Saved"))
          void load()
        }}
      />
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={tt("Delete this automated message?")}
        detail={deleting?.pending ? tt("The {n} messages still waiting will not be sent. Messages already sent stay in members' chats.", { n: deleting.pending }) : tt("Messages already sent stay in members' chats.")}
        action={tt("Delete")}
        danger
        busy={busy}
        onConfirm={() => deleting && void act(deleting, "delete")}
      />
    </div>
  )
}

function Editor({ base, data, communityName, draft, onChange, onClose, onSaved }: { base: string; data: Data; communityName: string; draft: Draft | null; onChange: (d: Draft) => void; onClose: () => void; onSaved: (sentNow: boolean) => void }) {
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [audience, setAudience] = React.useState<number | null>(null)
  const open = !!draft
  React.useEffect(() => {
    if (open) setError(null)
  }, [open])
  /* How many a broadcast reaches, asked again a moment after its audience changes. */
  const key = draft && draft.trigger === "broadcast" && draft.target === "dm" ? `${draft.audience}:${draft.minLevel}:${draft.tierId}:${draft.joinedWithinDays}` : null
  React.useEffect(() => {
    if (!key || !draft) return setAudience(null)
    const t = window.setTimeout(async () => {
      const res = await send<{ audience: number | null }>(base, "POST", { action: "preview", ...payloadOf({ ...draft, name: draft.name || "Preview", body: draft.body || "Preview" }) }) // i18n-ignore
      setAudience(res.ok ? res.data.audience : null)
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, base])
  if (!draft) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const sender = data.senders.find((s) => s.userId === draft.senderId) ?? data.senders[0]
  const preview = renderAutomation(draft.body, { name: "Ana Silva", community: communityName, level: Number(draft.triggerLevel) || 3 })
  const broadcastNow = draft.trigger === "broadcast" && draft.when === "now"
  const save = async () => {
    setBusy(true)
    const res = await send(base, "POST", { action: draft.id ? "update" : "create", id: draft.id, ...payloadOf(draft) })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onSaved(broadcastNow && !draft.id)
  }
  const saveWord = draft.id ? tt("Save") : broadcastNow ? (draft.target === "dm" && audience !== null ? tt("Send to {n} members", { n: audience }) : tt("Send now")) : draft.trigger === "broadcast" ? tt("Schedule") : tt("Turn on")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={draft.id ? tt("Change automated message") : tt("New automated message")}
      footer={
        <>
          {error ? <p className="mr-auto text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
          <button type="button" className={cn(buttonSecondary, "h-10 px-4 sm:h-9")} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" disabled={busy || !draft.name.trim() || !draft.body.trim()} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} onClick={() => void save()} data-automation-save="">
            {busy ? tt("Working") : saveWord}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-automation-editor="">
        <div>
          <label htmlFor="auto-name" className={label}>
            {tt("Name")}
          </label>
          <input id="auto-name" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder={tt("Welcome")} className={cn(field, "h-11 sm:h-10")} />
          <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("Only the team sees it.")}</p>
        </div>
        <div>
          <label htmlFor="auto-trigger" className={label}>
            {tt("When it is sent")}
          </label>
          {draft.id ? (
            <p className="text-[14px] text-[#1a1a2e]">{TRIGGERS.find((t) => t.value === draft.trigger)?.label}</p>
          ) : (
            <SelectField id="auto-trigger" name="auto-trigger" title={tt("When it is sent")} value={draft.trigger} options={TRIGGERS.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => set({ trigger: v })} />
          )}
          {draft.trigger === "level" ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[13.5px] text-[#4b5563]">{tt("Level")}</span>
              <input type="number" inputMode="numeric" min={2} max={100} value={draft.triggerLevel} onChange={(e) => set({ triggerLevel: e.target.value })} className={cn(field, "h-11 w-[84px] text-center tabular-nums sm:h-10")} aria-label={tt("Level")} />
            </div>
          ) : null}
          {draft.trigger === "days" ? (
            <div className="mt-2 flex items-center gap-2">
              <input type="number" inputMode="numeric" min={1} max={365} value={draft.triggerDays} onChange={(e) => set({ triggerDays: e.target.value })} className={cn(field, "h-11 w-[84px] text-center tabular-nums sm:h-10")} aria-label={tt("Days after joining")} />
              <span className="text-[13.5px] text-[#4b5563]">{tt("days after they join")}</span>
            </div>
          ) : null}
          {draft.trigger === "days" ? <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("Members who joined before you turn this on are not sent it.")}</p> : null}
          {draft.trigger === "paid_start" || draft.trigger === "paid_cancel" ? <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("For memberships members pay for here.")}</p> : null}
        </div>

        {draft.trigger === "broadcast" ? (
          <div className="space-y-3 rounded-xl border border-[#eceef1] p-3" data-automation-broadcast="">
            {draft.target === "dm" ? (
              <div>
                <label htmlFor="auto-audience" className={label}>
                  {tt("Who gets it")}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-full sm:w-64">
                    <SelectField
                      id="auto-audience"
                      name="auto-audience"
                      title={tt("Who gets it")}
                      value={draft.audience}
                      options={[
                        { value: "all", label: tt("Every member") },
                        { value: "level", label: tt("Members from a level") },
                        ...(data.tiers.length ? [{ value: "tier" as const, label: tt("Members of a tier") }] : []),
                        { value: "recent", label: tt("Members who joined lately") },
                      ]}
                      onChange={(v) => set({ audience: v })}
                    />
                  </div>
                  {draft.audience === "level" ? <input type="number" inputMode="numeric" min={2} max={100} value={draft.minLevel} onChange={(e) => set({ minLevel: e.target.value })} className={cn(field, "h-11 w-[84px] text-center tabular-nums sm:h-10")} aria-label={tt("Level")} /> : null}
                  {draft.audience === "tier" ? (
                    <div className="w-full sm:w-56">
                      <SelectField name="auto-tier" title={tt("Tier")} value={draft.tierId || data.tiers[0]?.id || ""} options={data.tiers.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ tierId: v })} />
                    </div>
                  ) : null}
                  {draft.audience === "recent" ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[13.5px] text-[#4b5563]">{tt("in the last")}</span>
                      <input type="number" inputMode="numeric" min={1} max={3650} value={draft.joinedWithinDays} onChange={(e) => set({ joinedWithinDays: e.target.value })} className={cn(field, "h-11 w-[84px] text-center tabular-nums sm:h-10")} aria-label={tt("Days")} />
                      <span className="text-[13.5px] text-[#4b5563]">{tt("days")}</span>
                    </span>
                  ) : null}
                </div>
                {audience !== null ? (
                  <p className="mt-1.5 text-[12.5px] text-[#6b7280]" data-automation-audience={audience}>
                    {audience === 1 ? tt("1 member gets it now.") : tt("{n} members get it now.", { n: audience })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div>
              <p className={label}>{tt("Send")}</p>
              <Segmented
                label={tt("Send")}
                value={draft.when}
                onChange={(v) => set({ when: v })}
                options={[
                  { value: "now", label: tt("Now") },
                  { value: "later", label: tt("At a time") },
                ]}
              />
              {draft.when === "later" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className={cn(field, "h-11 w-auto sm:h-10")} aria-label={tt("Day")} />
                  <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} className={cn(field, "h-11 w-auto sm:h-10")} aria-label={tt("Time")} />
                </div>
              ) : null}
              <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{tt("It goes out in small batches, never twice to the same member.")}</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={label}>{tt("Where")}</p>
            <Segmented
              label={tt("Where")}
              value={draft.target}
              onChange={(v) => set({ target: v, spaceId: v === "channel" ? draft.spaceId || data.channels[0]?.id || "" : draft.spaceId })}
              options={[
                { value: "dm", label: tt("Their messages") },
                ...(data.channels.length ? [{ value: "channel" as const, label: tt("A channel") }] : []),
              ]}
            />
            {draft.target === "channel" ? (
              <div className="mt-2">
                <SelectField name="auto-channel" title={tt("Channel")} value={draft.spaceId || data.channels[0]?.id || ""} options={data.channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} onChange={(v) => set({ spaceId: v })} />
              </div>
            ) : null}
          </div>
          <div>
            <label htmlFor="auto-sender" className={label}>
              {tt("From")}
            </label>
            <SelectField id="auto-sender" name="auto-sender" title={tt("From")} value={sender?.userId ?? ""} options={data.senders.map((s) => ({ value: s.userId, label: s.role === "owner" ? tt("{name} (owner)", { name: s.name }) : s.name }))} onChange={(v) => set({ senderId: v })} />
            <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("Answers go to them.")}</p>
          </div>
        </div>

        <div>
          <label htmlFor="auto-body" className={label}>
            {tt("Message")}
          </label>
          <textarea id="auto-body" rows={5} value={draft.body} maxLength={4000} onChange={(e) => set({ body: e.target.value })} className={cn(field, "resize-y py-2.5 leading-relaxed")} data-automation-body="" />
          <p className="mt-1 text-[12.5px] leading-5 text-[#6b7280]">
            {tt("Filled in for each member:")} <span className="font-mono text-[12px] text-[#4b5563]">{AUTOMATION_VARIABLES.join("  ")}</span>
          </p>
        </div>

        {draft.body.trim() ? (
          <div data-automation-preview="">
            <p className={label}>{tt("How Ana reads it")}</p>
            <div className="rounded-xl bg-[#f7f7f8] p-3">
              <p className="mb-1 text-[12px] font-medium text-[#6b7280]">{sender?.name ?? communityName}</p>
              <p className="inline-block max-w-full whitespace-pre-line rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[14px] leading-5 text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06)] [overflow-wrap:anywhere]">{preview}</p>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
