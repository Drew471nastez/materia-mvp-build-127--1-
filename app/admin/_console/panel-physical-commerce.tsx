"use client"

import * as React from "react"

import { Button, Panel, Status } from "./ui"

/**
 * /admin → System: physical commerce for all of Storelib
 * (lib/platform/physical-commerce.ts). Off, Storelib is exactly as it was
 * before physical commerce existed; nothing stored is deleted, so on again
 * brings every physical product, stock level and order back as it was.
 */
export function PhysicalCommercePanel() {
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [said, setSaid] = React.useState<string | null>(null)

  const read = (body: { physicalCommerceEnabled?: unknown } | null) =>
    body && typeof body.physicalCommerceEnabled === "boolean" ? body.physicalCommerceEnabled : null

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/marketplace-flags", { cache: "no-store" })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as { physicalCommerceEnabled?: boolean; error?: string } | null
      const value = read(body)
      if (!res.ok || value === null) {
        setError(body?.error || "Could not read the physical commerce setting.")
        return
      }
      setEnabled(value)
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
        body: JSON.stringify({ physicalCommerceEnabled: next }),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as { physicalCommerceEnabled?: boolean; error?: string } | null
      const value = read(body)
      if (!res.ok || value === null) {
        setError(body?.error || "Could not save.")
        return
      }
      setEnabled(value)
      setSaid(
        next
          ? "Physical commerce is on. Creators can add physical products; inventory, shipping and fulfilment appear as they need them."
          : "Physical commerce is off. Everything physical is hidden and paused; nothing was deleted.",
      )
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      id="physical-commerce"
      title="Physical commerce"
      meta="Native physical products, inventory, shipping, fulfillment and related commerce functionality across Storelib"
      action={
        enabled === null ? null : (
          <Button onClick={() => void save(!enabled)} disabled={busy} aria-label={enabled ? "Turn physical commerce off" : "Turn physical commerce on"}>
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
                ? "Enabled: Physical product, variants, inventory, locations, shipping, cart, fulfillment and returns are live."
                : "Disabled (default): Storelib behaves exactly as before. Physical data stays stored and comes back when this is turned on."}
            </p>
            <Status value={enabled ? "ok" : null} label={enabled ? "Enabled" : "Disabled"} />
          </div>
        ) : null}
        {enabled ? <Diagnostics /> : null}
        {error ? (
          <p className="text-[12px] text-[#6b6b76]">
            Stored in <code className="font-mono text-[#9b9ba6]">platform_settings</code> as{" "}
            <code className="font-mono text-[#9b9ba6]">physical_commerce_enabled</code>. Env override:{" "}
            <code className="font-mono text-[#9b9ba6]">PHYSICAL_COMMERCE_ENABLED</code>.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}

interface Diag {
  available: boolean
  shops: number | null
  products: number | null
  paidOrders: number | null
  waitingToShip: number | null
  staleHolds: number | null
  lateJobs: number | null
  failingJobs: number | null
  deadJobs: number | null
  negativeStock: number | null
  recentDead: { kind: string; error: string; at: string | null }[]
}

/** Health at a glance while it is on: counts only, never an order's contents. */
function Diagnostics() {
  const [d, setD] = React.useState<Diag | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let gone = false
    fetch("/api/admin/physical-diagnostics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Diag) => !gone && setD(j))
      .catch(() => !gone && setFailed(true))
    return () => {
      gone = true
    }
  }, [])
  if (failed) return <p className="text-[12px] text-[#f4a4a4]">Diagnostics could not be read.</p>
  if (!d) return <p className="text-[12px] text-[#6b6b76]">Reading diagnostics…</p>
  if (!d.available) return <p className="text-[12px] text-[#f4a4a4]">Its tables are missing: run supabase/sql/run-now/78_physical_commerce.sql.</p>
  const row = (label: string, value: number | null, bad = false) => (
    <div className="flex items-center justify-between gap-3 border-t border-[#26262c] py-1.5 text-[12.5px]">
      <span className="text-[#9b9ba6]">{label}</span>
      <span className={bad && (value ?? 0) > 0 ? "text-[#f4a4a4]" : "text-[#c9c9d1]"}>{value === null ? "?" : value}</span>
    </div>
  )
  return (
    <div>
      {row("Shops set up", d.shops)}
      {row("Physical products", d.products)}
      {row("Paid physical orders", d.paidOrders)}
      {row("Waiting to ship", d.waitingToShip)}
      {row("Stock holds past their time (cron late)", d.staleHolds, true)}
      {row("Jobs waiting over 30 minutes", d.lateJobs, true)}
      {row("Jobs retrying", d.failingJobs, true)}
      {row("Jobs given up on", d.deadJobs, true)}
      {row("Stock levels below zero", d.negativeStock, true)}
      {d.recentDead.map((j, i) => (
        <p key={i} className="mt-1 truncate text-[12px] text-[#6b6b76]">
          {j.kind}: {j.error}
        </p>
      ))}
      {(d.deadJobs ?? 0) > 0 ? <RetryDead onDone={(n) => setD({ ...d, deadJobs: Math.max(0, (d.deadJobs ?? 0) - n), recentDead: [] })} /> : null}
    </div>
  )
}

/* Once whatever stopped them is fixed (the mail key, a supplier's address), the given-up jobs go back in line. */
function RetryDead({ onDone }: { onDone: (n: number) => void }) {
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle")
  const [n, setN] = React.useState(0)
  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy")
          const r = await fetch("/api/admin/physical-diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry_dead" }) }).catch(() => null)
          const j = r?.ok ? ((await r.json().catch(() => ({}))) as { retried?: number }) : null
          if (!j) return setState("error")
          setN(j.retried ?? 0)
          setState("done")
          onDone(j.retried ?? 0)
        }}
        className="h-7 rounded-md border border-[#33333a] px-2.5 text-[12px] font-medium text-[#c9c9d1] hover:bg-[#1f1f24] disabled:opacity-60"
        data-retry-dead=""
      >
        {state === "busy" ? "Putting back in line" : "Try the given-up jobs again"}
      </button>
      {state === "done" ? <span className="text-[12px] text-[#9b9ba6]">{n} back in line. The cron runs them next.</span> : state === "error" ? <span className="text-[12px] text-[#f4a4a4]">That didn&apos;t work.</span> : null}
    </div>
  )
}
