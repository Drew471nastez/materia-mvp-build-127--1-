"use client"

/**
 * The invite page's buttons (app/team/join). Real forms, so they work before
 * any script has loaded; the script only keeps a second press from becoming
 * a second request and says what is happening while the next page comes.
 */
import * as React from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { AUTH_BTN_PRIMARY, AUTH_BTN_SECONDARY } from "@/components/auth/auth-buttons"

/* The log in page's buttons (components/auth/auth-buttons): the invite and the handover open in its layout. */
export const JOIN_BTN_PRIMARY = AUTH_BTN_PRIMARY
export const JOIN_BTN_QUIET = AUTH_BTN_SECONDARY

function Spinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
}

/** Accept, and Decline under it. One press at a time. */
export function AcceptDecline({ token, storeName, label, decline = true }: { token: string; storeName: string; label?: string; decline?: boolean }) {
  const [busy, setBusy] = React.useState<null | "accept" | "decline">(null)
  const [confirmDecline, setConfirmDecline] = React.useState(false)
  return (
    <div className="space-y-2">
      <form method="post" action="/api/team/join" onSubmit={(e) => (busy ? e.preventDefault() : setBusy("accept"))}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="action" value="accept" />
        <button type="submit" className={JOIN_BTN_PRIMARY} disabled={busy !== null} data-join="accept">
          {busy === "accept" ? <><Spinner /> Joining</> : label ?? `Join ${storeName}`}
        </button>
      </form>
      {!decline ? null : confirmDecline ? (
        <form method="post" action="/api/team/join" onSubmit={(e) => (busy ? e.preventDefault() : setBusy("decline"))} className="flex gap-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="action" value="decline" />
          <button type="button" className={cn(JOIN_BTN_QUIET, "flex-1")} onClick={() => setConfirmDecline(false)} disabled={busy !== null}>
            Keep it
          </button>
          <button type="submit" className={cn(JOIN_BTN_QUIET, "flex-1 text-[#b42318] hover:bg-[#fef2f2] hover:text-[#b42318]")} disabled={busy !== null} data-join="decline">
            {busy === "decline" ? "Turning down" : "Turn it down"}
          </button>
        </form>
      ) : (
        <button type="button" className={JOIN_BTN_QUIET} onClick={() => setConfirmDecline(true)} disabled={busy !== null} data-join="decline-ask">
          Decline
        </button>
      )}
    </div>
  )
}

/**
 * Sign this browser out, then sign in as the invited email
 * (app/api/team/join/switch says why it used to do nothing). The browser
 * side first: in the iOS and Android apps the session is also in the
 * device's storage, which only this side can clear. A slow or failed
 * sign out never holds the press: the server clears the cookies anyway.
 */
export function UseAnotherAccount({ token, label = "Use another account", quiet = false }: { token: string; label?: string; quiet?: boolean }) {
  const form = React.useRef<HTMLFormElement>(null)
  const [busy, setBusy] = React.useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await Promise.race([createClient().auth.signOut({ scope: "local" }), new Promise((r) => window.setTimeout(r, 2500))])
    } catch {
      /* the server signs out too */
    }
    try {
      localStorage.removeItem("sb-native-home")
      localStorage.removeItem("_sl_avatar")
    } catch {}
    form.current?.submit()
  }
  return (
    <form ref={form} method="post" action="/api/team/join/switch" onSubmit={go}>
      <input type="hidden" name="token" value={token} />
      <button type="submit" className={quiet ? JOIN_BTN_QUIET : JOIN_BTN_PRIMARY} disabled={busy} data-join="switch">
        {busy ? (quiet ? "Signing out" : <><Spinner /> Signing out</>) : label}
      </button>
    </form>
  )
}
