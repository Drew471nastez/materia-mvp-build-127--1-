"use client"

import * as React from "react"

import { Banner, Panel, Status } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

export default function ConfigurationPage() {
  const [cfg, setCfg] = React.useState<Record<string, unknown> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void adminPaymentsRead<Record<string, unknown>>("/api/admin/payments/configuration").then((r) => {
      if (r && "error" in r && typeof r.error === "string") setError(r.error)
      else {
        setError(null)
        setCfg(r)
      }
    })
  }, [])

  const secrets = (cfg?.secrets ?? {}) as Record<string, string>

  return (
    <div className="space-y-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel title="Payments configuration">
        {cfg ? (
          <ul className="divide-y divide-white/[0.08] text-[13px]">
            {[
              ["Provider", String(cfg.provider)],
              ["Platform currency", String(cfg.platformCurrency)],
              ["Marketplace in US dollars", String(cfg.marketplaceUsd ?? "off")],
              ["Charge model", String(cfg.chargeModel)],
              ["Connected account model", String(cfg.connectedAccountModel)],
              ["Application fees", cfg.applicationFees ? "enabled" : "disabled"],
              ["Embedded onboarding", cfg.embeddedOnboarding ? "enabled" : "disabled"],
              ["Fee rule version", String(cfg.feeRuleVersion)],
              ["Fee config source", String(cfg.feeConfigSource)],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between px-4 py-2.5">
                <span className="text-[#9b9ba6]">{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-[#9b9ba6]">Loading…</p>
        )}
      </Panel>
      <Panel title="Secrets" meta="Configured or missing only">
        <ul className="divide-y divide-white/[0.08] text-[13px]">
          {Object.entries(secrets).map(([k, v]) => (
            <li key={k} className="flex justify-between px-4 py-2.5">
              <span className="text-[#9b9ba6]">{k}</span>
              <Status value={v} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
