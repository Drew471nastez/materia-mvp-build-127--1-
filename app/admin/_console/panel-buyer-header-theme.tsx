"use client"

import * as React from "react"

import { Button, Panel, Status } from "./ui"

/** Light vs dark chrome on the buyer site header (not /app). */
export function BuyerHeaderThemePanel() {
  const [light, setLight] = React.useState<boolean | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [said, setSaid] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/marketplace-flags", { cache: "no-store" })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as { buyerHeaderLight?: boolean; error?: string } | null
      if (!res.ok || !body || typeof body.buyerHeaderLight !== "boolean") {
        setError(body?.error || "Could not read the header theme.")
        return
      }
      setLight(body.buyerHeaderLight)
    } catch {
      setError("Could not reach the server.")
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const save = async (next: boolean) => {
    setBusy(true)
    setError(null)
    setSaid(null)
    try {
      const res = await fetch("/api/admin/marketplace-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerHeaderLight: next }),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as { buyerHeaderLight?: boolean; error?: string } | null
      if (!res.ok || !body || typeof body.buyerHeaderLight !== "boolean") {
        setError(body?.error || "Could not save.")
        return
      }
      setLight(body.buyerHeaderLight)
      setSaid(
        body.buyerHeaderLight
          ? "Buyer header is light across storelib.com (not inside /app)."
          : "Buyer header is dark again on storelib.com.",
      )
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      id="buyer-header-theme"
      title="Buyer site header"
      meta="Light or dark bar on storelib.com — Explore, library, marketing. Not /app."
      action={
        light === null ? null : (
          <Button onClick={() => void save(!light)} disabled={busy} aria-label={light ? "Use dark header" : "Use light header"}>
            {busy ? "Saving…" : light ? "Use dark" : "Use light"}
          </Button>
        )
      }
    >
      <div className="space-y-3 px-4 py-4">
        {light === null && !error ? <p className="text-[13px] text-[#9b9ba6]">Loading…</p> : null}
        {error ? <p className="text-[13px] text-[#f4a4a4]">{error}</p> : null}
        {said ? <p className="text-[13px] text-[#9b9ba6]">{said}</p> : null}
        {light !== null ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-[#c9c9d1]">
              {light
                ? "Near-white bar with a hairline border and very soft depth. Creator dashboard (/app) is unchanged."
                : "Black bar with white type, as today."}
            </p>
            <Status value={light ? "ok" : null} label={light ? "Light" : "Dark"} />
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
