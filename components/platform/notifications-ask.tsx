"use client"

/**
 * ===========================================================================
 *  ASKING FOR NOTIFICATIONS ON EVERY INSTALL
 * ===========================================================================
 * The phone's own prompt is shown on the first launch after an install,
 * whether or not anybody is signed in, and whether or not this account had
 * the app before. Deleting the app resets what iOS and Android remember, so
 * every install is asked again.
 *
 * A yes registers the phone as soon as someone is signed in
 * (components/native-push-init.tsx). A "Don't Allow" can only be undone in
 * the phone's settings, so from time to time (lib/notifications/push-ask-rule)
 * a sheet says notifications are off and opens those settings in one tap.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { BellOff } from "lucide-react"
import { askPushPermission, inNativeApp, nativePlatform, openPhoneSettings, readPushPermission } from "@/lib/native-push"
import { shouldAsk, type AskRecord } from "@/lib/notifications/push-ask-rule"

/* The same route Settings reads and writes (components/account/push-switch-row.tsx), named here so the root layout does not pull the Settings screen into every page. */
const PUSH_ROUTE = "/api/me/push"

/** When the off reminder was last shown, kept on this phone only. */
const KEY = "storelib_push_ask"

function readRecord(): AskRecord | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AskRecord>
    if (typeof parsed?.at !== "number" || typeof parsed?.count !== "number") return null
    return { at: parsed.at, count: parsed.count }
  } catch {
    return null
  }
}

function writeRecord(record: AskRecord): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* The worst case is being reminded again next launch. */
  }
}

async function signedIn(): Promise<boolean> {
  try {
    const { createClient } = await import("@/lib/supabase/client")
    const { data } = await createClient().auth.getSession()
    return !!data.session
  } catch {
    return false
  }
}

/** Something else is already over the page: remind on the next launch instead of stacking on it. */
function pageIsBusy(): boolean {
  return !!document.querySelector('[role="dialog"], [data-payments-setup-panel], [data-id-camera]')
}

export function NotificationsAsk() {
  const [open, setOpen] = React.useState(false)
  const [closing, setClosing] = React.useState(false)

  React.useEffect(() => {
    if (!inNativeApp()) return
    let gone = false

    const decide = async () => {
      if (gone) return
      const permission = await readPushPermission()
      if (permission === "prompt") {
        const answer = await askPushPermission()
        if (answer === "granted" && (await signedIn())) {
          /* The phone says yes, so the account says yes: a push has somewhere to land. */
          await fetch(PUSH_ROUTE, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          }).catch(() => undefined)
        }
        return
      }
      if (permission !== "denied") return
      if (!shouldAsk(readRecord(), Date.now())) return
      if (!gone && !pageIsBusy()) setOpen(true)
    }

    /* After the splash and the first page have painted. */
    const start = window.setTimeout(() => void decide(), 1200)
    return () => {
      gone = true
      window.clearTimeout(start)
    }
  }, [])

  const close = () => {
    writeRecord({ at: Date.now(), count: (readRecord()?.count ?? 0) + 1 })
    setClosing(true)
    window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 220)
  }

  const openSettings = () => {
    openPhoneSettings()
    close()
  }

  if (!open || typeof document === "undefined") return null
  const android = nativePlatform() === "android"

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="push-ask-title" data-push-ask="">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: closing ? 0 : 1, animation: closing ? undefined : "sl-fade-in 200ms ease-out" }}
        onClick={close}
        aria-hidden
      />
      <div
        className="relative w-full max-w-[520px] rounded-t-[22px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:mb-6 sm:rounded-[22px]"
        style={{ transform: closing ? "translateY(105%)" : "translateY(0)", animation: closing ? undefined : "sl-sheet-up 320ms cubic-bezier(0.32,0.72,0,1)" }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f3ff] text-[#5b4bd5]">
          <BellOff className="h-6 w-6" />
        </span>
        <h2 id="push-ask-title" className="mt-4 text-[19px] font-semibold text-[#1a1a2e]">
          Notifications are off
        </h2>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7280]">
          Sales, payouts, replies and new posts in your communities can't reach this {android ? "phone" : "iPhone"}. Turn on {android ? "notifications" : "Allow Notifications"} for Storelib.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={openSettings}
            data-push-ask-allow=""
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white outline-none transition-transform active:scale-[0.99]"
          >
            Open Settings
          </button>
          <button
            type="button"
            onClick={close}
            data-push-ask-later=""
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl text-[15px] font-medium text-[#4b5563] outline-none transition-colors active:bg-[#f3f4f6]"
          >
            Not now
          </button>
        </div>
      </div>
      <style>{`@keyframes sl-fade-in{from{opacity:0}to{opacity:1}}@keyframes sl-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>,
    document.body,
  )
}
