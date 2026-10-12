"use client"

import { useEffect, useState } from "react"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { DEFAULT_LOW_STOCK_TEXT, siteCommerce } from "@/lib/website-builder/site-commerce"
import { trackersHint } from "@/lib/store/tracking"
import { Card, GOES_LIVE, PageTitle, Row, Toggle, buttonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"

/**
 * What selling on this website means, and the door to each part of it.
 *
 * Nothing is set twice. The store's checkout, taxes, offers and the services
 * it reports to are the store's, kept in Settings and Products, and every
 * one of its websites uses them. So this page says what applies and opens
 * the place it is changed. The one thing it asks is what this website shows
 * visitors of the store's own facts (On this website, below): stock left,
 * the free shipping banner, the return policy in the cart. The doors and
 * those controls for things that ship are only here while physical products
 * are on for Storelib.
 */
export function CommerceSettings({ ctx }: { ctx: SettingsContext }) {
  const physical = usePhysicalCommerceEnabled()
  const door = (href: string, label: string) => (
    <button type="button" onClick={() => ctx.onNavigate(href)} className={buttonClass}>
      {label}
    </button>
  )

  return (
    <>
      <PageTitle>Commerce</PageTitle>

      <Card title="Products">
        <Row
          label="Products on this website"
          hint={ctx.productCount === null ? "Every published product in your store." : `${ctx.productCount} published ${ctx.productCount === 1 ? "product" : "products"}. Any of them can be shown and sold here.`}
        >
          {door("/app/products", "Manage products")}
        </Row>
        <Row label="Sales channels" hint="Which products are listed on your websites, and which only on your storelib.com page.">
          {door("/app/settings?tab=channels", "Sales channels")}
        </Row>
      </Card>

      <Card title="Checkout">
        <Row label="Checkout" hint={physical ? "Buy now and the cart open Storelib checkout. A cart with something to post asks for the address and delivery first." : "Buy opens Storelib checkout. Cards and Google Pay, through Stripe."}>
          {door("/app/settings?tab=checkout", "Checkout settings")}
        </Row>
        <Row label="Taxes" hint="What you charge by country and region, and whether your prices include it.">
          {door("/app/settings?tab=taxes", "Taxes")}
        </Row>
        <Row label="Payouts" hint="Where your earnings are paid.">
          {door("/app/settings?tab=payments", "Payments settings")}
        </Row>
      </Card>

      {physical ? <OnThisWebsite ctx={ctx} /> : null}

      {physical ? (
        <Card title="Delivery and pickup">
          <Row label="Rates and zones" hint="What delivery costs for each address, and how long it takes.">
            {door("/app/settings?tab=shipping", "Delivery")}
          </Row>
          <Row label="Locations" hint="Where your stock is kept, where orders leave from, and local pickup.">
            {door("/app/settings?tab=locations", "Locations")}
          </Row>
          <Row label="Returns and refunds" hint="Your return window and the reasons a buyer can choose.">
            {door("/app/settings?tab=returns", "Returns")}
          </Row>
        </Card>
      ) : null}

      <Card title="Selling more">
        <Row label="Discount codes" hint="Codes a buyer types at checkout.">
          {door("/app/coupons", "Coupons")}
        </Row>
        <Row label="Upsells and bundles" hint="Products bought together for less, and an offer in the checkout.">
          {door("/app/offers", "Upsells and bundles")}
        </Row>
      </Card>

      <Card title="Integrations">
        <Row label="Analytics and pixels" hint={trackersHint()}>
          {door("/app/integrations", "Integrations")}
        </Row>
        <Row label="Customer emails" hint="The order confirmation and every update a buyer gets from your store.">
          {door("/app/settings?tab=emails", "Customer emails")}
        </Row>
      </Card>
    </>
  )
}

/**
 * ON THIS WEBSITE: the four things a shop that ships shows its visitors.
 * Website settings, not store settings, because two websites of one store
 * may want them differently; what they say (stock, the free shipping
 * amount, the return window) is the store's, so nothing is typed twice.
 * Written through the editor (ctx.onSettingChange), drafted and published
 * with the rest of the site, read by lib/website-builder/site-commerce.ts.
 */
function OnThisWebsite({ ctx }: { ctx: SettingsContext }) {
  const c = siteCommerce(ctx.settings as Record<string, unknown>)
  const [text, setText] = useState(typeof ctx.settings.low_stock_text === "string" ? ctx.settings.low_stock_text : "")
  const [amount, setAmount] = useState(c.freeShippingAmount === null ? "" : String(c.freeShippingAmount))
  /* Undo or a restored backup changes the settings under the fields. */
  useEffect(() => setText(typeof ctx.settings.low_stock_text === "string" ? ctx.settings.low_stock_text : ""), [ctx.settings.low_stock_text])
  useEffect(() => setAmount(c.freeShippingAmount === null ? "" : String(c.freeShippingAmount)), [c.freeShippingAmount])

  return (
    <Card title="On this website" footer={GOES_LIVE}>
      <Row label="Show how many are left" hint="Product pages say Only 3 left once stock reaches each product's low stock line." inline>
        <Toggle checked={c.showStockLeft} onChange={(on) => ctx.onSettingChange("show_stock_left", on)} label="Show how many are left" />
      </Row>
      {c.showStockLeft ? (
        <Row label="Low stock message" hint="{count} is the number left." htmlFor="ws-low-stock-text">
          <input
            id="ws-low-stock-text"
            className={inputClass}
            value={text}
            maxLength={80}
            placeholder={DEFAULT_LOW_STOCK_TEXT}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => ctx.onSettingChange("low_stock_text", text.trim())}
          />
        </Row>
      ) : null}
      <Row label="Free shipping banner" hint="A line over the header with how much more gets free shipping." inline>
        <Toggle checked={c.freeShippingBar} onChange={(on) => ctx.onSettingChange("free_shipping_bar", on)} label="Free shipping banner" />
      </Row>
      {c.freeShippingBar ? (
        <Row label="Free shipping from" hint="Leave empty to use the amount from your shipping rates." htmlFor="ws-free-shipping">
          <input
            id="ws-free-shipping"
            className={inputClass}
            inputMode="decimal"
            value={amount}
            placeholder="From your rates"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            onBlur={() => {
              const n = Number(amount)
              ctx.onSettingChange("free_shipping_threshold", amount.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0)
            }}
          />
        </Row>
      ) : null}
      <Row label="Return policy in the cart" hint="Your return window and a link to your refund policy, under Check out." inline>
        <Toggle checked={c.cartReturnsNote} onChange={(on) => ctx.onSettingChange("cart_returns_note", on)} label="Return policy in the cart" />
      </Row>
    </Card>
  )
}
