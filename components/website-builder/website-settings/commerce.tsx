"use client"

import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { Card, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"

/**
 * What selling on this website means, and the door to each part of it.
 *
 * Nothing is set twice. The store's checkout, taxes, offers and the services
 * it reports to are the store's, kept in Settings and Products, and every
 * one of its websites uses them. So this page says what applies and opens
 * the place it is changed; it asks nothing itself. The doors for things that
 * ship are only here while physical products are on for Storelib.
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
        <Row label="Analytics and pixels" hint="Google Analytics, Tag Manager, Meta, TikTok and Pinterest load on every page of this website, and each paid order is reported to them once.">
          {door("/app/settings?tab=integrations", "Integrations")}
        </Row>
        <Row label="Customer emails" hint="The order confirmation and every update a buyer gets from your store.">
          {door("/app/settings?tab=emails", "Customer emails")}
        </Row>
      </Card>
    </>
  )
}
