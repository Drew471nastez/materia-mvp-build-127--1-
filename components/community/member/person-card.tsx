"use client"

/**
 * ===========================================================================
 *  THE CARD ON A PERSON, INSIDE A COMMUNITY
 * ===========================================================================
 * Resting the pointer on a name or a face in a community (the feed, a post's
 * comments, the members list, the leaderboard, the chat) opens a small card
 * about that person: their photo, with their level here while the community
 * counts points, their name and handle, when they were last here, their bio,
 * how many public communities they are in (and how many of those you share),
 * how many they own, and Profile / Follow / Message. Every figure is counted
 * on the server from real rows (lib/communities/server/people.ts); what is
 * not known is left out, never guessed.
 *
 * ONE LAYER FOR THE WHOLE FRAME. Nothing wraps each name: a link that opens
 * a person carries data-person-id, and this layer listens once on the
 * document. It opens after the pointer rests CARD_OPEN_MS on a name, waits
 * CARD_GRACE_MS after it leaves so it can cross the gap into the card, and
 * stays while the pointer or focus is inside it. Keyboard focus on a name
 * opens it the same way (focus-visible only, so a click does not), Tab then
 * moves into the card, Escape closes it and gives focus back to the name.
 *
 * NEVER ON TOUCH. A finger has no hover: on a phone a tap on a name is a tap
 * and opens the person's page, as it always did. Scrolling closes the card.
 *
 * Message opens the conversation in the messages panel, in place
 * (openMessages), never another page.
 */
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, Clock3 } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { useFollow } from "@/components/profile/follow-button"
import { api, apiBase } from "./api"
import { openMessages } from "./messages"
import { activeLabel, CARD_GRACE_MS, CARD_OPEN_MS, CARD_TTL_MS, communitiesLine, hoverPointer, ownerLine } from "./person-card-facts"
import { toast } from "./toast"
import { BTN } from "./ui"
import type { PersonCardView } from "./view-types"
import { RoleBadge } from "./role-badge"

const WIDTH = 344
const GAP = 8
const EDGE = 12
const EXIT_MS = 120

type Open = { anchor: HTMLElement; userId: string; person: PersonCardView; leaving: boolean }

/** Facts already read in this page, by person, for a minute. */
const cache = new Map<string, { at: number; person: PersonCardView }>()

function personAnchor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const a = target.closest<HTMLElement>("[data-person-id]")
  return a && a.dataset.personId ? a : null
}

export function PersonCardLayer({ communityId, canMessage }: { communityId: string; canMessage: boolean }) {
  const [open, setOpen] = useState<Open | null>(null)
  const openRef = useRef<Open | null>(null)
  openRef.current = open
  const cardRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)
  const pending = useRef<HTMLElement | null>(null)
  /* A name focus was handed back to by the card itself: that focus does not open the card again. */
  const quiet = useRef<HTMLElement | null>(null)

  const load = useCallback(
    async (userId: string): Promise<PersonCardView | null> => {
      const hit = cache.get(userId)
      if (hit && Date.now() - hit.at < CARD_TTL_MS) return hit.person
      const r = await api<{ person: PersonCardView }>(`${apiBase(communityId)}/people/${encodeURIComponent(userId)}/card`)
      if (!r.ok) return null
      cache.set(userId, { at: Date.now(), person: r.data.person })
      return r.data.person
    },
    [communityId],
  )

  const close = useCallback((now = false) => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
    pending.current = null
    const cur = openRef.current
    if (!cur) return
    if (now) return setOpen(null)
    setOpen({ ...cur, leaving: true })
    closeTimer.current = window.setTimeout(() => setOpen(null), EXIT_MS)
  }, [])

  const scheduleClose = useCallback(() => {
    window.clearTimeout(openTimer.current)
    pending.current = null
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => close(), CARD_GRACE_MS)
  }, [close])

  const keep = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    const cur = openRef.current
    if (cur?.leaving) setOpen({ ...cur, leaving: false })
  }, [])

  const scheduleOpen = useCallback(
    (anchor: HTMLElement) => {
      const userId = anchor.dataset.personId as string
      const cur = openRef.current
      if (cur && !cur.leaving && cur.userId === userId && cur.anchor === anchor) return keep()
      if (pending.current === anchor) return
      window.clearTimeout(openTimer.current)
      pending.current = anchor
      const started = Date.now()
      /* The facts are asked for while the pointer rests, so the card opens on time with them. */
      const facts = load(userId)
      openTimer.current = window.setTimeout(async () => {
        const person = await facts
        if (pending.current !== anchor || !person || !anchor.isConnected) return
        pending.current = null
        window.clearTimeout(closeTimer.current)
        setOpen({ anchor, userId, person, leaving: false })
      }, Math.max(0, CARD_OPEN_MS - (Date.now() - started)))
    },
    [keep, load],
  )

  useEffect(() => {
    const inCard = (n: EventTarget | null) => !!(n instanceof Node && cardRef.current?.contains(n))
    const onOver = (e: PointerEvent) => {
      if (!hoverPointer(e.pointerType)) return
      if (inCard(e.target)) return keep()
      const anchor = personAnchor(e.target)
      if (anchor) scheduleOpen(anchor)
    }
    const onOut = (e: PointerEvent) => {
      if (!hoverPointer(e.pointerType)) return
      const from = inCard(e.target) ? cardRef.current : personAnchor(e.target)
      if (!from) return
      const to = e.relatedTarget
      if (to instanceof Node && (from.contains(to) || inCard(to) || openRef.current?.anchor.contains(to))) return
      if (pending.current && !(to instanceof Node && pending.current.contains(to))) {
        window.clearTimeout(openTimer.current)
        pending.current = null
      }
      if (openRef.current) scheduleClose()
    }
    const onFocusIn = (e: FocusEvent) => {
      if (inCard(e.target)) return keep()
      const anchor = personAnchor(e.target)
      if (!anchor) return
      if (quiet.current === anchor) {
        quiet.current = null
        return
      }
      let visible = false
      try {
        visible = anchor.matches(":focus-visible")
      } catch {
        visible = false
      }
      if (visible) scheduleOpen(anchor)
    }
    const onFocusOut = (e: FocusEvent) => {
      const to = e.relatedTarget
      if (to instanceof Node && (inCard(to) || openRef.current?.anchor.contains(to))) return
      if (inCard(e.target) || personAnchor(e.target)) {
        if (pending.current && personAnchor(e.target) === pending.current) {
          window.clearTimeout(openTimer.current)
          pending.current = null
        }
        if (openRef.current) scheduleClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const cur = openRef.current
      if (!cur) return
      if (e.key === "Escape") {
        const back = inCard(document.activeElement) ? cur.anchor : null
        close(true)
        if (back) {
          quiet.current = back
          back.focus()
        }
        return
      }
      if (e.key !== "Tab") return
      const card = cardRef.current
      if (!card) return
      const stops = [...card.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")]
      if (!stops.length) return
      /* From the name, Tab steps into the card; off its last control, back to the name. */
      if (document.activeElement === cur.anchor && !e.shiftKey) {
        e.preventDefault()
        stops[0].focus()
      } else if (inCard(document.activeElement)) {
        const at = stops.indexOf(document.activeElement as HTMLElement)
        if ((e.shiftKey && at === 0) || (!e.shiftKey && at === stops.length - 1)) {
          e.preventDefault()
          quiet.current = cur.anchor
          close(true)
          cur.anchor.focus()
        }
      }
    }
    const onScroll = (e: Event) => {
      if (inCard(e.target)) return
      if (openRef.current || pending.current) close(true)
    }
    const onDown = (e: PointerEvent) => {
      if (openRef.current && !inCard(e.target) && !openRef.current.anchor.contains(e.target as Node)) close(true)
    }
    document.addEventListener("pointerover", onOver, true)
    document.addEventListener("pointerout", onOut, true)
    document.addEventListener("focusin", onFocusIn, true)
    document.addEventListener("focusout", onFocusOut, true)
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("pointerdown", onDown, true)
    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      document.removeEventListener("pointerover", onOver, true)
      document.removeEventListener("pointerout", onOut, true)
      document.removeEventListener("focusin", onFocusIn, true)
      document.removeEventListener("focusout", onFocusOut, true)
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("scroll", onScroll, { capture: true })
      window.removeEventListener("resize", onScroll)
      window.clearTimeout(openTimer.current)
      window.clearTimeout(closeTimer.current)
    }
  }, [close, keep, scheduleClose, scheduleOpen])

  if (!open || typeof document === "undefined") return null
  return createPortal(
    <PersonCard
      key={open.userId + (open.anchor.dataset.personKey ?? "")}
      ref={cardRef}
      anchor={open.anchor}
      person={open.person}
      leaving={open.leaving}
      canMessage={canMessage && open.person.canMessage && !open.person.isSelf}
      onFollowed={(following) => {
        const hit = cache.get(open.userId)
        if (hit) cache.set(open.userId, { at: hit.at, person: { ...hit.person, following } })
      }}
      onDone={() => close(true)}
    />,
    document.body,
  )
}

/* ── the card ──────────────────────────────────────────────────────────── */

interface CardProps {
  anchor: HTMLElement
  person: PersonCardView
  leaving: boolean
  canMessage: boolean
  onFollowed: (following: boolean) => void
  onDone: () => void
  ref: React.Ref<HTMLDivElement>
}

/**
 * Where the card goes: under the name, or over it when there is no room
 * below; its left edge at the name's, kept 12px inside the window. The first
 * frame already stands under the name (from a typical height); once the card
 * is measured, before it is painted, it moves over the name only when it
 * would not fit below. It never appears in one place and jumps.
 */
function place(anchor: HTMLElement, height: number): { left: number; top: number; above: boolean } {
  const r = anchor.getBoundingClientRect()
  const width = Math.min(WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE))
  const below = r.bottom + GAP
  const above = below + height > window.innerHeight - EDGE && r.top - GAP - height >= EDGE
  return { left: Math.round(left), top: Math.round(above ? r.top - GAP - height : below), above }
}

function usePlacement(anchor: HTMLElement, card: React.RefObject<HTMLDivElement | null>) {
  const [at, setAt] = useState(() => place(anchor, 250))
  useLayoutEffect(() => {
    const next = place(anchor, card.current?.offsetHeight ?? 250)
    setAt((cur) => (cur.left === next.left && cur.top === next.top ? cur : next))
  }, [anchor, card])
  return at
}

function PersonCard({ anchor, person, leaving, canMessage, onFollowed, onDone, ref }: CardProps) {
  const inner = useRef<HTMLDivElement | null>(null)
  const at = usePlacement(anchor, inner)
  /* The profile's Follow logic (components/profile/follow-button.tsx): the press flips it at once, the server hears the last one in the background. */
  const follow = useFollow({
    targetUserId: person.id,
    initialFollowing: person.following,
    signedIn: true,
    onChange: onFollowed,
    onError: (message) => toast(message === "Not signed in" ? "Sign in to follow people." : message),
  })
  const following = follow.following
  const active = activeLabel(person.activeAt)
  const lines = [communitiesLine(person.communities), ownerLine(person.owns)].filter(Boolean)
  const hasPage = person.href !== "/"

  const setRefs = (el: HTMLDivElement | null) => {
    inner.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
  }

  const buttons: React.ReactNode[] = []
  if (hasPage)
    buttons.push(
      <Link key="profile" href={person.href} onClick={onDone} className={`${BTN} h-9 flex-1 border border-[#e3e4e8] bg-white px-3 text-[13.5px] text-[#1a1a2e] hover:bg-[#f6f7f8]`} data-person-card-profile="">
        Profile
      </Link>,
    )
  if (!person.isSelf)
    buttons.push(
      <button
        key="follow"
        type="button"
        onClick={follow.toggle}
        aria-pressed={following}
        aria-busy={follow.busy || undefined}
        className={`${BTN} h-9 flex-1 touch-manipulation border px-3 text-[13.5px] ${following ? "border-[#e3e4e8] bg-[#f4f5f7] text-[#1a1a2e] hover:bg-[#eceef1]" : "border-[#e3e4e8] bg-white text-[#1a1a2e] hover:bg-[#f6f7f8]"}`}
        data-person-card-follow={following ? "following" : "follow"}
      >
        {following ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
            Following
          </>
        ) : (
          "Follow"
        )}
      </button>,
    )
  if (canMessage)
    buttons.push(
      <button
        key="message"
        type="button"
        onClick={() => {
          onDone()
          openMessages({ userId: person.id })
        }}
        className={`${BTN} h-9 flex-1 bg-[#1a1a2e] px-3 text-[13.5px] text-white hover:bg-[#2b2b42]`}
        data-person-card-message=""
      >
        Message
      </button>,
    )

  return (
    <div
      ref={setRefs}
      role="dialog"
      aria-label={person.name}
      data-person-card={person.id}
      data-leaving={leaving ? "true" : undefined}
      style={{ left: at.left, top: at.top, width: `min(${WIDTH}px, calc(100vw - ${EDGE * 2}px))` }}
      className={`fixed z-[105] rounded-2xl border border-[#e5e7eb] bg-white p-4 text-left shadow-[0_20px_48px_-16px_rgba(17,24,39,0.26),0_2px_6px_rgba(17,24,39,0.05)] ease-sheet motion-reduce:animate-none ${
        leaving ? "animate-out fade-out-0 zoom-out-98 duration-[120ms] fill-mode-forwards" : `animate-in fade-in-0 zoom-in-98 duration-150 ${at.above ? "slide-in-from-bottom-1" : "slide-in-from-top-1"}`
      }`}
    >
      <div className="flex gap-3.5">
        <span className="relative shrink-0 self-start">
          <AppAvatar src={person.avatarUrl} name={person.name} alt="" size={64} markWhileLoading />
          {person.level ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#1a1a2e] px-1 text-[11.5px] font-semibold tabular-nums text-white ring-2 ring-white"
              title={`Level ${person.level}${person.levelName ? `, ${person.levelName}` : ""}`}
              data-person-card-level=""
            >
              {person.level}
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[16px] font-semibold leading-6 text-[#1a1a2e]">{person.name}</span>
            <RoleBadge role={person.role} />
          </p>
          <p className="truncate text-[13px] leading-5 text-[#6b7280]">
            {[person.username ? `@${person.username}` : null, person.level ? `Level ${person.level}${person.levelName ? ` ${person.levelName}` : ""}` : null].filter(Boolean).join(" · ")}
          </p>
          {active ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] leading-5 text-[#6b7280]" data-person-card-active="">
              {active === "Online now" ? <span className="h-2 w-2 rounded-full bg-[#16a34a]" aria-hidden /> : <Clock3 className="h-3.5 w-3.5 text-[#9ca3af]" strokeWidth={2} aria-hidden />}
              <span suppressHydrationWarning>{active}</span>
            </p>
          ) : null}
        </div>
      </div>
      {person.bio ? <p className="mt-3 line-clamp-3 whitespace-pre-line text-[14px] leading-[1.45] text-[#262633]">{person.bio}</p> : null}
      {lines.length ? (
        <ul className="mt-3 space-y-0.5 text-[13px] font-medium leading-5 text-[#1a1a2e]" data-person-card-facts="">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {buttons.length ? (
        <div className="mt-4 flex gap-2">
          {buttons}
        </div>
      ) : null}
    </div>
  )
}
