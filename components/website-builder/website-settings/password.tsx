"use client"

/**
 * ===========================================================================
 *  PASSWORD PROTECT, ON PUBLISHING
 * ===========================================================================
 * Shopify's "Restrict access to visitors with the password": while it is on,
 * every page of the published website shows the password page until the
 * visitor types the password (lib/site-password). The owner gets in from the
 * password page's own link, and the builder's preview is never asked.
 *
 * It takes effect when it is saved, not with the next publish: it is who may
 * see the website, not part of its design. The password goes to the server
 * once and is kept there as a hash; this page is only ever told whether one
 * is set (app/api/website-builder/site-password).
 */
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Card, ErrorNote, Row, Toggle, buttonClass, inputClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

interface AccessState {
  available: boolean
  enabled: boolean
  hasPassword: boolean
}

export function PasswordCard({ ctx }: { ctx: SettingsContext }) {
  const [state, setState] = useState<AccessState | null>(null)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/website-builder/site-password", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AccessState | null) => {
        if (alive) setState(d ?? { available: false, enabled: false, hasPassword: false })
      })
      .catch(() => alive && setState({ available: false, enabled: false, hasPassword: false }))
    return () => {
      alive = false
    }
  }, [])

  const send = async (change: { enabled?: boolean; password?: string }) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/website-builder/site-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error || tt("That did not save. Try again."))
      setState(d as AccessState)
      if (change.password) {
        setPassword("")
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1600)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("That did not save. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (on: boolean) => {
    if (!state || busy) return
    /* On needs a password: the one typed now, or the one set before. */
    if (on && !state.hasPassword && !password.trim()) {
      setError(tt("Type a password first, then turn this on."))
      document.getElementById("wb-site-password")?.focus()
      return
    }
    void send(on && password.trim() ? { enabled: true, password: password.trim() } : { enabled: on })
  }

  const unavailable = state !== null && !state.available

  return (
    <>
      <Card
        title={tt("Password")}
        footer={
          <>
            {tt("You get in from your password page with Are you the owner, and the preview in the builder always shows the website.")}{" "}
            <button type="button" className={textLinkClass} onClick={() => ctx.onEditPage("password")}>
              {tt("Edit the password page")}
            </button>
          </>
        }
      >
        <Row
          label={tt("Password protect")}
          hint={
            unavailable
              ? tt("Not available yet. Try again in a little while.")
              : ctx.live
                ? tt("Visitors see your password page until they type the password.")
                : tt("Covers whichever of your websites is live, and this one from the moment you publish it.")
          }
          inline
        >
          {state === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-white/45" aria-label={tt("Loading")} />
          ) : (
            <Toggle checked={state.enabled} onChange={toggle} label={tt("Password protect this website")} />
          )}
        </Row>
        <Row label={tt("Password")} hint={state?.hasPassword ? tt("Set. Type a new one to change it.") : tt("What visitors type to get in.")} htmlFor="wb-site-password">
          <div className="flex items-center gap-2">
            <input
              id="wb-site-password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              maxLength={100}
              disabled={unavailable}
              placeholder={state?.hasPassword ? tt("New password") : tt("Choose a password")}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password.trim()) void send({ password: password.trim() })
              }}
              className={inputClass}
            />
            <button type="button" className={buttonClass} disabled={busy || unavailable || password.trim().length === 0} onClick={() => void send({ password: password.trim() })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saved ? tt("Saved") : tt("Save")}
            </button>
          </div>
        </Row>
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
