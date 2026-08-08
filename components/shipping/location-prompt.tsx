"use client"

import { useEffect, useState } from "react"
import { Crosshair, MapPin, X } from "lucide-react"

import { isNativeApp, type GeoState } from "@/components/shipping/use-geolocation"

/**
 * "Can we see where you are?" — asked in our own words, before the system asks.
 *
 * ---------------------------------------------------------------------------
 * Why a screen of our own in front of the real dialog
 * ---------------------------------------------------------------------------
 * The operating system's permission alert is one sentence and one chance. On
 * iOS the app may only ever show it ONCE — decline, and every later request
 * silently fails until the user goes and finds the app in Settings, which
 * essentially nobody does. Browsers behave the same way per origin.
 *
 * So the expensive dialog is never spent cold. This explains what location is
 * for in a sentence a buyer can act on ("we'll show the easyboxes nearest
 * you"), and only calls the real thing when they say yes. Someone who taps
 * "Nu acum" has cost nothing: the system prompt was never shown, so it is
 * still available later.
 *
 * ---------------------------------------------------------------------------
 * Asked at checkout, and not endlessly
 * ---------------------------------------------------------------------------
 * "Ask every time" is the instruction and this asks on every checkout — but
 * once per visit, not once per render, and never again in a session where it
 * has been dismissed. A prompt that reappears after being declined is the
 * thing that makes people uninstall.
 */

/** Session, not localStorage: a new visit is a fair time to ask again, and a
 *  buyer who declined last month may be somewhere else entirely today. */
const DISMISS_KEY = "storelib_geo_prompt_dismissed"

function dismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    // Private mode, or storage disabled. Showing it once more is a better
    // failure than crashing a checkout.
    return false
  }
}

function rememberDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1")
  } catch {
    /* nothing to do */
  }
}

export function LocationPrompt({
  state,
  onAllow,
  /** Rendered inline (checkout) rather than as a floating card. */
  inline = false,
}: {
  state: GeoState
  onAllow: () => void
  inline?: boolean
}) {
  const [dismissed, setDismissed] = useState(true)

  // Read on the client only: sessionStorage does not exist during the server
  // render, and assuming "not dismissed" would flash the card on every load.
  useEffect(() => {
    setDismissed(dismissedThisSession())
  }, [])

  // Nothing to ask for: already answered, already refused, or the platform
  // cannot do it at all.
  if (state.status !== "idle" && state.status !== "locating") {
    // A refusal is worth one line of help, because the fix is not in this app.
    if (state.status === "denied") {
      return (
        <p className="mt-2 text-[12.5px] leading-snug text-neutral-500">
          Locația este blocată.{" "}
          {isNativeApp()
            ? "O poți reactiva din Setări › Storelib › Locație."
            : "O poți reactiva din setările site-ului, în bara de adrese."}{" "}
          Sau caută după oraș.
        </p>
      )
    }
    return null
  }
  if (dismissed) return null

  const dismiss = () => {
    rememberDismissed()
    setDismissed(true)
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-[#7c3aed]/25 bg-[#7c3aed]/[0.04] p-3.5 ${
        inline ? "mt-3" : "mt-2"
      }`}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/10 text-[#7c3aed]">
        <MapPin className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-neutral-900">Găsim easybox-ul cel mai apropiat</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-neutral-600">
          Dacă ne lași să vedem unde ești, îți arătăm punctele de livrare ordonate după distanță.
          Nu salvăm locația.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAllow}
            disabled={state.status === "locating"}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#7c3aed] px-4 text-[13px] font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <Crosshair className="h-3.5 w-3.5" />
            {state.status === "locating" ? "Se caută…" : "Permite locația"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-neutral-500"
          >
            Nu acum
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Închide"
        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
