"use client"

import { Card, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"

/**
 * What selling on this website means. Storelib sells one product at a time:
 * Buy goes to Storelib's checkout, which takes the card through Stripe and
 * pays out to the account in Settings › Payments. So this page is facts
 * and doors. Shipping is not asked here: the owner took it out.
 */
export function CommerceSettings({ ctx }: { ctx: SettingsContext }) {
  return (
    <>
      <PageTitle>Commerce</PageTitle>

      <Card title="Products">
        <Row
          label="Products on this website"
          hint={ctx.productCount === null ? "Every published product in your store." : `${ctx.productCount} published ${ctx.productCount === 1 ? "product" : "products"}. Any of them can be shown and sold here.`}
        >
          <button type="button" onClick={() => ctx.onNavigate("/app/products")} className={buttonClass}>
            Manage products
          </button>
        </Row>
      </Card>

      <Card title="Checkout">
        <Row label="Checkout" hint="Buy opens Storelib checkout. Cards and Google Pay, through Stripe.">
          <span className="text-[14px] text-white/70">Storelib checkout</span>
        </Row>
        <Row label="Currency" hint="Every price is charged in US dollars.">
          <span className="text-[14px] text-white/70">USD</span>
        </Row>
        <Row label="Payouts" hint="Where your earnings are paid.">
          <button type="button" onClick={() => ctx.onNavigate("/app/settings?tab=payments")} className={buttonClass}>
            Payments settings
          </button>
        </Row>
      </Card>
    </>
  )
}
