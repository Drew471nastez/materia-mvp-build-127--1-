"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Ban, BadgeCheck, ChevronRight, HelpCircle, Trash2, UserRound } from "lucide-react"
import { navigateBlended } from "@/lib/nav-blend"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * Everything you can do ABOUT a conversation, as opposed to in it.
 *
 * A sheet rather than a page, deliberately: these actions are all about the
 * thread you are currently looking at — the point of "block this person" is
 * which person — and navigating away to decide would put a route change, a
 * fetch and a back button between you and something you should be able to do in
 * two taps and abandon in one. It comes up over the conversation, which stays
 * visible behind it.
 *
 * ---------------------------------------------------------------------------
 * It follows your finger
 * ---------------------------------------------------------------------------
 * A sheet you can only dismiss by hitting a small × is a web page pretending to
 * be an app. This one is dragged: the transform tracks the pointer in real time,
 * the scrim fades in proportion to how far down it has been pulled, and letting
 * go either throws it away or springs it back — decided by distance OR by
 * velocity, so a short fast flick closes it exactly like a long slow drag does.
 *
 * Nothing in that gesture goes through React. A drag is sixty state updates a
 * second, and sixty re-renders of a list of rows is precisely how a sheet ends
 * up feeling like a web page; the transform and the scrim's opacity are written
 * straight to the two nodes, so a drag is one compositor property on each.
 *
 * Destructive things ask twice, in place. A confirm that swaps the row for
 * "are you sure / cancel" beats a browser dialog: it cannot be dismissed by
 * accident, it says what will actually happen in the app's own voice, and it
 * does not steal focus from a keyboard that may be open behind it.
 */

type Other = { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null

type Confirming = "block" | "delete" | null

/** The curve iOS uses for a sheet: quick off the mark, long glide to rest. */
const SPRING = "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)"
const SCRIM_TWEEN = "opacity 380ms cubic-bezier(0.32, 0.72, 0, 1)"
/** Past this share of its own height, letting go throws it away. */
const DISMISS_RATIO = 0.28
/** …or past this speed, in px/ms, however far it got. A flick is an intention. */
const DISMISS_VELOCITY = 0.55

export function ThreadDetails({
  conversationId,
  other,
  official,
  open,
  onClose,
}: {
  conversationId: string
  other: Other
  official?: boolean
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [blocked, setBlocked] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  /** Kept mounted through the closing animation, so it can be watched leaving. */
  const [mounted, setMounted] = useState(open)

  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const name = other?.display_name || other?.username || "Utilizator"

  // ---- open / close -------------------------------------------------------
  const settle = useCallback((to: "open" | "closed") => {
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return
    sheet.style.transition = SPRING
    scrim.style.transition = SCRIM_TWEEN
    sheet.style.transform = to === "open" ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)"
    scrim.style.opacity = to === "open" ? "1" : "0"
  }, [])

  const dismiss = useCallback(() => {
    settle("closed")
    // Long enough for the spring above to finish. Unmounting mid-animation is
    // the sheet vanishing rather than leaving, which is the whole thing this is
    // built to avoid.
    window.setTimeout(onClose, 340)
  }, [onClose, settle])

  useEffect(() => {
    if (open) {
      setMounted(true)
      setConfirming(null)
      setReporting(false)
      return
    }
    // Closed from outside (an action completing) — play it out, then unmount.
    if (!mounted) return
    settle("closed")
    const t = window.setTimeout(() => setMounted(false), 340)
    return () => window.clearTimeout(t)
  }, [open, mounted, settle])

  // Start below the frame, then spring up on the NEXT frame. Rendering it
  // already in place can only ever pop; two separate style commits are what give
  // the browser something to animate between.
  useEffect(() => {
    if (!mounted || !open) return
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return
    sheet.style.transition = "none"
    sheet.style.transform = "translate3d(0, 100%, 0)"
    scrim.style.transition = "none"
    scrim.style.opacity = "0"
    // Force the start state to be committed before the target replaces it.
    void sheet.offsetHeight
    const raf = requestAnimationFrame(() => settle("open"))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open, settle])

  // ---- the drag -----------------------------------------------------------
  const drag = useRef({ active: false, startY: 0, dy: 0, lastY: 0, lastT: 0, v: 0 })

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // A drag that begins while the content is scrolled would fight the scroll.
    // At the top there is nothing above to reach, so the gesture is the sheet's.
    const body = bodyRef.current
    if (body && body.scrollTop > 0) return
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return
    drag.current = { active: true, startY: e.clientY, dy: 0, lastY: e.clientY, lastT: performance.now(), v: 0 }
    sheet.style.transition = "none"
    scrim.style.transition = "none"
    sheet.setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d.active) return
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return

    let dy = e.clientY - d.startY
    // Upward gets a quarter of the travel: there is nowhere above for the sheet
    // to go, and refusing outright makes the gesture feel dead rather than
    // bounded.
    if (dy < 0) dy *= 0.25

    const now = performance.now()
    const dt = now - d.lastT
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = now
    d.dy = dy

    sheet.style.transform = `translate3d(0, ${dy}px, 0)`
    const h = sheet.offsetHeight || 1
    scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / h))
  }, [])

  const onPointerUp = useCallback(() => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    const sheet = sheetRef.current
    if (!sheet) return
    const h = sheet.offsetHeight || 1
    if (d.dy > h * DISMISS_RATIO || d.v > DISMISS_VELOCITY) {
      void triggerHaptic("light")
      dismiss()
    } else {
      settle("open")
    }
  }, [dismiss, settle])

  // ---- data ---------------------------------------------------------------
  // Only asked while the sheet is up: whether you have blocked someone is not
  // something the conversation behind it needs to know.
  useEffect(() => {
    if (!open || blocked !== null) return
    let alive = true
    fetch(`/api/messages/${conversationId}/actions`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setBlocked(!!d.blocked)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, conversationId, blocked])

  const act = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      if (busy) return null
      setBusy(true)
      try {
        const r = await fetch(`/api/messages/${conversationId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action, ...extra }),
        })
        return r.ok ? await r.json() : null
      } catch {
        return null
      } finally {
        setBusy(false)
      }
    },
    [busy, conversationId],
  )

  // Leaving a thread is a POP and has to look like one — a hard replace drops
  // you onto the inbox with no motion at all, which after a deliberate,
  // confirmed action reads as the app losing its place rather than obeying you.
  // The sheet goes down first so the screen behind it is not animating under a
  // scrim.
  const leaveToInbox = useCallback(() => {
    settle("closed")
    window.setTimeout(() => {
      onClose()
      navigateBlended("back", () => router.replace("/messages"))
    }, 300)
  }, [onClose, router, settle])

  const onBlock = useCallback(async () => {
    void triggerHaptic("light")
    const res = await act(blocked ? "unblock" : "block")
    if (!res) return
    setBlocked(!!res.blocked)
    setConfirming(null)
    if (res.blocked) leaveToInbox()
  }, [act, blocked, leaveToInbox])

  const onDelete = useCallback(async () => {
    void triggerHaptic("light")
    const res = await act("delete")
    if (!res) return
    leaveToInbox()
  }, [act, leaveToInbox])

  const onReport = useCallback(
    async (reason: string) => {
      void triggerHaptic("light")
      const res = await act("report", { reason })
      if (!res) return
      setReported(true)
      setReporting(false)
    },
    [act],
  )

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Detalii conversație">
      {/* The conversation stays visible under here on purpose — this sheet is
          about it, and hiding it would make you decide from memory. */}
      <div
        ref={scrimRef}
        onClick={dismiss}
        className="absolute inset-0 bg-black/45"
        style={{ opacity: 0 }}
      />

      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto flex max-h-[86dvh] max-w-lg flex-col rounded-t-3xl bg-white",
          "shadow-[0_-8px_44px_rgba(0,0,0,0.2)] will-change-transform",
        )}
        style={{ transform: "translate3d(0, 100%, 0)" }}
      >
        {/* The grab area. `touch-action: none` here and only here: the browser
            must not claim this gesture for a scroll before the handler sees it,
            and everything below still scrolls normally. */}
        <div className="shrink-0 cursor-grab pt-2.5 active:cursor-grabbing" style={{ touchAction: "none" }}>
          <span aria-hidden className="mx-auto block h-1.5 w-10 rounded-full bg-neutral-200" />

          {/* Who this is about, stated at the top, so every row below reads
              unambiguously as being about THEM. Part of the handle area, because
              the whole header is a natural place to grab a sheet. */}
          <div className="flex items-center gap-3 px-5 pb-4 pt-4">
            {other?.avatar_url ? (
              <Image src={other.avatar_url} alt="" width={52} height={52} className="h-13 w-13 rounded-full object-cover" style={{ height: 52, width: 52 }} />
            ) : (
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#7c3aed]/10 text-[19px] font-semibold text-[#7c3aed]">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1">
                <span className="truncate text-[18px] font-semibold text-neutral-900">{name}</span>
                {official && <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-[#1d9bf0]" />}
              </span>
              {other?.username && <span className="truncate text-[13.5px] text-neutral-500">@{other.username}</span>}
            </span>
          </div>
        </div>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
          style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 4px), 14px)" }}
        >
          {/* Storelib has no member page and cannot be reported to itself. */}
          {!official && other?.username && (
            <Row
              icon={<UserRound className="h-[19px] w-[19px]" />}
              label="Vezi profilul"
              href={`/member/${encodeURIComponent(other.username)}`}
              onNavigate={onClose}
            />
          )}
          <Row icon={<HelpCircle className="h-[19px] w-[19px]" />} label="Ajutor" href="/help" onNavigate={onClose} />

          {!official && (
            <>
              {reported ? (
                <div className="px-3 py-3.5 text-[14.5px] text-neutral-500">
                  Raportare trimisă. Echipa noastră o va analiza.
                </div>
              ) : reporting ? (
                <div className="px-1 py-1">
                  <p className="px-2 pb-1 pt-2 text-[12.5px] font-semibold uppercase tracking-wide text-neutral-400">
                    Ce s-a întâmplat?
                  </p>
                  {(
                    [
                      ["spam", "Spam sau reclame"],
                      ["scam", "Încercare de înșelătorie"],
                      ["harassment", "Hărțuire sau limbaj abuziv"],
                      ["counterfeit", "Produs contrafăcut"],
                      ["other", "Altceva"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={busy}
                      onClick={() => void onReport(value)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-3.5 text-left text-[15.5px] text-neutral-800 transition-colors active:bg-neutral-100 disabled:opacity-50"
                    >
                      {label}
                      <ChevronRight className="h-4 w-4 text-neutral-300" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setReporting(false)}
                    className="mt-1 w-full rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-500 transition-colors active:bg-neutral-100"
                  >
                    Renunță
                  </button>
                </div>
              ) : (
                <Row
                  icon={<AlertTriangle className="h-[19px] w-[19px]" />}
                  label="Raportează"
                  onClick={() => setReporting(true)}
                />
              )}

              <Confirmable
                icon={<Ban className="h-[19px] w-[19px]" />}
                label={blocked ? "Deblochează" : "Blochează"}
                danger={!blocked}
                // Unblocking is not destructive and does not need a second tap.
                needsConfirm={!blocked}
                confirmLabel="Blochează"
                note="Nu vei mai primi mesaje de la această persoană, iar conversația dispare din listă."
                active={confirming === "block"}
                onArm={() => setConfirming(confirming === "block" ? null : "block")}
                onConfirm={onBlock}
                busy={busy}
              />
            </>
          )}

          <Confirmable
            icon={<Trash2 className="h-[19px] w-[19px]" />}
            label="Șterge conversația"
            danger
            needsConfirm
            confirmLabel="Șterge"
            note="Dispare din lista ta. Cealaltă persoană își păstrează conversația."
            active={confirming === "delete"}
            onArm={() => setConfirming(confirming === "delete" ? null : "delete")}
            onConfirm={onDelete}
            busy={busy}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

const ROW = "flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[15.5px] transition-colors active:bg-neutral-100"

function Row({
  icon,
  label,
  href,
  onClick,
  onNavigate,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  onClick?: () => void
  onNavigate?: () => void
}) {
  const body = (
    <>
      <span className="text-neutral-500">{icon}</span>
      <span className="flex-1 text-neutral-900">{label}</span>
      <ChevronRight className="h-4 w-4 text-neutral-300" />
    </>
  )
  if (href) {
    return (
      <Link href={href} prefetch onClick={onNavigate} className={ROW}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={ROW}>
      {body}
    </button>
  )
}

/**
 * A row that asks again before doing anything you cannot take back.
 *
 * The confirmation replaces the row in place rather than opening a dialog, so
 * what you are confirming stays exactly where your finger already is — and the
 * consequence is spelled out, because "are you sure?" is not information.
 */
function Confirmable({
  icon,
  label,
  danger,
  needsConfirm,
  confirmLabel,
  note,
  active,
  onArm,
  onConfirm,
  busy,
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  needsConfirm: boolean
  confirmLabel: string
  note: string
  active: boolean
  onArm: () => void
  onConfirm: () => void
  busy: boolean
}) {
  if (active && needsConfirm) {
    return (
      <div className="rounded-xl bg-neutral-50 px-3 py-3">
        <p className="text-[13.5px] leading-snug text-neutral-600">{note}</p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onArm}
            className="flex-1 rounded-full border border-neutral-200 py-2.5 text-[14.5px] font-semibold text-neutral-700 transition-transform active:scale-[0.97]"
          >
            Renunță
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-full bg-red-600 py-2.5 text-[14.5px] font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={needsConfirm ? onArm : onConfirm}
      className={cn(ROW, "disabled:opacity-50")}
    >
      <span className={danger ? "text-red-500" : "text-neutral-500"}>{icon}</span>
      <span className={cn("flex-1", danger ? "text-red-600" : "text-neutral-900")}>{label}</span>
    </button>
  )
}
