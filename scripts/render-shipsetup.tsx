/**
 * Settings › Shipping and delivery as a new store meets it, for
 * scripts/check-shipsetup.mjs: the real ShippingSettings, in the store's
 * currency, against the probe's server (which answers every /api call and
 * keeps what Quick setup makes).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { StoreCurrencyProvider } from "@/lib/store/currency-context"
import { ShippingSettings } from "@/components/physical/shipping-settings"

const params = new URLSearchParams(location.search)

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <StoreCurrencyProvider currency={params.get("currency") ?? "RON"}>
      <div className="mx-auto max-w-[760px] bg-[#f8f9fa] px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Shipping and delivery</h1>
        <form onSubmit={(e) => e.preventDefault()}>
          <ShippingSettings part="delivery" />
        </form>
      </div>
    </StoreCurrencyProvider>
  </PlatformSettingsProvider>,
)
