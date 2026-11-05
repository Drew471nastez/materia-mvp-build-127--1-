"use client"

import * as React from "react"

import { Button, Panel, Status } from "./ui"

/** Admin toggle for the gray pill above “Discover” on /explore (not the violet chip). */
export function ExploreDiscoverModeSwitcherPanel() {
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
      const body = (await res.json().catch(() => null)) as { exploreDiscoverModeSwitcher?: boolean; error?: string } | null
      if (!res.ok || !body || typeof body.exploreDiscoverModeSwitcher !== "boolean") {
        setError(body?.error || "Could not read the headline pill flag.")
        return
      }
      setEnabled(body.exploreDiscoverModeSwitcher)
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
        body: JSON.stringify({ exploreDiscoverModeSwitcher: next }),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as { exploreDiscoverModeSwitcher?: boolean; error?: string } | null
      if (!res.ok || !body || typeof body.exploreDiscoverModeSwitcher !== "boolean") {
        setError(body?.error || "Could not save.")
        return
      }
      setEnabled(body.exploreDiscoverModeSwitcher)
      setSaid(
        next
          ? "The gray Digital products / Communities pill shows above the Discover heading."
          : "Headline pill hidden. Buyers can still use the chevrons on the violet word chip to switch.",
      )
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      id="explore-discover-mode-switcher"
      title="Discover headline pill switch"
      meta="/explore: gray control above “Discover” (Digital products / Communities), shown only while communities are on"
      action={
        enabled === null ? null : (
          <Button
            onClick={() => void save(!enabled)}
            disabled={busy}
            aria-label={enabled ? "Hide headline pill switch" : "Show headline pill switch"}
          >
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
                ? "On: the pill-shaped switch sits above the headline while communities are switched on. Catalogue choice is still remembered for 30 days."
                : "Off (default): no pill above the headline. The violet rotating-word chip and its menu still switch to Communities while communities are on."}
            </p>
            <Status value={enabled ? "ok" : null} label={enabled ? "On" : "Off"} />
          </div>
        ) : null}
        {error ? (
          <p className="text-[12px] text-[#6b6b76]">
            Stored in <code className="font-mono text-[#9b9ba6]">platform_settings</code> as{" "}
            <code className="font-mono text-[#9b9ba6]">explore_discover_mode_switcher</code>. Env override:{" "}
            <code className="font-mono text-[#9b9ba6]">EXPLORE_DISCOVER_MODE_SWITCHER</code>.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}
