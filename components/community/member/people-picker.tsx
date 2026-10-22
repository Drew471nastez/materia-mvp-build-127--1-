"use client"

/**
 * ===========================================================================
 *  NEW MESSAGE: SUGGESTED PEOPLE AND A SEARCH THAT KEEPS UP (round 39)
 * ===========================================================================
 * The owner: "It should have some creators there recommended, so I can
 * create conversations with them from the community; I don't only have to
 * manually search them. Make sure the search is smooth and clean."
 *
 *   SUGGESTED    before anything is typed: the community's owner and team,
 *                then the people the member deals with, the top contributors
 *                and whoever was here lately (GET chat/people, decided on the
 *                server: lib/communities/server/chat-people.ts). Only people a
 *                press would reach. Read while the messages panel opens and
 *                kept for the tab, so the first frame of the picker has them;
 *                the skeleton is for a picker opened before that read came
 *                back, the first time only.
 *   THE SEARCH   focused as the picker opens. Every key narrows the people
 *                already on screen at once (names and handles the page has
 *                seen), and a pause of SEARCH_PAUSE_MS asks the server; its
 *                answer replaces the narrowed list in place. Answers are kept
 *                per word, so going back a letter is instant. A row is always
 *                the same height and the list area never changes size, so
 *                nothing jumps while results change.
 *   A PRESS      opens (or makes) the conversation. The circle on a row's
 *                right picks several people instead, where groups are
 *                allowed: one picked is "Message Ana", two or more is a group
 *                with a name to give it (their names when none is typed).
 *   KEYS         up and down move through the rows, Enter presses the lit
 *                one, Escape closes the picker (only the picker).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, Search, X } from "lucide-react"
import { cleanPeopleQuery, type PickPerson } from "@/lib/communities/chat-people"
import { api, apiBase } from "./api"
import { keepValue } from "./chat-core"
import { MemberAvatar } from "./member-avatar"
import { PickerHead, PickerShell } from "./picker-shell"
import { Spinner } from "./place-spinner"
import { RoleBadge } from "./role-badge"
import { toast } from "./toast"

export const SEARCH_PAUSE_MS = 140
const FRESH_MS = 60_000

/* ── What the page knows about people, for the tab ─────────────────────── */

const ANSWERS = new Map<string, { at: number; people: PickPerson[] }>()
const KNOWN = new Map<string, Map<string, PickPerson>>()
const ASKING = new Map<string, Promise<PickPerson[] | null>>()

const keyOf = (communityId: string, term: string) => `${communityId}|${term.toLowerCase()}`

function remember(communityId: string, term: string, people: PickPerson[]) {
  ANSWERS.set(keyOf(communityId, term), { at: Date.now(), people })
  const known = KNOWN.get(communityId) ?? new Map<string, PickPerson>()
  for (const p of people) known.set(p.id, p)
  KNOWN.set(communityId, known)
}

function ask(communityId: string, term: string, signal?: AbortSignal): Promise<PickPerson[] | null> {
  const key = keyOf(communityId, term)
  const going = ASKING.get(key)
  if (going && !signal) return going
  const run = api<{ people: PickPerson[] }>(`${apiBase(communityId)}/chat/people${term ? `?q=${encodeURIComponent(term)}` : ""}`, { signal }).then((r) => {
    ASKING.delete(key)
    if (!r.ok) return null
    remember(communityId, term, r.data.people)
    return r.data.people
  })
  ASKING.set(key, run)
  return run
}

/** The Suggested list asked for ahead (the messages panel calls this as it opens), once a minute at most. */
export function warmPeople(communityId: string): void {
  const kept = ANSWERS.get(keyOf(communityId, ""))
  if (kept && Date.now() - kept.at < FRESH_MS) return
  void ask(communityId, "")
}

export function keptPeople(communityId: string, term: string): PickPerson[] | null {
  return ANSWERS.get(keyOf(communityId, cleanPeopleQuery(term)))?.people ?? null
}

/** The people already on the page whose name or handle has the words typed, the ones it starts with first. */
function narrowed(communityId: string, term: string): PickPerson[] {
  const t = term.toLowerCase()
  const all = [...(KNOWN.get(communityId)?.values() ?? [])]
  const hit = (p: PickPerson) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(t)) || p.name.toLowerCase().startsWith(t) || (p.username ?? "").toLowerCase().startsWith(t)
  return all.filter(hit).sort((a, b) => Number(b.name.toLowerCase().startsWith(t)) - Number(a.name.toLowerCase().startsWith(t)))
}

/**
 * The rows for what is typed: kept or narrowed at once, the server's answer
 * after a pause. `people` is null only before the very first Suggested list
 * ever came back (the skeleton's one case).
 */
export function usePeople(communityId: string, q: string, enabled = true): { term: string; people: PickPerson[] | null; busy: boolean; pending: boolean; failed: boolean; retry: () => void } {
  const term = cleanPeopleQuery(q)
  const [people, setPeople] = useState<PickPerson[] | null>(() => keptPeople(communityId, term))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [again, setAgain] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const kept = ANSWERS.get(keyOf(communityId, term))
    if (kept) setPeople(kept.people)
    else if (term) setPeople(narrowed(communityId, term))
    if (kept && Date.now() - kept.at < FRESH_MS) {
      setBusy(false)
      return
    }
    const ctl = new AbortController()
    const t = window.setTimeout(
      async () => {
        setBusy(true)
        const found = await ask(communityId, term, term ? ctl.signal : undefined)
        if (ctl.signal.aborted) return
        setBusy(false)
        if (found) {
          setFailed(false)
          setPeople(found)
        } else if (!kept) {
          setFailed(true)
          setPeople((cur) => cur ?? [])
        }
      },
      term ? SEARCH_PAUSE_MS : 0,
    )
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [communityId, term, enabled, again])
  /* Typed, and the server has not answered these words yet: an empty list is not "nobody" yet. */
  const pending = !!term && !ANSWERS.has(keyOf(communityId, term)) && !failed
  return { term, people, busy, pending, failed, retry: useCallback(() => setAgain((n) => n + 1), []) }
}

/* ── The parts both pickers draw ───────────────────────────────────────── */

export function PickerSearch({ value, onChange, busy, label, inputRef, onKeyDown, activeId, listId }: { value: string; onChange: (v: string) => void; busy: boolean; label: string; inputRef: React.RefObject<HTMLInputElement | null>; onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void; activeId: string | null; listId: string }) {
  return (
    <div className="shrink-0 px-3 pb-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId ?? undefined}
          enterKeyHint="go"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={label}
          aria-label={label}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-11 w-full rounded-xl border border-transparent bg-[#f3f4f6] pl-10 pr-10 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,background-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#e3e5e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(17,17,19,0.05)] sm:h-10 sm:text-[14px]"
          data-picker-search=""
        />
        <span className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center">
          {busy ? (
            <Spinner size={14} />
          ) : value ? (
            <button type="button" aria-label="Clear" onClick={() => onChange("")} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#9ca3af] hover:text-[#1a1a2e]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </span>
      </label>
    </div>
  )
}

export function OnlineAvatar({ src, name, online, size = 40 }: { src: string | null; name: string; online: boolean | null; size?: number }) {
  return (
    <span className="relative shrink-0">
      <MemberAvatar src={src} name={name} alt="" size={size} />
      {online ? <span aria-label="Online" className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#22c55e] ring-2 ring-white" data-online="" /> : null}
    </span>
  )
}

/** One row: always 56px, so a list that changes under the field never moves. */
export const OPTION =
  "group/opt flex h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 text-left outline-none transition-colors duration-100 hover:bg-[#f6f7f8] data-[active]:bg-[#f3f4f6] aria-disabled:cursor-default aria-disabled:hover:bg-transparent"

export function PickCircle({ on }: { on: boolean }) {
  return (
    <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color] duration-150 ${on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d1d5db] bg-white"}`} aria-hidden>
      {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </span>
  )
}

export function PersonLines({ p }: { p: PickPerson }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className={`truncate text-[14.5px] font-medium ${p.can ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`}>{p.name}</span>
        {p.role === "owner" || p.role === "admin" ? <RoleBadge role={p.role} size="xs" /> : null}
      </span>
      <span className="block truncate text-[12.5px] leading-[18px] text-[#9ca3af]">{p.can ? (p.username ? `@${p.username}` : " ") : p.why}</span>
    </span>
  )
}

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <ul role="status" aria-label="Loading" data-picker-skeleton="">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex h-14 items-center gap-3 px-2.5">
          <span className="h-10 w-10 shrink-0 rounded-full bg-[#f1f2f4] motion-safe:animate-pulse" />
          <span className="min-w-0 flex-1">
            <span className="block h-3 rounded-full bg-[#eceef1] motion-safe:animate-pulse" style={{ width: `${[46, 38, 54, 42, 34, 50][i % 6]}%` }} />
            <span className="mt-2 block h-2.5 rounded-full bg-[#f1f2f4] motion-safe:animate-pulse" style={{ width: `${[28, 22, 30, 26, 20, 24][i % 6]}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[12.5px] font-medium text-[#6b7280]">{children}</p>
}

/** Up, down and Enter over a list of rows, with the lit one kept in view. */
export function useRowKeys(count: number, onEnter: (i: number) => void, resetOn: unknown) {
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [resetOn])
  const clamped = count ? Math.min(active, count - 1) : -1
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!count) return
      setActive((a) => (e.key === "ArrowDown" ? (Math.min(a, count - 1) + 1) % count : (Math.min(a, count - 1) - 1 + count) % count))
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (clamped >= 0) onEnter(clamped)
    }
  }
  return { active: clamped, setActive, onKeyDown }
}

function namesLine(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** "Ana, Ben and Cai", cut to fit a group's name. */
export function groupNameFor(people: { name: string }[]): string {
  const first = people.map((p) => p.name.split(" ")[0]).filter(Boolean)
  const line = namesLine(first)
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

/* ── New message ───────────────────────────────────────────────────────── */

export interface OpenedConversation {
  id: string
  other: { id: string; name: string; username: string | null; avatarUrl: string | null; role: string | null } | null
}

export function NewMessagePicker({
  communityId,
  open,
  onClose,
  dmPolicy,
  canStartGroups,
  onConversation,
  onGroup,
}: {
  communityId: string
  open: boolean
  onClose: () => void
  dmPolicy: string | null
  canStartGroups: boolean
  onConversation: (c: OpenedConversation) => void
  onGroup: (g: { id: string; name: string }) => void
}) {
  return (
    <PickerShell open={open} onClose={onClose} label="New message" place="panel">
      <NewMessageBody communityId={communityId} open={open} onClose={onClose} dmPolicy={dmPolicy} canStartGroups={canStartGroups} onConversation={onConversation} onGroup={onGroup} />
    </PickerShell>
  )
}

function NewMessageBody({ communityId, open, onClose, dmPolicy, canStartGroups, onConversation, onGroup }: { communityId: string; open: boolean; onClose: () => void; dmPolicy: string | null; canStartGroups: boolean; onConversation: (c: OpenedConversation) => void; onGroup: (g: { id: string; name: string }) => void }) {
  const [q, setQ] = useState("")
  const off = dmPolicy === "off"
  const { term, people, busy, pending, failed, retry } = usePeople(communityId, q, open && !off)
  const [picked, setPicked] = useState<PickPerson[]>([])
  const [groupName, setGroupName] = useState("")
  const [opening, setOpening] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const rows = useMemo(() => people ?? [], [people])
  const choosing = picked.length > 0

  /*
    Opened afresh each time (cleared here, before the first open frame is painted, not as it closes, so what was on
    screen stays while it leaves), and focused in the press that opened it (a layout effect is still that press), so a
    phone's keyboard comes up with it.
  */
  useLayoutEffect(() => {
    if (!open) return
    setQ("")
    setPicked([])
    setGroupName("")
    input.current?.focus({ preventScroll: true })
  }, [open])

  const openWith = async (p: PickPerson) => {
    if (opening || !p.can) return
    setOpening(p.id)
    const r = await api<{ conversation: OpenedConversation }>(`${apiBase(communityId)}/dms`, { body: { userId: p.id } })
    setOpening(null)
    if (!r.ok) return toast(r.error)
    keepValue(`dm-with:${communityId}:${p.id}`, r.data.conversation)
    onConversation(r.data.conversation)
  }
  const toggle = (p: PickPerson) => {
    if (!p.can) return
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p]))
  }
  const press = (p: PickPerson) => (choosing ? toggle(p) : void openWith(p))
  const { active, setActive, onKeyDown } = useRowKeys(rows.length, (i) => rows[i] && press(rows[i]), term)

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active])

  const makeGroup = async () => {
    if (making || picked.length < 2) return
    setMaking(true)
    const name = groupName.trim() || groupNameFor(picked)
    const r = await api<{ group: { id: string; name: string } }>(`${apiBase(communityId)}/groups`, { body: { name, userIds: picked.map((p) => p.id) } })
    setMaking(false)
    if (!r.ok) return toast(r.error)
    onGroup(r.data.group)
  }

  const listId = "new-message-people"
  return (
    <>
      <PickerHead title="New message" onClose={onClose} />
      {off ? (
        <p className="px-6 py-10 text-center text-[13.5px] leading-relaxed text-[#6b7280]" data-picker-note="">
          Messages between members are turned off in this community.
        </p>
      ) : (
        <>
          <PickerSearch value={q} onChange={setQ} busy={busy && !!term} label="Search by name or @handle" inputRef={input} onKeyDown={onKeyDown} activeId={rows[active] ? `${listId}-${rows[active].id}` : null} listId={listId} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2" data-picker-list="">
            {people === null ? (
              <>
                <SectionLabel>Suggested</SectionLabel>
                <SkeletonRows />
              </>
            ) : failed && !rows.length ? (
              <div className="px-6 py-10 text-center">
                <p className="text-[13.5px] text-[#6b7280]">That did not load.</p>
                <button type="button" onClick={retry} className="mt-3 h-9 cursor-pointer rounded-full border border-[#e3e4e8] px-4 text-[13.5px] font-medium text-[#1a1a2e] hover:bg-[#f6f7f8]">
                  Try again
                </button>
              </div>
            ) : !rows.length ? (
              <p className="px-6 py-10 text-center text-[13.5px] text-[#9ca3af]" data-picker-empty="">
                {term ? (pending ? " " : "Nobody by that name here.") : dmPolicy === "staff" ? "In this community you can message the admins and moderators." : "Type a name to find someone."}
              </p>
            ) : (
              <>
                {!term ? <SectionLabel>Suggested</SectionLabel> : null}
                <ul ref={listRef} id={listId} role="listbox" aria-label={term ? "People" : "Suggested"} aria-multiselectable={canStartGroups || undefined} data-picker-rows={term ? "search" : "suggested"}>
                  {rows.map((p, i) => {
                    const on = picked.some((x) => x.id === p.id)
                    return (
                      <li key={p.id} className="relative">
                        <div
                          id={`${listId}-${p.id}`}
                          role="option"
                          aria-selected={on}
                          aria-disabled={!p.can || undefined}
                          data-row={i}
                          data-active={i === active ? "" : undefined}
                          data-person={p.id}
                          tabIndex={-1}
                          onMouseMove={() => i !== active && setActive(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => press(p)}
                          className={`${OPTION} ${canStartGroups ? "pr-12" : ""}`}
                        >
                          <OnlineAvatar src={p.avatarUrl} name={p.name} online={p.online} />
                          <PersonLines p={p} />
                          {opening === p.id ? <Spinner size={16} /> : null}
                        </div>
                        {canStartGroups && p.can ? (
                          <button
                            type="button"
                            aria-label={on ? `Unselect ${p.name}` : `Select ${p.name}`}
                            aria-pressed={on}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggle(p)}
                            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
                            data-pick=""
                          >
                            <PickCircle on={on} />
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
          {choosing ? (
            <div className="shrink-0 border-t border-[#f0f1f3] bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5" data-picker-foot="">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
                {picked.map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(p)} aria-label={`Remove ${p.name}`} className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[#f1f2f4] pl-1 pr-2.5 text-[13px] text-[#1a1a2e] hover:bg-[#e9eaee]">
                    <MemberAvatar src={p.avatarUrl} name={p.name} alt="" size={24} />
                    {p.name.split(" ")[0]}
                    <X className="h-3.5 w-3.5 text-[#6b7280]" />
                  </button>
                ))}
              </div>
              {picked.length === 1 ? (
                <button type="button" onClick={() => void openWith(picked[0])} disabled={!!opening} className="h-11 w-full cursor-pointer rounded-full bg-[#1a1a2e] text-[14.5px] font-medium text-white transition-[background-color,scale] hover:bg-[#2b2b42] active:scale-[0.98] disabled:opacity-60 sm:h-10" data-picker-go="">
                  {opening ? "Opening..." : `Message ${picked[0].name.split(" ")[0]}`}
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value.slice(0, 80))}
                    placeholder={groupNameFor(picked)}
                    aria-label="Group name"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] sm:h-10 sm:text-[14px]"
                    data-picker-group-name=""
                  />
                  <button type="button" onClick={() => void makeGroup()} disabled={making} className="h-11 shrink-0 cursor-pointer rounded-full bg-[#1a1a2e] px-4 text-[14px] font-medium text-white transition-[background-color,scale] hover:bg-[#2b2b42] active:scale-[0.98] disabled:opacity-60 sm:h-10" data-picker-go="">
                    {making ? "Starting..." : "Start group"}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
