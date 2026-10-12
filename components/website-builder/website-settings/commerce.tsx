"use client"

import { useEffect, useState } from "react"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { DEFAULT_LOW_STOCK_TEXT, siteCommerce } from "@/lib/website-builder/site-commerce"
import { trackersHint } from "@/lib/store/tracking"
import { Card, GOES_LIVE, PageTitle, Row, Toggle, buttonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

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
      <PageTitle>{tt("Commerce")}</PageTitle>

      <Card title={tt("Products")}>
        <Row
          label={tt("Products on this website")}
          hint={ctx.productCount === null ? tt("Every published product in your store.") : tt("{productCount} published {productCount, plural, one {product} other {products}}. Any of them can be shown and sold here.", { productCount: ctx.productCount })}
        >
          {door("/app/products", tt("Manage products"))}
        </Row>
        <Row label={tt("Sales channels")} hint={tt("Which products are listed on your websites, and which only on your storelib.com page.")}>
          {door("/app/settings?tab=channels", tt("Sales channels"))}
        </Row>
      </Card>

      <Card title={tt("Checkout")}>
        <Row label={tt("Checkout")} hint={physical ? tt("Buy now and the cart open Storelib checkout. A cart with something to post asks for the address and delivery first.") : tt("Buy opens Storelib checkout. Cards and Google Pay, through Stripe.")}>
          {door("/app/settings?tab=checkout", tt("Checkout settings"))}
        </Row>
        <Row label={tt("Taxes")} hint={tt("What you charge by country and region, and whether your prices include it.")}>
          {door("/app/settings?tab=taxes", tt("Taxes"))}
        </Row>
        <Row label={tt("Payouts")} hint={tt("Where your earnings are paid.")}>
          {door("/app/settings?tab=payments", tt("Payments settings"))}
        </Row>
      </Card>

      {physical ? <OnThisWebsite ctx={ctx} /> : null}

      {physical ? (
        <Card title={tt("Delivery and pickup")}>
          <Row label={tt("Rates and zones")} hint={tt("What delivery costs for each address, and how long it takes.")}>
            {door("/app/settings?tab=shipping", tt("Delivery"))}
          </Row>
          <Row label={tt("Locations")} hint={tt("Where your stock is kept, where orders leave from, and local pickup.")}>
            {door("/app/settings?tab=locations", tt("Locations"))}
          </Row>
          <Row label={tt("Returns and refunds")} hint={tt("Your return window and the reasons a buyer can choose.")}>
            {door("/app/settings?tab=returns", tt("Returns"))}
          </Row>
        </Card>
      ) : null}

      <Card title={tt("Selling more")}>
        <Row label={tt("Discount codes")} hint={tt("Codes a buyer types at checkout.")}>
          {door("/app/coupons", tt("Coupons"))}
        </Row>
        <Row label={tt("Upsells and bundles")} hint={tt("Products bought together for less, and an offer in the checkout.")}>
          {door("/app/offers", tt("Upsells and bundles"))}
        </Row>
      </Card>

      <Card title={tt("Integrations")}>
        <Row label={tt("Analytics and pixels")} hint={trackersHint()}>
          {door("/app/integrations", tt("Integrations"))}
        </Row>
        <Row label={tt("Customer emails")} hint={tt("The order confirmation and every update a buyer gets from your store.")}>
          {door("/app/settings?tab=emails", tt("Customer emails"))}
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
    <Card title={tt("On this website")} footer={tt(GOES_LIVE)}>
      <Row label={tt("Show how many are left")} hint={tt("Product pages say Only 3 left once stock reaches each product's low stock line.")} inline>
        <Toggle checked={c.showStockLeft} onChange={(on) => ctx.onSettingChange("show_stock_left", on)} label={tt("Show how many are left")} />
      </Row>
      {c.showStockLeft ? (
        <Row label={tt("Low stock message")} hint={tt("{count} is the number left.")} htmlFor="ws-low-stock-text">
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
      <Row label={tt("Free shipping banner")} hint={tt("A line over the header with how much more gets free shipping.")} inline>
        <Toggle checked={c.freeShippingBar} onChange={(on) => ctx.onSettingChange("free_shipping_bar", on)} label={tt("Free shipping banner")} />
      </Row>
      {c.freeShippingBar ? (
        <Row label={tt("Free shipping from")} hint={tt("Leave empty to use the amount from your shipping rates.")} htmlFor="ws-free-shipping">
          <input
            id="ws-free-shipping"
            className={inputClass}
            inputMode="decimal"
            value={amount}
            placeholder={tt("From your rates")}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            onBlur={() => {
              const n = Number(amount)
              ctx.onSettingChange("free_shipping_threshold", amount.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0)
            }}
          />
        </Row>
      ) : null}
      <Row label={tt("Return policy in the cart")} hint={tt("Your return window and a link to your refund policy, under Check out.")} inline>
        <Toggle checked={c.cartReturnsNote} onChange={(on) => ctx.onSettingChange("cart_returns_note", on)} label={tt("Return policy in the cart")} />
      </Row>
    </Card>
  )
}
