"use client"

/**
 * ===========================================================================
 *  SEND IN A MESSAGE: A POST INTO CHATS (round 39)
 * ===========================================================================
 * The owner: "Make sure I can share posts into chats." From a post's share
 * menu (post-card.tsx), a sheet on a phone and a dialog on a computer
 * (picker-shell.tsx) with:
 *
 *   RECENT     the member's latest conversations and groups, newest first
 *   CHANNELS   the community's chat channels they may post in
 *   PEOPLE     the Suggested people (new-message's list), or with words
 *              typed, the chats whose name has them and the members found
 *              (a member who already has a conversation with you is that
 *              conversation)
 *
 * Up to SHARE_TARGETS_MAX picked, an optional note, Send. The server sends
 * one message per chat, each through that chat's own send and checks, with
 * the post as its card (lib/communities/server/chat-people.ts); a chat that
 * refuses says why and stays picked, the rest go.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { SHARE_NOTE_MAX, SHARE_TARGETS_MAX, type PickPerson } from "@/lib/communities/chat-people"
import { newClientId } from "@/lib/communities/chat-rules"
import { api, apiBase } from "./api"
import { MemberAvatar } from "./member-avatar"
import { OPTION, OnlineAvatar, PickCircle, PickerSearch, SectionLabel, SkeletonRows, usePeople, useRowKeys, warmPeople } from "./people-picker"
import { PickerHead, PickerShell } from "./picker-shell"
import { RoleBadge } from "./role-badge"
import { toast } from "./toast"

export interface SharePostInfo {
  id: string
  communityId: string
  title: string | null
  bodyText: string
}

interface ShareChat {
  kind: "dm" | "group" | "space"
  id: string
  name: string
  avatarUrl: string | null
  username: string | null
  role: string | null
  sub: string | null
  at: string | null
  personId?: string
}

type Kind = "person" | "dm" | "group" | "space"

interface Row {
  key: string
  kind: Kind
  id: string
  name: string
  avatarUrl: string | null
  line: string
  role: string | null
  online: boolean | null
  can: boolean
}

const CHATS = new Map<string, { at: number; ready: boolean; chats: ShareChat[] }>()
const CHATS_FRESH_MS = 30_000

function chatRow(c: ShareChat): Row {
  return {
    key: `${c.kind}:${c.id}`,
    kind: c.kind,
    id: c.id,
    name: c.kind === "space" ? `#${c.name}` : c.name,
    avatarUrl: c.avatarUrl,
    line: c.kind === "group" ? (c.sub ?? "Group") : c.kind === "space" ? "Channel" : c.username ? `@${c.username}` : "Conversation",
    role: c.role,
    online: null,
    can: true,
  }
}

function personRow(p: PickPerson): Row {
  return { key: `person:${p.id}`, kind: "person", id: p.id, name: p.name, avatarUrl: p.avatarUrl, line: p.can ? (p.username ? `@${p.username}` : "Member") : (p.why ?? ""), role: p.role, online: p.online, can: p.can }
}

function Glyph({ row }: { row: Row }) {
  if (row.kind === "group") return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-[15px] font-semibold text-[#6d28d9]">{row.name.slice(0, 1).toUpperCase()}</span>
  if (row.kind === "space") return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f2f4] text-[17px] font-semibold text-[#6b7280]">#</span>
  if (row.kind === "person") return <OnlineAvatar src={row.avatarUrl} name={row.name} online={row.online} />
  return <MemberAvatar src={row.avatarUrl} name={row.name} alt="" size={40} />
}

export function SendInMessage({ post, open, onClose }: { post: SharePostInfo; open: boolean; onClose: () => void }) {
  return (
    <PickerShell open={open} onClose={onClose} label="Send in a message" place="page">
      <Body post={post} open={open} onClose={onClose} />
    </PickerShell>
  )
}

function Body({ post, open, onClose }: { post: SharePostInfo; open: boolean; onClose: () => void }) {
  const communityId = post.communityId
  const [q, setQ] = useState("")
  const [note, setNote] = useState("")
  const [picked, setPicked] = useState<Row[]>([])
  const [sending, setSending] = useState(false)
  const [chats, setChats] = useState(() => CHATS.get(communityId) ?? null)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { term, people, busy, pending } = usePeople(communityId, q, open)

  useLayoutEffect(() => {
    if (!open) return
    setQ("")
    setNote("")
    setPicked([])
    input.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open) return
    warmPeople(communityId)
    const kept = CHATS.get(communityId)
    if (kept) setChats(kept)
    if (kept && Date.now() - kept.at < CHATS_FRESH_MS) return
    let gone = false
    void api<{ ready: boolean; chats: ShareChat[] }>(`${apiBase(communityId)}/chat/share`).then((r) => {
      if (gone) return
      const next = { at: Date.now(), ready: r.ok ? r.data.ready : true, chats: r.ok ? r.data.chats : (kept?.chats ?? []) }
      if (r.ok) CHATS.set(communityId, next)
      setChats(next)
    })
    return () => {
      gone = true
    }
  }, [open, communityId])

  /* The rows in the order drawn, under their section names. */
  const sections = useMemo(() => {
    const all = chats?.chats ?? []
    const withDm = new Set(all.filter((c) => c.kind === "dm" && c.personId).map((c) => c.personId as string))
    const persons = (people ?? []).filter((p) => !withDm.has(p.id)).map(personRow)
    if (!term) {
      return [
        { label: "Recent", rows: all.filter((c) => c.kind !== "space").slice(0, 8).map(chatRow) },
        { label: "Channels", rows: all.filter((c) => c.kind === "space").map(chatRow) },
        { label: "People", rows: persons.slice(0, 8) },
      ].filter((s) => s.rows.length)
    }
    const t = term.toLowerCase()
    const named = all.filter((c) => c.name.toLowerCase().includes(t) || (c.username ?? "").toLowerCase().startsWith(t)).map(chatRow)
    return [
      { label: "Chats", rows: named },
      { label: "People", rows: persons },
    ].filter((s) => s.rows.length)
  }, [chats, people, term])
  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections])

  const toggle = (row: Row) => {
    if (!row.can) return
    setPicked((cur) => {
      if (cur.some((x) => x.key === row.key)) return cur.filter((x) => x.key !== row.key)
      if (cur.length >= SHARE_TARGETS_MAX) {
        toast(`Up to ${SHARE_TARGETS_MAX} chats at once.`)
        return cur
      }
      return [...cur, row]
    })
  }
  const { active, setActive, onKeyDown } = useRowKeys(flat.length, (i) => flat[i] && toggle(flat[i]), term)
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const send = async () => {
    if (sending || !picked.length) return
    setSending(true)
    const targets = picked.map((p) => ({ kind: p.kind, id: p.id }))
    const r = await api<{ results: { kind: Kind; id: string; ok: boolean; error?: string }[] }>(`${apiBase(communityId)}/chat/share`, { body: { postId: post.id, note: note.trim(), targets, clientId: newClientId() } })
    setSending(false)
    if (!r.ok) return toast(r.error)
    const failed = r.data.results.filter((x) => !x.ok)
    const sent = r.data.results.length - failed.length
    CHATS.delete(communityId)
    if (!failed.length) {
      toast(picked.length === 1 ? `Sent to ${picked[0].name}` : `Sent to ${sent} chats`)
      onClose()
      return
    }
    /* What went is unpicked; what did not stays, with its reason. */
    setPicked((cur) => cur.filter((p) => failed.some((f) => f.kind === p.kind && f.id === p.id)))
    toast(sent ? `Sent to ${sent} of ${r.data.results.length}. ${failed[0].error ?? ""}`.trim() : (failed[0].error ?? "That did not send. Try again."))
  }

  const headline = (post.title || post.bodyText || "").replace(/\s+/g, " ").trim()
  const listId = "share-post-chats"
  const off = chats && !chats.ready
  let n = -1

  return (
    <>
      <PickerHead title="Send in a message" onClose={onClose} />
      {headline ? (
        <p className="-mt-1.5 shrink-0 truncate px-4 pb-2.5 text-[13px] text-[#6b7280]" data-share-headline="">
          {headline}
        </p>
      ) : null}
      {off ? (
        <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]" data-picker-note="">
          Messages are turned off in this community.
        </p>
      ) : (
        <>
          <PickerSearch value={q} onChange={setQ} busy={busy && !!term} label="Search people and chats" inputRef={input} onKeyDown={onKeyDown} activeId={flat[active] ? `${listId}-${flat[active].key}` : null} listId={listId} />
          <div ref={listRef} id={listId} role="listbox" aria-multiselectable aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2" data-picker-list="">
            {chats === null && people === null ? (
              <SkeletonRows />
            ) : !flat.length ? (
              <p className="px-6 py-10 text-center text-[13.5px] text-[#9ca3af]" data-picker-empty="">
                {term ? (pending ? " " : "Nothing by that name here.") : "No chats yet. Search for someone."}
              </p>
            ) : (
              sections.map((s) => (
                <div key={s.label} role="group" aria-label={s.label}>
                  <SectionLabel>{s.label}</SectionLabel>
                  {s.rows.map((row) => {
                    n++
                    const i = n
                    const on = picked.some((x) => x.key === row.key)
                    return (
                      <div
                        key={row.key}
                        id={`${listId}-${row.key}`}
                        role="option"
                        aria-selected={on}
                        aria-disabled={!row.can || undefined}
                        data-row={i}
                        data-active={i === active ? "" : undefined}
                        data-share-target={row.key}
                        tabIndex={-1}
                        onMouseMove={() => i !== active && setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggle(row)}
                        className={OPTION}
                      >
                        <Glyph row={row} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`truncate text-[14.5px] font-medium ${row.can ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`}>{row.name}</span>
                            {row.role === "owner" || row.role === "admin" ? <RoleBadge role={row.role} size="xs" /> : null}
                          </span>
                          <span className="block truncate text-[12.5px] leading-[18px] text-[#9ca3af]">{row.line}</span>
                        </span>
                        {row.can ? <PickCircle on={on} /> : null}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
          <div className="flex shrink-0 items-end gap-2 border-t border-[#f0f1f3] bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5" data-share-foot="">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, SHARE_NOTE_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="Add a note"
              aria-label="Add a note"
              className="max-h-24 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-[#e3e5e8] bg-white px-3.5 py-[11px] text-[16px] leading-[22px] text-[#1a1a2e] outline-none [field-sizing:content] placeholder:text-[#9ca3af] focus:border-[#c9ccd3] sm:min-h-10 sm:py-[9px] sm:text-[14px] sm:leading-5"
              data-share-note=""
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!picked.length || sending}
              className="h-11 shrink-0 cursor-pointer rounded-full bg-[#1a1a2e] px-5 text-[14px] font-medium tabular-nums text-white transition-[background-color,opacity,scale] hover:bg-[#2b2b42] active:scale-[0.98] disabled:cursor-default disabled:opacity-35 sm:h-10"
              data-share-send=""
            >
              {sending ? "Sending..." : picked.length > 1 ? `Send to ${picked.length}` : "Send"}
            </button>
          </div>
        </>
      )}
    </>
  )
}
