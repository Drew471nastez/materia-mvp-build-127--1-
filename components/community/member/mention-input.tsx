"use client"

/**
 * A text box that knows @. Typing @ asks the members route for up to six
 * people whose name or username starts with what follows it (a short search,
 * so it works even with the member list switched off), and a choice puts
 * their @username in the text with a space after it, the caret after the
 * space. Members without a username cannot be mentioned, so they are not
 * offered. The box grows with what is typed, up to a limit.
 *
 * ROUND 13: "typing @ in a post or comment opens a member picker".
 *
 *   @ ALONE opens it at once: the people the page already knows (the post's
 *   author, the commenters on screen: `nearby`), then the newest members
 *   when the community's member list is open (the route refuses an empty
 *   search otherwise, and the nearby people are enough).
 *
 *   KEYBOARD AND TOUCH: arrows move, Enter or Tab choose, Escape closes; a
 *   row is a 44px target, chosen on the press without taking the caret (and
 *   a phone's keyboard) away from the words.
 *
 *   ALWAYS IN SIGHT: it opens under the line being typed, or above the box
 *   when there is not room under it (a comment box at the bottom of a phone's
 *   screen, over the keyboard: the visual viewport is what counts), and it
 *   is never wider than the box.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { MemberAvatar } from "./member-avatar"
import type { MemberView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { mentionAt, mentionChoices, type MentionPerson } from "./mention-pick"

export { mentionAt, mentionChoices, type MentionPerson }

/** How much room the list needs before it opens above instead: about four rows. */
const LIST_ROOM_PX = 200

export interface MentionTextareaHandle {
  focus: () => void
  insert: (text: string) => void
}

interface Props {
  communityId: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  maxHeight?: number
  className?: string
  /** The box around the textarea (round 39, the chat's field: `min-w-0 flex-1`, so the words are as wide as the field in a row). */
  wrapClassName?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
  ariaLabel?: string
  maxLength?: number
  autoFocus?: boolean
  /** Put the caret after what the box starts with (a reply's "@name "), not before it. */
  caretAtEnd?: boolean
  /** People the page already knows, offered first (and alone for "@" with the member list closed). */
  nearby?: () => MentionPerson[]
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { communityId, value, onChange, placeholder, minRows = 1, maxHeight = 320, className = "", wrapClassName = "", onKeyDown, onFocus, ariaLabel, maxLength, autoFocus, caretAtEnd = false, nearby },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [at, setAt] = useState<{ start: number; query: string } | null>(null)
  const [people, setPeople] = useState<MentionPerson[]>([])
  const [index, setIndex] = useState(0)
  const [above, setAbove] = useState(false)
  const nearbyRef = useRef(nearby)
  nearbyRef.current = nearby

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    insert: (text: string) => {
      const el = area.current
      const pos = el ? el.selectionStart : value.length
      onChange(value.slice(0, pos) + text + value.slice(pos))
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(pos + text.length, pos + text.length)
      })
    },
  }))

  /* A reply's "@name ": the caret after it, on the frame the box is drawn (the browser would put it before the words). */
  useLayoutEffect(() => {
    const el = area.current
    if (!el || !caretAtEnd) return
    const end = el.value.length
    if (autoFocus && document.activeElement !== el) el.focus({ preventScroll: true })
    el.setSelectionRange(end, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Grow with the text. */
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(maxHeight, el.scrollHeight + 2)}px`
  }, [value, maxHeight])

  useEffect(() => {
    /* No community yet (the create wizard's welcome post, round 27): nobody to mention. */
    if (!at || !communityId) {
      setPeople([])
      return
    }
    const local = nearbyRef.current?.() ?? []
    /* What the page knows, at once; the server's follow. */
    setPeople(mentionChoices(at.query, local, []))
    setIndex(0)
    const ctrl = new AbortController()
    const t = window.setTimeout(
      async () => {
        const r = await api<{ members: MemberView[] }>(`${apiBase(communityId)}/members?q=${encodeURIComponent(at.query)}&limit=6`, { signal: ctrl.signal })
        if (!r.ok) return
        const found = r.data.members.filter((m) => m.username).map((m) => ({ id: m.userId, name: m.name, username: m.username as string, avatarUrl: m.avatarUrl }))
        setPeople(mentionChoices(at.query, local, found))
      },
      at.query ? 140 : 0,
    )
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [at, communityId])

  const look = useCallback(() => {
    const el = area.current
    if (!el) return
    setAt(mentionAt(el.value, el.selectionStart))
  }, [])

  const choose = (m: MentionPerson) => {
    if (!at || !m.username) return
    const el = area.current
    const caret = el ? el.selectionStart : value.length
    const insert = `@${m.username} `
    const next = value.slice(0, at.start) + insert + value.slice(caret)
    onChange(next)
    setAt(null)
    const pos = at.start + insert.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const open = !!at && people.length > 0

  /* Under the box, or above it when the visible part of the screen has no room under it. */
  useLayoutEffect(() => {
    if (!open) return
    const el = area.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vv = window.visualViewport
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
    setAbove(bottom - r.bottom < LIST_ROOM_PX && r.top > LIST_ROOM_PX)
  }, [open, value])

  return (
    <div className={`relative ${wrapClassName}`}>
      <textarea
        ref={area}
        value={value}
        rows={minRows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => {
          onChange(e.target.value)
          setAt(mentionAt(e.target.value, e.target.selectionStart))
        }}
        onClick={look}
        onBlur={() => window.setTimeout(() => setAt(null), 150)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              return setIndex((i) => (i + 1) % people.length)
            }
            if (e.key === "ArrowUp") {
              e.preventDefault()
              return setIndex((i) => (i - 1 + people.length) % people.length)
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault()
              return choose(people[index])
            }
            if (e.key === "Escape") {
              e.preventDefault()
              return setAt(null)
            }
          }
          onKeyDown?.(e)
        }}
        className={`block w-full resize-none bg-transparent outline-none placeholder:text-[#9ca3af] ${className}`}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open ? (
        <ul
          role="listbox"
          className={`absolute left-0 z-40 w-[min(320px,100%)] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white py-1 shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)] animate-in fade-in-0 duration-150 motion-reduce:animate-none ${above ? "bottom-full mb-1.5" : "top-full mt-1"}`}
          data-mention-list={above ? "above" : "below"}
        >
          {people.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                /* Chosen on the press, the caret (and a phone's keyboard) staying in the words. */
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(m)}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] ${i === index ? "bg-[#f1f2f4]" : ""}`}
                data-mention-option={m.username}
              >
                <MemberAvatar src={m.avatarUrl} name={m.name} alt="" size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{m.name}</span>
                  <span className="block truncate text-[12px] text-[#6b7280]">@{m.username}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
})
