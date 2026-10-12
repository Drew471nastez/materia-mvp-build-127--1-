"use client"

/**
 * Shippo, EasyPost and ShipStation, connected: what goes out, what comes
 * back, how much it has done, and when it last talked to Storelib. The
 * card's own red line (lastError) says what went wrong last.
 */

import * as React from "react"
import type { ProviderInfo } from "@/lib/physical/providers"
import type { IntegrationState } from "./integrations-marketplace"

/** Where each key is found, under its field. */
export const KEY_HINT: Partial<Record<string, string>> = {
  shippo: "Shippo › Settings › Advanced › API. A test key (shippo_test_) buys free sample labels. Checked with Shippo, then stored encrypted on Storelib's server.",
  easypost: "EasyPost › Account › API Keys. A test key (EZTK) buys free sample labels. Checked with EasyPost, then stored encrypted on Storelib's server.",
  shipstation: "ShipStation › Settings › Account › API Settings. Checked with ShipStation, then stored encrypted on Storelib's server.",
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not yet")

export function ShippingAppFacts({ provider, state }: { provider: ProviderInfo; state: IntegrationState }) {
  const station = provider.id === "shipstation"
  const rows: { label: string; value: string }[] = station
    ? [
        { label: "Orders out", value: "Paid orders you ship yourself, with cancellations and new addresses" },
        { label: "Tracking back", value: state.webhooks === "on" ? "As each label ships in ShipStation" : "Checked with ShipStation every few hours" },
        { label: "Orders sent", value: String(state.ordersSent ?? 0) },
        { label: "Last talked to", value: when(state.lastSyncAt) },
      ]
    : [
        { label: "Where", value: "Orders › an order › Fulfill items › Buy a label" },
        { label: "Key", value: state.mode === "test" ? "Test: labels are free samples" : "Live: labels are charged to your account" },
        { label: "Labels bought", value: String(state.labelsBought ?? 0) },
        { label: "Last talked to", value: when(state.lastSyncAt) },
      ]
  return (
    <div className="mt-3 sm:pl-[58px]" data-integration-facts="" data-shipping-app={provider.id}>
      <dl className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <dt className="shrink-0 text-[12.5px] text-[#6b7280]">{r.label}</dt>
            <dd className="text-[13px] font-medium text-[#1a1a2e] sm:text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
      {station && state.webhooks === "off" && state.webhookNote ? <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">{state.webhookNote}</p> : null}
      <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">
        {station
          ? "Items a print partner or supplier sends stay out of ShipStation. Print labels there as usual; the buyer gets the shipping email from your store."
          : "Rates are for the order's address and the address of the location it ships from. The label's cost is your cost; the buyer is not charged for it."}
      </p>
    </div>
  )
}
