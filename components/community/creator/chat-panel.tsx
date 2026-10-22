"use client"

/**
 * ===========================================================================
 *  SETTINGS > CHAT (round 37, round 38)
 * ===========================================================================
 * Everything about the community's chat in one panel, read from and saved to
 * /api/app/community/<id>/chat (parts 270 and 272):
 *
 *   Chat               the one switch (the same as Features > Chat), the Chat
 *                      tab beside Community and the channel it opens, and the
 *                      channels: each one's who can post (everyone, from a
 *                      level, the team only: an announcements channel), its
 *                      slow mode and its pinned message; adding, renaming and
 *                      ordering are in Spaces
 *   Messages           who can start a conversation (everyone, from a level,
 *                      after some days here, the team only, off), whether
 *                      members can message the team, who may start a group
 *   Pictures and       files in chat on or off for members, and whether a
 *   phones             phone's banner shows the words of a message
 *   Chat rules         shown to each member once, before their first message;
 *                      changed, everyone is asked again
 *   Kept out of chat   members muted or banned from chat only (they still
 *                      read the feed), with a way to let them back
 *
 * A switch or a pick saves when it changes; a number saves when the field is
 * left; the rules save with their bar. Messages the community sends by itself
 * are their own panel (./automations-panel.tsx).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChoicePicker } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SLOW_MODE_CHOICES, type ChannelPost, type DmPolicy } from "@/lib/communities/chat-rules"
import type { CommunityHead } from "./view-types"
import { Dialog, EditorCard, EditorFoot, Notice, SelectField, Segmented, Toggle, buttonSecondary, errorText, field, label, send, useToast } from "./parts"

interface Pinned {
  id: string
  authorName: string
  text: string
}

interface Channel {
  id: string
  name: string
  slug: string
  slowMode: number
  post: ChannelPost
  minLevel: number
  pinned: Pinned | null
}

interface ChatAdmin {
  ready: boolean
  ready272?: boolean
  chatEnabled: boolean
  settings: {
    dmPolicy: DmPolicy
    dmMinLevel: number
    dmMinDays: number
    dmToStaff: boolean
    groupsPolicy: "members" | "staff" | "off"
    attachmentsEnabled: boolean
    pushPreviews: boolean
    rules: string
    rulesVersion: number
    chatTab: boolean
    mainSpaceId: string | null
  }
  channels: Channel[]
  restricted: { userId: string; name: string; avatarUrl: string | null; chatMutedUntil: string | null; chatBannedAt: string | null; reason: string | null }[]
  canEdit: boolean
  canModerate: boolean
}

interface Found {
  userId: string
  name: string
  username: string | null
  role: string
}

function slowLabel(s: number): string {
  if (!s) return tt("Off")
  if (s < 60) return tt("{n} seconds", { n: s })
  if (s < 3600) return tt("{n} minutes", { n: s / 60 })
  return tt("1 hour")
}

/** A whole number field that saves when it is left, within its range. */
function NumberField({ id, value, min, max, onSave, disabled, suffix }: { id: string; value: number; min: number; max: number; onSave: (n: number) => void; disabled?: boolean; suffix?: string }) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(text))
    if (!Number.isFinite(n) || n < min || n > max) return setText(String(value))
    if (n !== value) onSave(n)
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
        className={cn(field, "h-11 w-[84px] text-center tabular-nums sm:h-10")}
      />
      {suffix ? <span className="text-[13.5px] text-[#4b5563]">{suffix}</span> : null}
    </span>
  )
}

export function ChatPanel({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const router = useRouter()
  const base = `/api/app/community/${head.id}/chat`
  const [d, setD] = React.useState<ChatAdmin | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [rules, setRules] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pinning, setPinning] = React.useState<Channel | null>(null)

  const load = React.useCallback(async () => {
    const res = await send<ChatAdmin>(base, "GET")
    if (!res.ok) return setFailed(true)
    setFailed(false)
    setD(res.data)
    setRules(res.data.settings.rules)
  }, [base])
  React.useEffect(() => {
    void load()
  }, [load])

  if (failed) return <Notice>{tt("Chat settings did not load. Refresh the page.")}</Notice>
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" aria-label={tt("Loading")} />

  const patch = async (body: Partial<ChatAdmin["settings"]>) => {
    const before = d
    setD({ ...d, settings: { ...d.settings, ...body } })
    const res = await send<{ settings: ChatAdmin["settings"] }>(base, "PATCH", body)
    if (!res.ok) {
      setD(before)
      return toast(errorText(res.data.error))
    }
    setD((cur) => (cur ? { ...cur, settings: res.data.settings } : cur))
    toast(tt("Saved"))
    /* The Chat tab and its channel are drawn by the community's frame: read again for the member side. */
    if ("chatTab" in body || "mainSpaceId" in body) router.refresh()
  }
  const flipChat = async (on: boolean) => {
    setD({ ...d, chatEnabled: on })
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { chatEnabled: on })
    if (!res.ok) {
      setD({ ...d, chatEnabled: !on })
      return toast(errorText(res.data.error))
    }
    toast(on ? tt("Turned on") : tt("Turned off"))
    router.refresh()
  }
  const channelChange = async (spaceId: string, next: Partial<Channel>, body: Record<string, unknown>) => {
    const before = d
    setD({ ...d, channels: d.channels.map((c) => (c.id === spaceId ? { ...c, ...next } : c)) })
    const res = await send(base, "POST", { spaceId, ...body })
    if (!res.ok) {
      setD(before)
      return toast(errorText(res.data.error))
    }
    toast(tt("Saved"))
  }
  const slow = (spaceId: string, seconds: number) => channelChange(spaceId, { slowMode: seconds }, { action: "slow_mode", seconds })
  const postRule = (c: Channel, post: ChannelPost, minLevel: number) => channelChange(c.id, { post, minLevel: post === "level" ? minLevel : 0 }, { action: "channel_post", post, minLevel })
  const pin = async (c: Channel, messageId: string | null) => {
    const res = await send<{ pinned: Pinned | null }>(base, "POST", { action: "pin", spaceId: c.id, messageId })
    if (!res.ok) return toast(errorText(res.data.error))
    setD((cur) => (cur ? { ...cur, channels: cur.channels.map((x) => (x.id === c.id ? { ...x, pinned: res.data.pinned ?? null } : x)) } : cur))
    setPinning(null)
    toast(messageId ? tt("Pinned") : tt("Unpinned"))
  }
  const saveRules = async () => {
    setBusy(true)
    const res = await send<{ settings: ChatAdmin["settings"] }>(base, "PATCH", { rules })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setError(null)
    setD((cur) => (cur ? { ...cur, settings: res.data.settings } : cur))
    setRules(res.data.settings.rules)
    toast(tt("Saved"))
  }
  const restrict = async (userId: string, mode: "mute" | "ban" | "clear", minutes?: number) => {
    const res = await send(base, "POST", { action: "restrict", userId, mode, minutes })
    if (!res.ok) return toast(errorText(res.data.error))
    toast(mode === "clear" ? tt("They can chat again") : mode === "ban" ? tt("Kept out of chat") : tt("Muted in chat"))
    void load()
  }

  const canEdit = d.canEdit
  const s = d.settings
  const main = d.channels.find((c) => c.id === s.mainSpaceId) ?? d.channels[0] ?? null
  const dmLine =
    s.dmPolicy === "staff"
      ? s.dmToStaff
        ? tt("Members can message the owner, admins and moderators. The team can message anyone.")
        : tt("Only the team starts conversations. Members can answer them.")
      : s.dmPolicy === "off"
        ? tt("Nobody can start or answer a message.")
        : s.dmPolicy === "level"
          ? s.dmToStaff
            ? tt("Members start conversations from level {n}. Before that they can answer one and message the team.", { n: s.dmMinLevel })
            : tt("Members start conversations from level {n}. Before that they can only answer one.", { n: s.dmMinLevel })
          : s.dmPolicy === "days"
            ? s.dmToStaff
              ? tt("Members start conversations after {n} days here. Before that they can answer one and message the team.", { n: s.dmMinDays })
              : tt("Members start conversations after {n} days here. Before that they can only answer one.", { n: s.dmMinDays })
            : tt("Any member can message any other member.")
  return (
    <div className="space-y-4" data-chat-settings="">
      {!d.ready ? <Notice tone="warn">{tt("Chat settings need the database update for chat (run-now part 270). Until it runs, chat works as before, without groups, rules or slow mode per channel.")}</Notice> : null}
      {d.ready && d.ready272 === false ? <Notice tone="warn">{tt("The Chat tab, levels for messages and pinned messages need the database update for chat (run-now part 272).")}</Notice> : null}

      <EditorCard>
        <div className="-my-1 divide-y divide-[#f1f2f4]">
          <Toggle checked={d.chatEnabled} onChange={(v) => void flipChat(v)} disabled={!canEdit} title={tt("Chat")} hint={tt("Chat channels and messages between members. Turned off, nothing in them is deleted.")} />
          {d.chatEnabled ? (
            <div data-chat-tab-settings="">
              <Toggle checked={s.chatTab} onChange={(v) => canEdit && void patch({ chatTab: v })} disabled={!canEdit || !d.channels.length} title={tt("Chat tab")} hint={tt("A Chat tab beside Community opens the group chat.")} />
              {s.chatTab && d.channels.length > 1 ? (
                <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <label htmlFor="chat-main-channel" className="text-[13.5px] text-[#4b5563]">
                    {tt("The tab opens")}
                  </label>
                  <div className="sm:w-64">
                    <SelectField id="chat-main-channel" name="chat-main-channel" title={tt("The tab opens")} disabled={!canEdit} value={main?.id ?? ""} options={d.channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} onChange={(v) => void patch({ mainSpaceId: v })} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="py-3" data-chat-channels="">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Channels")}</p>
              <Link href={`/app/community/${head.slug}/spaces`} className={cn(buttonSecondary, "inline-flex items-center")}>
                {tt("Edit in Spaces")}
              </Link>
            </div>
            {d.channels.length ? (
              <ul className="mt-2 divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
                {d.channels.map((c) => (
                  <li key={c.id} className="space-y-2.5 px-3 py-3" data-chat-channel={c.slug}>
                    <p className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                      <span className="min-w-0 truncate">#{c.name}</span>
                      {s.chatTab && main?.id === c.id ? <span className="shrink-0 text-[12.5px] font-normal text-[#6b7280]">{tt("Opens from the Chat tab")}</span> : null}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                      <div className="min-w-0">
                        <p className="mb-1 text-[12.5px] text-[#6b7280]">{tt("Who can post")}</p>
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <SelectField
                              name={`post-${c.slug}`}
                              title={tt("Who can post")}
                              disabled={!canEdit}
                              value={c.post}
                              options={[
                                { value: "everyone", label: tt("Everyone") },
                                { value: "level", label: tt("From a level") },
                                { value: "team", label: tt("The team only (announcements)") },
                              ]}
                              onChange={(v) => void postRule(c, v, v === "level" ? Math.max(2, c.minLevel || 2) : 0)}
                            />
                          </div>
                          {c.post === "level" ? <NumberField id={`post-level-${c.id}`} value={c.minLevel || 2} min={2} max={100} disabled={!canEdit} onSave={(n) => void postRule(c, "level", n)} /> : null}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[12.5px] text-[#6b7280]">{tt("Slow mode")}</p>
                        <ChoicePicker
                          id={`slow-${c.id}`}
                          name={`slow-${c.id}`}
                          title={tt("Slow mode")}
                          choices={SLOW_MODE_CHOICES.map((sec) => ({ value: String(sec), label: slowLabel(sec) }))}
                          value={String(c.slowMode)}
                          onChange={(v) => void slow(c.id, Number(v))}
                          placeholder={tt("Slow mode")}
                          fieldLabel={c.slowMode ? slowLabel(c.slowMode) : tt("No slow mode")}
                          fieldMuted={!c.slowMode}
                          fieldClassName="h-11 rounded-lg border-[#e1e3e7] sm:h-10"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg bg-[#f7f7f8] px-3 py-2" data-chat-channel-pin="">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] text-[#6b7280]">{tt("Pinned message")}</p>
                        <p className={cn("truncate text-[13.5px]", c.pinned ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{c.pinned ? `${c.pinned.authorName}: ${c.pinned.text}` : tt("Nothing pinned")}</p>
                      </div>
                      {canEdit ? (
                        <button type="button" className={buttonSecondary} onClick={() => setPinning(c)}>
                          {c.pinned ? tt("Change") : tt("Pin a message")}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-[#6b7280]">{tt("No chat channels yet. Add a space of the chat kind in Spaces.")}</p>
            )}
            <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("The team is never slowed and can always post.")}</p>
          </div>
        </div>
      </EditorCard>

      <EditorCard title={tt("Messages between members")} hint={tt("Members can also choose who may message them, and block anyone.")}>
        <div className="space-y-4">
          <div data-chat-dm-policy="">
            <label htmlFor="chat-dm-policy" className={label}>
              {tt("Who can start a conversation")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-72">
                <SelectField
                  id="chat-dm-policy"
                  name="chat-dm-policy"
                  title={tt("Who can start a conversation")}
                  disabled={!canEdit}
                  value={s.dmPolicy}
                  options={[
                    { value: "everyone", label: tt("Everyone") },
                    { value: "level", label: tt("Members from a level") },
                    { value: "days", label: tt("Members after some days here") },
                    { value: "staff", label: tt("The team only") },
                    { value: "off", label: tt("Off") },
                  ]}
                  onChange={(v) => void patch({ dmPolicy: v })}
                />
              </div>
              {s.dmPolicy === "level" ? <NumberField id="chat-dm-level" value={s.dmMinLevel} min={1} max={100} disabled={!canEdit} onSave={(n) => void patch({ dmMinLevel: n })} suffix={tt("level and up")} /> : null}
              {s.dmPolicy === "days" ? <NumberField id="chat-dm-days" value={s.dmMinDays} min={1} max={365} disabled={!canEdit} onSave={(n) => void patch({ dmMinDays: n })} suffix={tt("days in the community")} /> : null}
            </div>
            <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{dmLine}</p>
          </div>
          {s.dmPolicy !== "off" && s.dmPolicy !== "everyone" ? (
            <div className="-my-1">
              <Toggle checked={s.dmToStaff} disabled={!canEdit} onChange={(v) => void patch({ dmToStaff: v })} title={tt("Members can message the team")} hint={tt("The owner, admins and moderators, whatever the rule above says.")} />
            </div>
          ) : null}
          <div>
            <p className={label}>{tt("Who can start a group")}</p>
            <Segmented
              label={tt("Who can start a group")}
              value={s.groupsPolicy}
              onChange={(v) => canEdit && void patch({ groupsPolicy: v })}
              options={[
                { value: "members", label: tt("Members") },
                { value: "staff", label: tt("The team only") },
                { value: "off", label: tt("Off") },
              ]}
            />
          </div>
        </div>
      </EditorCard>

      <EditorCard title={tt("Pictures and phones")}>
        <div className="-my-1 divide-y divide-[#f1f2f4]">
          <Toggle checked={s.attachmentsEnabled} disabled={!canEdit} onChange={(v) => void patch({ attachmentsEnabled: v })} title={tt("Pictures and files in chat")} hint={tt("Up to 10 in a message, 50 MB each. The team can always send them.")} />
          <Toggle checked={s.pushPreviews} disabled={!canEdit} onChange={(v) => void patch({ pushPreviews: v })} title={tt("Show the words on phones")} hint={tt("Turned off, a notification says New message and who sent it.")} />
        </div>
      </EditorCard>

      <EditorCard title={tt("Chat rules")} hint={tt("Each member reads and accepts these once, before their first message. When you change them, everyone is asked again.")} id="chat-rules">
        <textarea value={rules} disabled={!canEdit} onChange={(e) => setRules(e.target.value.slice(0, 4000))} rows={5} placeholder={tt("Be kind. No selling in chat. Keep it on topic.")} aria-label={tt("Chat rules")} className={cn(field, "resize-y py-2.5 leading-relaxed")} data-chat-rules-field="" />
        <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{s.rulesVersion ? tt("Version {n}. Blocked words from Rules and policies apply in chat too.", { n: s.rulesVersion }) : tt("Blocked words from Rules and policies apply in chat too.")}</p>
      </EditorCard>
      {canEdit ? <EditorFoot dirty={rules.trim() !== s.rules} busy={busy} error={error} onSave={() => void saveRules()} onCancel={() => setRules(s.rules)} /> : null}

      {d.canModerate ? <Restricted head={head} rows={d.restricted} onRestrict={restrict} /> : null}
      <PinSheet base={base} channel={pinning} onClose={() => setPinning(null)} onPin={(c, id) => void pin(c, id)} />
    </div>
  )
}

/** Pick one of the channel's last messages to pin, or take the pin off. */
function PinSheet({ base, channel, onClose, onPin }: { base: string; channel: Channel | null; onClose: () => void; onPin: (c: Channel, messageId: string | null) => void }) {
  const [list, setList] = React.useState<{ id: string; authorName: string; text: string; createdAt: string }[] | null>(null)
  React.useEffect(() => {
    if (!channel) return setList(null)
    let gone = false
    void send<{ messages: { id: string; authorName: string; text: string; createdAt: string }[] }>(`${base}?recent=${channel.id}`, "GET").then((res) => {
      if (!gone) setList(res.ok ? (res.data.messages ?? []) : [])
    })
    return () => {
      gone = true
    }
  }, [base, channel])
  return (
    <Dialog
      open={!!channel}
      onClose={onClose}
      title={channel ? tt("Pin a message in #{name}", { name: channel.name }) : tt("Pin a message")}
      footer={
        <>
          {channel?.pinned ? (
            <button type="button" className={cn(buttonSecondary, "mr-auto h-10 px-4 sm:h-9")} onClick={() => channel && onPin(channel, null)}>
              {tt("Unpin")}
            </button>
          ) : null}
          <button type="button" className={cn(buttonSecondary, "h-10 px-4 sm:h-9")} onClick={onClose}>
            {tt("Cancel")}
          </button>
        </>
      }
    >
      {list === null ? (
        <div className="h-24 animate-pulse rounded-xl bg-[#f3f4f6]" aria-label={tt("Loading")} />
      ) : list.length ? (
        <ul className="-mx-1 divide-y divide-[#f1f2f4]" data-pin-list="">
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => channel && onPin(channel, m.id)} className={cn("flex w-full min-w-0 items-start gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-[#f7f7f8]", channel?.pinned?.id === m.id ? "bg-[#f3f4f6]" : "")}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[#1a1a2e]">{m.authorName}</span>
                  <span className="line-clamp-2 block text-[13.5px] leading-5 text-[#4b5563]">{m.text}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-[12px] text-[#9ca3af]">{new Date(m.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-[#6b7280]">{tt("Nothing has been said in this channel yet.")}</p>
      )}
    </Dialog>
  )
}

function Restricted({ head, rows, onRestrict }: { head: CommunityHead; rows: ChatAdmin["restricted"]; onRestrict: (userId: string, mode: "mute" | "ban" | "clear", minutes?: number) => void }) {
  const [q, setQ] = React.useState("")
  const [found, setFound] = React.useState<Found[]>([])
  React.useEffect(() => {
    const term = q.trim()
    if (!term) return setFound([])
    const t = window.setTimeout(async () => {
      const res = await send<{ rows: Found[] }>(`/api/app/community/${head.id}/members?q=${encodeURIComponent(term)}&status=active`, "GET")
      if (res.ok) setFound((res.data.rows ?? []).filter((m) => m.role === "member").slice(0, 6))
    }, 200)
    return () => window.clearTimeout(t)
  }, [q, head.id])
  return (
    <EditorCard title={tt("Kept out of chat")} hint={tt("A member muted or banned here can still read the community and its chat. Reports of messages are in Moderation.")} id="chat-restricted">
      {rows.length ? (
        <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]" data-chat-restricted="">
          {rows.map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{r.name}</span>
                <span className="block text-[12.5px] text-[#6b7280]">{r.chatBannedAt ? tt("Banned from chat") : tt("Muted until {date}", { date: new Date(r.chatMutedUntil ?? "").toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}</span>
              </span>
              <button type="button" className={buttonSecondary} onClick={() => onRestrict(r.userId, "clear")}>
                {tt("Let back in")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-[#6b7280]">{tt("Nobody is kept out of chat.")}</p>
      )}
      <div className="mt-3">
        <label htmlFor="chat-restrict-q" className={label}>
          {tt("Mute or ban a member")}
        </label>
        <input id="chat-restrict-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Search members")} className={cn(field, "h-11 sm:h-10")} autoComplete="off" />
        {found.length ? (
          <ul className="mt-2 space-y-1">
            {found.map((m) => (
              <li key={m.userId} className="flex flex-col gap-2 rounded-xl border border-[#eceef1] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 truncate text-[14px] text-[#1a1a2e]">{m.name}</span>
                <span className="flex flex-wrap gap-1.5">
                  <button type="button" className={buttonSecondary} onClick={() => onRestrict(m.userId, "mute", 60)}>{tt("Mute 1 hour")}</button>
                  <button type="button" className={buttonSecondary} onClick={() => onRestrict(m.userId, "mute", 1440)}>{tt("Mute 1 day")}</button>
                  <button type="button" className={buttonSecondary} onClick={() => onRestrict(m.userId, "mute", 10080)}>{tt("Mute 7 days")}</button>
                  <button type="button" className={cn(buttonSecondary, "text-[#b42318]")} onClick={() => onRestrict(m.userId, "ban")}>{tt("Ban from chat")}</button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </EditorCard>
  )
}
