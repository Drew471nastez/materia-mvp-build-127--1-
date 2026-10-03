"use client"

/**
 * A text box that knows @. Typing @ and a few letters asks the members route
 * for up to six people whose name or username starts that way (a short
 * search, so it works even with the member list switched off), and a choice
 * puts their @username in the text. Arrow keys, Enter and Tab choose; Escape
 * closes. Members without a username cannot be mentioned, so they are not
 * offered. The box grows with what is typed, up to a limit.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import type { MemberView } from "@/lib/communities/types"
import { api, apiBase } from "./api"

const AT = /(^|[\s(])@([a-z0-9_.-]{1,30})$/i

/** The @word being typed just before the caret, if any. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = AT.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

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
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
  ariaLabel?: string
  maxLength?: number
  autoFocus?: boolean
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { communityId, value, onChange, placeholder, minRows = 1, maxHeight = 320, className = "", onKeyDown, onFocus, ariaLabel, maxLength, autoFocus },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [at, setAt] = useState<{ start: number; query: string } | null>(null)
  const [people, setPeople] = useState<MemberView[]>([])
  const [index, setIndex] = useState(0)

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

  /* Grow with the text. */
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(maxHeight, el.scrollHeight + 2)}px`
  }, [value, maxHeight])

  useEffect(() => {
    if (!at) {
      setPeople([])
      return
    }
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ members: MemberView[] }>(`${apiBase(communityId)}/members?q=${encodeURIComponent(at.query)}&limit=6`, { signal: ctrl.signal })
      if (r.ok) {
        setPeople(r.data.members.filter((m) => m.username))
        setIndex(0)
      }
    }, 140)
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

  const choose = (m: MemberView) => {
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
  return (
    <div className="relative">
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
        <ul role="listbox" className="absolute left-0 top-full z-30 mt-1 w-[min(320px,100%)] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white py-1 shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22)]" data-mention-list="">
          {people.map((m, i) => (
            <li key={m.userId} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(m)}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 text-left ${i === index ? "bg-[#f1f2f4]" : ""}`}
              >
                <AppAvatar src={m.avatarUrl} name={m.name} alt="" size={28} markWhileLoading />
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
