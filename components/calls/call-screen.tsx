"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react"

import { formatCallDuration, type CallEnding } from "@/lib/calls/protocol"
import { InitialAvatar } from "@/components/ui/initial-avatar"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE SCREEN A CALL HAPPENS ON
 * ===========================================================================
 *
 * One component for both ends, because a call is one thing seen from two
 * sides and two components would drift into two designs. What differs is the
 * row of buttons at the bottom and one line of text; everything else — who it
 * is, their face, the state — is identical.
 *
 * IT IS A PORTAL ON THE BODY, AT THE TOP OF EVERYTHING. A call is the most
 * important thing on the screen for as long as it exists: it must cover the
 * pinned headers, the bottom navigation, an open bottom sheet, and anything
 * else that thinks it owns the foreground. Rendering it inside the tree would
 * put it inside somebody's stacking context, which is the exact bug fixed in
 * lib/marketplace/use-pinned-bar — a z-index only beats its own siblings.
 */

const RING_ANSWER = "bg-[#22c55e] active:bg-[#16a34a]"
const HANG_UP = "bg-[#ef4444] active:bg-[#dc2626]"

export function CallScreen({
  phase,
  ending,
  party,
  muted,
  startedAt,
  onAnswer,
  onDecline,
  onHangUp,
  onToggleMute,
}: {
  phase: "dialling" | "ringing" | "connecting" | "active" | "ended" | "idle"
  ending: CallEnding | null
  party: { id: string; name: string; avatar: string | null }
  muted: boolean
  /** Epoch ms the audio connected, or 0. The timer counts from here. */
  startedAt: number
  onAnswer(): void
  onDecline(): void
  onHangUp(): void
  onToggleMute(): void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Ticked only while there is a duration to draw. A one-second interval
  // running through a ringing phone is a re-render per second for a number
  // nobody is being shown.
  useEffect(() => {
    if (!startedAt || phase !== "active") return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [startedAt, phase])

  // A call has to survive the screen lock and the notification shade, and on a
  // phone that means it must not be scrolled away underneath. The body is
  // frozen for exactly as long as the call is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!mounted) return null

  const status =
    phase === "ringing"
      ? "Apel vocal"
      : phase === "dialling"
        ? "Sună…"
        : phase === "connecting"
          ? "Se conectează…"
          : phase === "active"
            ? formatCallDuration(Math.max(0, now - startedAt))
            : endingText(ending)

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-between",
        // Not a photograph behind blur: a call screen is looked at in the dark,
        // held to a face, and the only things that matter on it are a name and
        // two buttons.
        "bg-gradient-to-b from-[#2a1a4a] via-[#1c1230] to-[#120b1f] text-white",
        "call-screen-in px-6 pb-[calc(env(safe-area-inset-bottom,0px)+44px)] pt-[calc(env(safe-area-inset-top,0px)+72px)]",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={`Apel cu ${party.name}`}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className={cn("relative", phase === "ringing" && "call-pulse")}>
          <InitialAvatar name={party.name} url={party.avatar} seed={party.id} size={112} />
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-[26px] font-semibold leading-tight">{party.name}</span>
          <span
            className={cn(
              "text-[15px] font-medium tabular-nums",
              phase === "ended" ? "text-white/50" : "text-white/65",
            )}
          >
            {status}
          </span>
        </div>
      </div>

      {phase === "ringing" ? (
        // INCOMING: two equal choices, far apart.
        //
        // Deliberately not a single button that changes meaning, and
        // deliberately not adjacent: these are the two most consequential
        // buttons in the app and they are pressed by somebody who has just been
        // startled by a noise. Hitting the wrong one hangs up on a person.
        <div className="flex w-full max-w-[320px] items-center justify-between">
          <CallButton label="Refuză" onClick={onDecline} className={HANG_UP}>
            <PhoneOff className="h-[26px] w-[26px]" />
          </CallButton>
          <CallButton label="Răspunde" onClick={onAnswer} className={cn(RING_ANSWER, "call-answer-pulse")}>
            <Phone className="h-[26px] w-[26px]" />
          </CallButton>
        </div>
      ) : phase === "ended" ? (
        <div className="h-[68px]" />
      ) : (
        <div className="flex w-full max-w-[320px] items-center justify-center gap-8">
          <CallButton
            label={muted ? "Activează microfonul" : "Oprește microfonul"}
            onClick={onToggleMute}
            className={muted ? "bg-white text-neutral-900 active:bg-white/85" : "bg-white/15 active:bg-white/25"}
            // Only meaningful once there is audio to mute; visible throughout so
            // the row does not change shape the moment a call connects.
            disabled={phase === "dialling"}
          >
            {muted ? <MicOff className="h-[23px] w-[23px]" /> : <Mic className="h-[23px] w-[23px]" />}
          </CallButton>
          <CallButton label="Închide" onClick={onHangUp} className={HANG_UP}>
            <PhoneOff className="h-[26px] w-[26px]" />
          </CallButton>
        </div>
      )}
    </div>,
    document.body,
  )
}

function endingText(ending: CallEnding | null): string {
  switch (ending) {
    case "declined":
      return "Apel refuzat"
    case "missed":
      return "Fără răspuns"
    case "cancelled":
      return "Apel anulat"
    case "failed":
      // Named rather than "a apărut o eroare", because there is something the
      // person can actually do about this one.
      return "Conexiunea nu a putut fi stabilită"
    default:
      return "Apel încheiat"
  }
}

function CallButton({
  label,
  onClick,
  className,
  disabled,
  children,
}: {
  label: string
  onClick(): void
  className?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-[68px] w-[68px] items-center justify-center rounded-full text-white",
        "[-webkit-tap-highlight-color:transparent] touch-manipulation select-none",
        "transition-[background-color,transform] duration-200 ease-out active:duration-0",
        "disabled:opacity-35",
        className,
      )}
    >
      {children}
    </button>
  )
}
