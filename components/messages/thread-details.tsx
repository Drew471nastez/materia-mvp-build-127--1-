"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Ban, BadgeCheck, ChevronRight, Trash2, UserRound } from "lucide-react"
import { BottomSheet, SHEET_ROW } from "@/components/ui/bottom-sheet"
import { InitialAvatar } from "@/components/ui/initial-avatar"
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
 * The sheet itself — the spring, the finger-tracking, the flick-to-dismiss —
 * lives in components/ui/bottom-sheet.tsx, shared with the press-and-hold
 * actions on a message. Two copies of a gesture that fiddly is two places for it
 * to be subtly different.
 *
 * Destructive things ask twice, in place. A confirm that swaps the row for
 * "are you sure / cancel" beats a browser dialog: it cannot be dismissed by
 * accident, it says what will actually happen in the app's own voice, and it
 * does not steal focus from a keyboard that may be open behind it.
 */

type Other = { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null

type Confirming = "block" | "delete" | null


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
  const name = other?.display_name || other?.username || "Utilizator"

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
    onClose()
    window.setTimeout(() => {
      navigateBlended("back", () => {
        router.replace("/messages")
        // Not optional, and the reason delete could look like it had not
        // worked: the inbox is a dynamic route held in the client router cache
        // for three minutes, so replacing into it serves the copy from before
        // the row was hidden — the thread you just deleted, still sitting
        // there. refresh() re-renders it on the server, where the delete is
        // already true.
        router.refresh()
      })
    }, 300)
  }, [onClose, router])

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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      label="Detalii conversație"
      header={
        // Who this is about, stated at the top, so every row below reads
        // unambiguously as being about THEM. Inside the grab area, because the
        // header is the natural place to take hold of a sheet.
        <div className="flex items-center gap-3 px-5 pb-4 pt-4">
          <InitialAvatar name={other?.display_name || other?.username} url={other?.avatar_url} seed={other?.id} size={52} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1">
              <span className="truncate text-[18px] font-semibold text-neutral-900">{name}</span>
              {official && <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-[#1d9bf0]" />}
            </span>
            {other?.username && <span className="truncate text-[13.5px] text-neutral-500">@{other.username}</span>}
          </span>
        </div>
      }
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
    </BottomSheet>
  )
}

const ROW = SHEET_ROW

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
