"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, X } from "lucide-react"

/**
 * The one thing a marketplace has to say before two strangers start talking.
 *
 * Every platform where money moves between people who have never met carries
 * this, in the conversation rather than in a help page, because the moment it
 * matters is the moment somebody is being asked for their IBAN "so we can
 * arrange it outside the app". It is the cheapest fraud control there is and
 * the only one that works before anything has gone wrong.
 *
 * ---------------------------------------------------------------------------
 * Where it sits, and why that changed twice
 * ---------------------------------------------------------------------------
 * It began as a full-width panel with three lines of copy inside the message
 * list, which made a warning nobody asked for the largest thing on a screen
 * somebody had come to read. It then became a small floating chip, which was
 * subtle enough but put a second object on top of the exchange — one more thing
 * between you and the messages.
 *
 * This is neither: a slim band BELOW THE HEADER and above the conversation, so
 * it is part of the screen's chrome rather than part of the conversation. The
 * exchange starts under it and is never overlapped by it. It reads as
 * something the app is telling you, which is what it is, instead of as
 * something in the thread.
 *
 * Two lines of copy at most, and dismissible for good: a banner that returns on
 * every visit trains the exact habit it exists to interrupt.
 *
 * It renders nothing until the stored answer has been read, because rendering
 * it and removing it a frame later is a flash across the top of every
 * conversation you open.
 */

const KEY = "storelib_chat_safety_dismissed_v1"

export function SafetyNotice() {
  /** null while unknown — see above. */
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1")
    } catch {
      // Private mode, or storage disabled. Showing it is the safe failure: a
      // notice seen twice beats a warning nobody ever gets.
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div className="shrink-0 border-b border-[#7c3aed]/[0.09] bg-[#7c3aed]/[0.045] px-3 py-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-[15px] w-[15px] shrink-0 text-[#7c3aed]" strokeWidth={2.3} />
        <p className="min-w-0 flex-1 text-[12px] leading-[1.4] text-neutral-600">
          Nu da date bancare sau personale. Plătește doar prin Storelib.
        </p>
        <button
          type="button"
          aria-label="Închide"
          onClick={() => {
            setShow(false)
            try {
              localStorage.setItem(KEY, "1")
            } catch {
              /* it will be shown again, which is the harmless direction */
            }
          }}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors active:bg-[#7c3aed]/10"
        >
          <X className="h-[14px] w-[14px]" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
