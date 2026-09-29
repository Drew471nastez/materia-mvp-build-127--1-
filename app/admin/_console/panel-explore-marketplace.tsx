"use client"

import * as React from "react"

import { Button, Panel, Status } from "./ui"

/**
 * Turn Discover / Explore (/explore and related browse UI) on or off for everyone.
 * Stored in platform_settings (supabase/sql/run-now/91_platform_settings.sql).
 */
export function ExploreMarketplacePanel() {
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
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
      const body = (await res.json().catch(() => null)) as { exploreEnabled?: boolean; error?: string } | null
      if (!res.ok || !body || typeof body.exploreEnabled !== "boolean") {
        setError(body?.error || "Could not read the marketplace flag.")
        return
      }
      setEnabled(body.exploreEnabled)
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
        body: JSON.stringify({ exploreEnabled: next }),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as { exploreEnabled?: boolean; error?: string } | null
      if (!res.ok || !body || typeof body.exploreEnabled !== "boolean") {
        setError(body?.error || "Could not save.")
        return
      }
      setEnabled(body.exploreEnabled)
      setSaid(body.exploreEnabled ? "Discover is on. /explore and marketplace browse are available." : "Discover is off. /explore redirects home and browse links are hidden.")
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      id="explore-marketplace"
      title="Discover / Explore marketplace"
      meta="Public browse at /explore, search, and related navigation"
      action={
        enabled === null ? null : (
          <Button onClick={() => void save(!enabled)} disabled={busy} aria-label={enabled ? "Turn Discover off" : "Turn Discover on"}>
            {busy ? "Saving…" : enabled ? "Turn off" : "Turn on"}
          </Button>
        )
      }
    >
      <div className="space-y-3 px-4 py-4">
        {enabled === null && !error ? <p className="text-[13px] text-[#9b9ba6]">Loading…</p> : null}
        {error ? <p className="text-[13px] text-[#f4a4a4]">{error}</p> : null}
        {said ? <p className="text-[13px] text-[#9b9ba6]">{said}</p> : null}
        {enabled !== null ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-[#c9c9d1]">
              {enabled
                ? "Buyers can open /explore, category pages, and marketplace search."
                : "Explore is hidden: routes redirect to the homepage; header and tab bar skip marketplace links."}
            </p>
            <Status value={enabled ? "ok" : null} label={enabled ? "On" : "Off"} />
          </div>
        ) : null}
        <p className="text-[12px] text-[#6b6b76]">
          Requires <code className="font-mono text-[#9b9ba6]">supabase/sql/run-now/91_platform_settings.sql</code> in production. Emergency override:{" "}
          <code className="font-mono text-[#9b9ba6]">EXPLORE_MARKETPLACE_ENABLED=true</code> on the server.
        </p>
      </div>
    </Panel>
  )
}
