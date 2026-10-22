"use client"

/**
 * ===========================================================================
 *  SETTINGS > CHAT (round 37)
 * ===========================================================================
 * Everything about the community's chat in one panel, read from and saved to
 * /api/app/community/<id>/chat (part 270):
 *
 *   Chat               the one switch (the same as Features > Chat), and the
 *                      channels: each one's slow mode here, adding,
 *                      renaming, ordering and who may post in Spaces
 *   Messages           who may message whom (everyone, the team only, off)
 *                      and who may start a group
 *   Pictures and       files in chat on or off for members, and whether a
 *   phones             phone's banner shows the words of a message
 *   Chat rules         shown to each member once, before their first message;
 *                      changed, everyone is asked again
 *   Kept out of chat   members muted or banned from chat only (they still
 *                      read the feed), with a way to let them back; removing
 *                      a message is on the message itself, reports and
 *                      blocked words are in Moderation and Rules and policies
 *
 * A switch saves when it is flipped; the rules save with their bar.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChoicePicker } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SLOW_MODE_CHOICES } from "@/lib/communities/chat-rules"
import type { CommunityHead } from "./view-types"
import { EditorCard, EditorFoot, Notice, Segmented, Toggle, buttonSecondary, errorText, field, label, send, useToast } from "./parts"

interface ChatAdmin {
  ready: boolean
  chatEnabled: boolean
  settings: { dmPolicy: "everyone" | "staff" | "off"; groupsPolicy: "members" | "staff" | "off"; attachmentsEnabled: boolean; pushPreviews: boolean; rules: string; rulesVersion: number }
  channels: { id: string; name: string; slug: string; slowMode: number }[]
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

export function ChatPanel({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const router = useRouter()
  const base = `/api/app/community/${head.id}/chat`
  const [d, setD] = React.useState<ChatAdmin | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [rules, setRules] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
  const slow = async (spaceId: string, seconds: number) => {
    const before = d
    setD({ ...d, channels: d.channels.map((c) => (c.id === spaceId ? { ...c, slowMode: seconds } : c)) })
    const res = await send(base, "POST", { action: "slow_mode", spaceId, seconds })
    if (!res.ok) {
      setD(before)
      return toast(errorText(res.data.error))
    }
    toast(tt("Saved"))
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
  return (
    <div className="space-y-4" data-chat-settings="">
      {!d.ready ? <Notice tone="warn">{tt("Chat settings need the database update for chat (run-now part 270). Until it runs, chat works as before, without groups, rules or slow mode per channel.")}</Notice> : null}

      <EditorCard>
        <div className="-my-1 divide-y divide-[#f1f2f4]">
          <Toggle checked={d.chatEnabled} onChange={(v) => void flipChat(v)} disabled={!canEdit} title={tt("Chat")} hint={tt("Chat channels and messages between members. Turned off, nothing in them is deleted.")} />
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
                  <li key={c.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 truncate text-[14px] text-[#1a1a2e]">#{c.name}</span>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <span className="shrink-0 text-[12.5px] text-[#6b7280]">{tt("Slow mode")}</span>
                      <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                      <ChoicePicker
                        id={`slow-${c.id}`}
                        name={`slow-${c.id}`}
                        title={tt("Slow mode")}
                        choices={SLOW_MODE_CHOICES.map((s) => ({ value: String(s), label: slowLabel(s) }))}
                        value={String(c.slowMode)}
                        onChange={(v) => void slow(c.id, Number(v))}
                        placeholder={tt("Slow mode")}
                        fieldLabel={c.slowMode ? slowLabel(c.slowMode) : tt("No slow mode")}
                        fieldMuted={!c.slowMode}
                        fieldClassName="h-10 rounded-lg border-[#e1e3e7] sm:h-9"
                      />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-[#6b7280]">{tt("No chat channels yet. Add a space of the chat kind in Spaces.")}</p>
            )}
            <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("Who can post in each channel is set on the channel in Spaces. The team is never slowed.")}</p>
          </div>
        </div>
      </EditorCard>

      <EditorCard title={tt("Messages between members")} hint={tt("Members can also choose who may message them, and block anyone.")}>
        <div className="space-y-4">
          <div>
            <p className={label}>{tt("Who can send messages")}</p>
            <Segmented
              label={tt("Who can send messages")}
              value={d.settings.dmPolicy}
              onChange={(v) => canEdit && void patch({ dmPolicy: v })}
              options={[
                { value: "everyone", label: tt("Everyone") },
                { value: "staff", label: tt("The team only") },
                { value: "off", label: tt("Off") },
              ]}
            />
            <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{d.settings.dmPolicy === "staff" ? tt("Members can message the owner, admins and moderators. The team can message anyone.") : d.settings.dmPolicy === "off" ? tt("Nobody can start or answer a message.") : tt("Any member can message any other member.")}</p>
          </div>
          <div>
            <p className={label}>{tt("Who can start a group")}</p>
            <Segmented
              label={tt("Who can start a group")}
              value={d.settings.groupsPolicy}
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
          <Toggle checked={d.settings.attachmentsEnabled} disabled={!canEdit} onChange={(v) => void patch({ attachmentsEnabled: v })} title={tt("Pictures and files in chat")} hint={tt("Up to 10 in a message, 50 MB each. The team can always send them.")} />
          <Toggle checked={d.settings.pushPreviews} disabled={!canEdit} onChange={(v) => void patch({ pushPreviews: v })} title={tt("Show the words on phones")} hint={tt("Turned off, a notification says New message and who sent it.")} />
        </div>
      </EditorCard>

      <EditorCard title={tt("Chat rules")} hint={tt("Each member reads and accepts these once, before their first message. When you change them, everyone is asked again.")} id="chat-rules">
        <textarea value={rules} disabled={!canEdit} onChange={(e) => setRules(e.target.value.slice(0, 4000))} rows={5} placeholder={tt("Be kind. No selling in chat. Keep it on topic.")} aria-label={tt("Chat rules")} className={cn(field, "resize-y py-2.5 leading-relaxed")} data-chat-rules-field="" />
        <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{d.settings.rulesVersion ? tt("Version {n}. Blocked words from Rules and policies apply in chat too.", { n: d.settings.rulesVersion }) : tt("Blocked words from Rules and policies apply in chat too.")}</p>
      </EditorCard>
      {canEdit ? <EditorFoot dirty={rules.trim() !== d.settings.rules} busy={busy} error={error} onSave={() => void saveRules()} onCancel={() => setRules(d.settings.rules)} /> : null}

      {d.canModerate ? <Restricted head={head} rows={d.restricted} onRestrict={restrict} /> : null}
    </div>
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
