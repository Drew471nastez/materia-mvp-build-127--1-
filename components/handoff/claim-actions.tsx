"use client"

/**
 * The claim page's buttons (app/(storelib)/team/claim/[token]). Accept and
 * Switch account are real forms, so they work before any script has
 * loaded; the script only keeps a second press from becoming a second
 * request. Open goes into the business the way the account menu does
 * (lib/businesses/switch-client), which handles the web, iOS and Android.
 */
import * as React from "react"
import { createClient } from "@/lib/supabase/client"
import { switchBusiness } from "@/lib/businesses/switch-client"
import { JOIN_BTN_PRIMARY, JOIN_BTN_QUIET } from "@/components/team/join-actions"

function Spinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
}

export function AcceptOwnership({ token }: { token: string }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <form method="post" action="/api/handoff/claim" onSubmit={(e) => (busy ? e.preventDefault() : setBusy(true))}>
      <input type="hidden" name="token" value={token} />
      <button type="submit" className={JOIN_BTN_PRIMARY} disabled={busy} data-claim="accept">
        {busy ? <><Spinner /> Taking ownership</> : "Accept ownership"}
      </button>
    </form>
  )
}

export function OpenBusiness({ userId, name }: { userId: string; name: string }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const open = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await switchBusiness(userId, "/app")
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That business could not be opened. Try again.")
      setBusy(false)
    }
  }
  return (
    <div>
      <button type="button" className={JOIN_BTN_PRIMARY} onClick={() => void open()} disabled={busy} data-claim="open">
        {busy ? <><Spinner /> Opening</> : `Open ${name}`}
      </button>
      {error ? <p role="alert" className="mt-2 text-center text-[13px] leading-5 text-[#b42318]">{error}</p> : null}
    </div>
  )
}

/** Sign this browser out, then Log in with the email the link names. The device store first: in the apps the session is also there. */
export function SwitchAccount({ token, email, label = "Switch account", quiet = false }: { token: string; email: string | null; label?: string; quiet?: boolean }) {
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
    <form ref={form} method="post" action="/api/handoff/claim/switch" onSubmit={go}>
      <input type="hidden" name="token" value={token} />
      {email ? <input type="hidden" name="email" value={email} /> : null}
      <button type="submit" className={quiet ? JOIN_BTN_QUIET : JOIN_BTN_PRIMARY} disabled={busy} data-claim="switch">
        {busy ? "Signing out" : label}
      </button>
    </form>
  )
}
