"use client"

import * as React from "react"

import type { StorelibFeeConfig } from "@/lib/payments/fees/types"
import { SCALE_MICRO_RATE, SCALE_STANDARD_RATE } from "@/lib/payments/fees/config"

import { Banner, Panel } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

type FeesState = {
  active: StorelibFeeConfig
  activeSource: string
  draft: { id: string; versionKey: string; config: StorelibFeeConfig } | null
  tableReady: boolean
}

export default function FeesPage() {
  const [state, setState] = React.useState<FeesState | null>(null)
  const [draft, setDraft] = React.useState<StorelibFeeConfig | null>(null)
  const [step, setStep] = React.useState<"view" | "edit" | "review">("view")
  const [message, setMessage] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    void adminPaymentsRead<FeesState>("/api/admin/payments/fees").then((r) => {
      if (r && "error" in r) setMessage(r.error)
      else {
        setState(r)
        setDraft(r.draft?.config ?? JSON.parse(JSON.stringify(r.active)) as StorelibFeeConfig)
      }
    })
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function saveDraft() {
    if (!draft) return
    setMessage(null)
    const res = await fetch("/api/admin/payments/fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: draft, summary: "Admin draft" }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setMessage(body?.issues?.map((i: { message: string }) => i.message).join(" ") || body?.error || "Save failed")
      return
    }
    setMessage("Draft saved. Review and activate to apply.")
    setStep("review")
    load()
  }

  async function activate() {
    setMessage(null)
    const res = await fetch("/api/admin/payments/fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", effectiveAt: new Date().toISOString() }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setMessage(body?.issues?.map((i: { message: string }) => i.message).join(" ") || body?.error || "Activation failed")
      return
    }
    setMessage("New fee version is active.")
    setStep("view")
    load()
  }

  if (!state) return <p className="text-[13px] text-[#9b9ba6]">Loading fee configuration…</p>

  return (
    <div className="space-y-6">
      {message ? <Banner tone="plain">{message}</Banner> : null}
      {!state.tableReady ? <Banner tone="plain">Fee tables not migrated — using code defaults until SQL migration runs.</Banner> : null}

      <Panel title="Active fee rules" meta={`Source: ${state.activeSource} · ${state.active.versionKey}`}>
        <div className="grid gap-4 px-4 py-4 text-[13px] md:grid-cols-3">
          <div>
            <p className="text-[#6b6b76]">Free standard</p>
            <p>{(state.active.freeStandardRate * 100).toFixed(2)}% + fixed (standard tier)</p>
            <p className="mt-2 text-[#6b6b76]">Free micro</p>
            <p>{(state.active.freeMicroRate * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[#6b6b76]">Grow standard</p>
            <p>{(state.active.paidStandardRate * 100).toFixed(2)}% + fixed</p>
            <p className="mt-2 text-[#6b6b76]">Grow micro</p>
            <p>{(state.active.paidMicroRate * 100).toFixed(2)}%</p>
          </div>
          <div>
            {/* Scale (plan id pro). A version stored before Scale had its own rate has none: the code's rate applies. */}
            <p className="text-[#6b6b76]">Pro standard</p>
            <p>{((state.active.scaleStandardRate ?? SCALE_STANDARD_RATE) * 100).toFixed(2)}% + fixed{state.active.scaleStandardRate == null ? " (code default)" : ""}</p>
            <p className="mt-2 text-[#6b6b76]">Pro micro</p>
            <p>{((state.active.scaleMicroRate ?? SCALE_MICRO_RATE) * 100).toFixed(2)}%</p>
          </div>
        </div>
        <div className="border-t border-white/[0.08] px-4 py-3">
          <button type="button" className="text-[13px] text-[#8b5cf6]" onClick={() => setStep(step === "view" ? "edit" : "view")}>
            {step === "view" ? "Edit" : "Cancel edit"}
          </button>
        </div>
      </Panel>

      {step !== "view" && draft ? (
        <Panel title="Proposed rules">
          <div className="space-y-3 px-4 py-4 text-[13px]">
            {(["freeStandardRate", "freeMicroRate", "paidStandardRate", "paidMicroRate", "scaleStandardRate", "scaleMicroRate"] as const).map((key) => (
              <label key={key} className="flex items-center justify-between gap-4">
                <span className="text-[#9b9ba6]">{key}</span>
                <input
                  type="number"
                  step="0.0001"
                  className="w-32 rounded border border-white/10 bg-[#17171d] px-2 py-1"
                  value={draft[key] ?? (key === "scaleStandardRate" ? SCALE_STANDARD_RATE : key === "scaleMicroRate" ? SCALE_MICRO_RATE : 0)}
                  onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <p className="text-[12px] text-[#d4a72c]">Changing production fees requires Review → Confirm → Activate.</p>
            <div className="flex gap-2">
              <button type="button" className="rounded-[7px] border border-white/10 px-3 py-1.5" onClick={() => setStep("review")}>Review changes</button>
              <button type="button" className="rounded-[7px] bg-[#8b5cf6] px-3 py-1.5" onClick={() => void saveDraft()}>Save draft</button>
            </div>
          </div>
        </Panel>
      ) : null}

      {step === "review" ? (
        <Panel title="Confirm activation">
          <div className="space-y-3 px-4 py-4 text-[13px]">
            <p>Effective: immediately on confirm (UTC).</p>
            <button type="button" className="rounded-[7px] bg-[#8b5cf6] px-3 py-1.5 font-medium" onClick={() => void activate()}>
              Activate new fee version
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Per-currency rules">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[#6b6b76]">
            <tr>
              <th className="px-4 py-2">Currency</th>
              <th className="px-4 py-2">Fixed fee (minor)</th>
              <th className="px-4 py-2">Micro threshold (minor)</th>
              <th className="px-4 py-2">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {state.active.currencies.map((c) => (
              <tr key={c.currency} className="border-t border-white/[0.06]">
                <td className="px-4 py-2">{c.currency}</td>
                <td className="px-4 py-2 tabular-nums">{c.fixedFeeMinor}</td>
                <td className="px-4 py-2 tabular-nums">{c.microThresholdMinor}</td>
                <td className="px-4 py-2">{c.enabled ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
