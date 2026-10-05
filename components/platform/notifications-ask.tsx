"use client"

/**
 * ===========================================================================
 *  ASKING FOR NOTIFICATIONS AFTER AN INSTALL, ONCE, IN STORELIB'S OWN WORDS
 * ===========================================================================
 * Deleting the app and installing it again resets what iOS and Android
 * remember: the phone's permission goes back to "not asked" and the device
 * gets a new token. The account still said push was on, so nothing in the
 * app ever asked again, and the person simply stopped getting notifications
 * with no way to notice. The only thing that asked was Settings,
 * Notifications, which somebody who already turned push on has no reason to
 * open.
 *
 * So the app asks, on its own, when all of this is true:
 *
 *   IT IS THE APP, AND THEY ARE SIGNED IN. A browser has its own
 *     notifications under Privacy, and there is nobody to push to until
 *     somebody is signed in.
 *   THE PHONE HAS NOT BEEN ASKED YET ("prompt"). Granted means the token is
 *     already being registered (lib/push/client.ts), and denied can only be
 *     undone in the phone's own settings, which the Settings page explains.
 *   THEIR ACCOUNT HAS NOT TURNED PUSH OFF. Somebody who switched it off
 *     meant it, and a reinstall is not permission to ask them again.
 *
 * OUR SHEET FIRST, THE PHONE'S PROMPT SECOND. iOS shows its prompt once in
 * an install's life and a "Don't Allow" is final, so the system prompt is
 * only reached through Allow here. "Not now" costs nothing: it comes back
 * after a week, three times at most, and never again after that. Settings
 * remains the place to turn it on later, and to choose how much of it.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Bell } from "lucide-react"
import { askPushPermission, inNativeApp, readPushPermission } from "@/lib/native-push"
import { shouldAsk, type AskRecord } from "@/lib/notifications/push-ask-rule"
import { cn } from "@/lib/utils"

/* The same route Settings reads and writes (components/account/push-switch-row.tsx), named here so the root layout does not pull the Settings screen into every page. */
const PUSH_ROUTE = "/api/me/push"

/** What the person has been asked, kept on this phone only. */
const KEY = "storelib_push_ask"

function readRecord(): AskRecord | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AskRecord>
    if (typeof parsed?.at !== "number" || typeof parsed?.count !== "number") return null
    return { at: parsed.at, count: parsed.count }
  } catch {
    /* Private mode, or storage turned off: ask this once and let it go. */
    return null
  }
}

function writeRecord(record: AskRecord): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* Nothing to do: the worst case is being asked again next launch. */
  }
}

/** Their account's own answer, so somebody who turned push off is never asked. */
async function accountWantsPush(): Promise<boolean> {
  try {
    const res = await fetch(PUSH_ROUTE, { credentials: "include", cache: "no-store" })
    if (!res.ok) return res.status !== 404
    const body = (await res.json()) as { enabled?: unknown }
    return body?.enabled !== false
  } catch {
    return false
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

/** Something else is already over the page: ask on the next launch instead of stacking on it. */
function pageIsBusy(): boolean {
  return !!document.querySelector('[role="dialog"], [data-payments-setup-panel], [data-id-camera]')
}

export function NotificationsAsk() {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!inNativeApp()) return
    let gone = false

    const decide = async () => {
      if (gone || pageIsBusy()) return
      if (!shouldAsk(readRecord(), Date.now())) return
      if ((await readPushPermission()) !== "prompt") return
      if (!(await signedIn())) return
      if (!(await accountWantsPush())) return
      if (!gone && !pageIsBusy()) setOpen(true)
    }

    /* After the first steady frame, not during it: the splash and the first page come first. */
    const start = window.setTimeout(() => void decide(), 2500)
    return () => {
      gone = true
      window.clearTimeout(start)
    }
  }, [])

  const remember = () => writeRecord({ at: Date.now(), count: (readRecord()?.count ?? 0) + 1 })

  const allow = async () => {
    if (busy) return
    setBusy(true)
    remember()
    try {
      const answer = await askPushPermission()
      if (answer === "granted") {
        /* The phone says yes, so the account says yes: a push has somewhere to land. */
        await fetch(PUSH_ROUTE, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        }).catch(() => undefined)
      }
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  const notNow = () => {
    remember()
    setOpen(false)
  }

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="push-ask-title" data-push-ask="">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200" onClick={notNow} aria-hidden />
      <div className="relative w-full max-w-[520px] rounded-t-[22px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] animate-in slide-in-from-bottom-6 duration-300 sm:mb-6 sm:rounded-[22px]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f3ff] text-[#5b4bd5]">
          <Bell className="h-6 w-6" />
        </span>
        <h2 id="push-ask-title" className="mt-4 text-[19px] font-semibold text-[#1a1a2e]">
          Turn on notifications
        </h2>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7280]">
          Sales, payouts, replies in your communities and new things from the people you follow. You choose exactly which of these you get, any time, in Settings, Notifications.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void allow()}
            disabled={busy}
            data-push-ask-allow=""
            className={cn(
              "flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white outline-none transition-transform active:scale-[0.99] disabled:opacity-60",
            )}
          >
            Allow notifications
          </button>
          <button
            type="button"
            onClick={notNow}
            data-push-ask-later=""
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl text-[15px] font-medium text-[#4b5563] outline-none transition-colors active:bg-[#f3f4f6]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
