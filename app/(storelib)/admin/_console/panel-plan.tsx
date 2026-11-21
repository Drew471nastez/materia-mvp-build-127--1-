"use client"

import * as React from "react"

import { Banner, Button, Facts, Filters, Panel } from "./ui"

/**
 * ===========================================================================
 *  A CREATOR'S PLAN, SET FROM HERE
 * ===========================================================================
 * Free, Pro, or the legacy $99 Pro, over whatever they pay for. Picking one
 * and pressing Set writes it where every plan check reads it
 * (/api/admin/creators/plan, lib/billing/plan-override.ts); their open app
 * picks it up over realtime. "Use paid plan" clears it. Their Stripe
 * subscription is never touched, and each change is in the audit log.
 */

type PlanState = {
  plan: string
  status: string
  override: { planId: string; paidPlanId: string | null; paidStatus: string | null; setAt: string | null } | null
  available: boolean
  plans: { id: string; label: string }[]
}

const NAMES: Record<string, string> = { free: "Free", growth: "Grow", pro: "Pro" }
const nameOf = (id: string | null | undefined) => NAMES[id ?? "free"] ?? id ?? "Free"

export function PlanPanel({ creatorId, onChanged }: { creatorId: string; onChanged?: () => void }) {
  const [state, setState] = React.useState<PlanState | null>(null)
  const [pick, setPick] = React.useState<string>("growth")
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/creators/plan?id=${encodeURIComponent(creatorId)}`, { cache: "no-store" })
      if (res.status === 401) return window.location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) return setNote({ tone: "bad", text: body?.error || "The plan could not be read." })
      setState(body as PlanState)
      setPick((body as PlanState).override?.planId ?? (body as PlanState).plan ?? "growth")
    } catch {
      setNote({ tone: "bad", text: "Could not reach the server." })
    }
  }, [creatorId])

  React.useEffect(() => {
    void load()
  }, [load])

  const send = async (plan: string | null) => {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch("/api/admin/creators/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, plan }),
      })
      if (res.status === 401) return window.location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The plan did not change." })
      setNote({ tone: "good", text: body?.recorded === false ? `${body.message} Not written to the audit log.` : body?.message || "Saved." })
      await load()
      onChanged?.()
    } catch {
      setNote({ tone: "bad", text: "Could not reach the server." })
    } finally {
      setBusy(false)
    }
  }

  const o = state?.override ?? null
  const options = (state?.plans ?? [{ id: "free", label: "Free" }, { id: "growth", label: "Grow, $14" }, { id: "pro", label: "Pro, $99" }]) as { id: string; label: string }[]
  const unchanged = o ? pick === o.planId : false

  return (
    <Panel title="Plan" meta={o ? "Set from admin" : state ? "From billing" : undefined} id="creator-plan">
      <div data-admin-plan="" className="space-y-0">
        <Facts
          items={[
            { label: "Now", value: state ? nameOf(state.plan) : "" },
            { label: "They pay for", value: o ? nameOf(o.paidPlanId) : state ? nameOf(state.plan) : "" },
            ...(o?.setAt ? [{ label: "Set", value: new Date(o.setAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3">
          <Filters label="Plan to set" options={options} value={pick} onChange={setPick} />
          <div className="flex items-center gap-1.5">
            {o ? (
              <Button variant="quiet" disabled={busy} onClick={() => void send(null)}>
                Use paid plan
              </Button>
            ) : null}
            <Button variant="primary" disabled={busy || !state || state.available === false || unchanged} onClick={() => void send(pick)}>
              {busy ? "Saving" : "Set plan"}
            </Button>
          </div>
        </div>
        {state && state.available === false ? (
          <p className="border-t border-white/[0.06] px-4 py-2.5 text-[12px] text-[#9b9ba6]">Assigning a plan needs SQL part 252 to run first.</p>
        ) : null}
        {note ? (
          <div className="border-t border-white/[0.06] p-3">
            <Banner tone={note.tone} onClose={() => setNote(null)}>
              {note.text}
            </Banner>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
