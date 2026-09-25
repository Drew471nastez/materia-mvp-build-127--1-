/**
 * The two small controls around a product page's buy button, the real ones:
 * the refund line under the button (components/product/refund-policy-display)
 * and the share button beside the creator (components/product/share-button),
 * in a card shaped like the product page's buy card. Driven by
 * scripts/check-buy-extras.mjs.
 */
import { createElement as h } from "react"
import { createRoot } from "react-dom/client"

import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { ShareButton } from "@/components/product/share-button"

const params = new URLSearchParams(location.search)
if (params.get("share") === "none") {
  /* A browser with no system share sheet. */
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
} else {
  const calls: unknown[] = []
  ;(window as unknown as { __shared: unknown[] }).__shared = calls
  Object.defineProperty(navigator, "share", { value: (data: unknown) => { calls.push(data); return Promise.resolve() }, configurable: true })
}

try {
  createRoot(document.getElementById("root")!).render(
    h(
      "div",
      { style: { background: "#f6f6f7", minHeight: "100vh", padding: "24px 16px" } },
      h(
        "div",
        { className: "mx-auto max-w-[380px]" },
        h(
          "div",
          { className: "flex items-center justify-between py-2", "data-probe-creator": "" },
          h("span", { className: "font-medium text-[#1a1a2e]" }, "Luca Dragoste"),
          h(ShareButton, { productTitle: "SEO + GEO/AEO Content Guide for Product Brands", productSlug: "seo-geo-aeo-content-guide", creatorUsername: "lucadragoste", className: "h-8 w-8", iconSize: "h-4 w-4" }),
        ),
        h(
          "div",
          { className: "mt-3 rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm" },
          h("div", { className: "mb-4 text-2xl font-bold text-[#1a1a2e]" }, "$9,999"),
          h("button", { className: "h-12 w-full rounded-xl bg-[#111113] font-medium text-white" }, "Buy now"),
          h("button", { className: "mt-2 h-11 w-full rounded-xl border border-[#e5e7eb] text-[#1a1a2e]" }, "Add to wishlist"),
          h(RefundPolicyDisplay, {
            enabled: true,
            policyType: "no_refunds",
            finePrint: params.get("fine") === "none" ? null : "Every sale is final. If a file will not open, write to me and I will send a working copy the same day.",
            updatedAt: "2026-09-03T10:00:00Z",
            className: "mt-3",
          }),
        ),
      ),
    ),
  )
} catch (e) {
  ;(window as unknown as { __err: string }).__err = String((e as Error)?.stack || e)
}
