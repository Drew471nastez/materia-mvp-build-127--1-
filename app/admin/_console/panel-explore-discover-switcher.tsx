"use client"

import * as React from "react"

import { Button, Panel, Status } from "./ui"

/** Segmented Digital products / Communities control above Discover on /explore. */
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
        setError(body?.error || "Could not read the discover switcher flag.")
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
          ? "Discover shows the Digital products / Communities switch above the heading. Choice is remembered for 30 days."
          : "Switcher hidden: Explore stays on digital products unless ?type=communities is in the link.",
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
      title="Discover catalogue switcher"
      meta="Gray segmented control above “Discover” — products vs communities"
      action={
        enabled === null ? null : (
          <Button
            onClick={() => void save(!enabled)}
            disabled={busy}
            aria-label={enabled ? "Turn discover switcher off" : "Turn discover switcher on"}
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
                ? "Buyers can switch catalogues on /explore; the chip menu stays available too."
                : "Off by default. Header categories and Explore marketplace are controlled separately."}
            </p>
            <Status value={enabled ? "ok" : null} label={enabled ? "On" : "Off"} />
          </div>
        ) : null}
        {error ? (
          <p className="text-[12px] text-[#6b6b76]">
            Uses <code className="font-mono text-[#9b9ba6]">platform_settings</code>. Override:{" "}
            <code className="font-mono text-[#9b9ba6]">EXPLORE_DISCOVER_MODE_SWITCHER</code>.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}
