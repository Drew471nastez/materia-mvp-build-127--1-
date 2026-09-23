"use client"

import { Card, GOES_LIVE, PageTitle, Row, Toggle, buttonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"

/**
 * What selling on this website means. Storelib sells one product at a time:
 * Buy goes to Storelib's checkout, which takes the card through Stripe and
 * pays out to the account in Settings › Payments. So most of this page is
 * facts and doors, and the two controls are the shipping ones the theme
 * really draws.
 */
export function CommerceSettings({ ctx }: { ctx: SettingsContext }) {
  const threshold = typeof ctx.settings.free_shipping_threshold === "number" ? ctx.settings.free_shipping_threshold : 0
  const bar = ctx.settings.free_shipping_bar === true

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

      <Card title="Shipping" footer={GOES_LIVE}>
        <Row label="Free shipping from" hint="Only for products you ship. Leave at 0 for none." htmlFor="wb-free-shipping">
          <div className="relative md:w-[160px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14.5px] text-white/45">$</span>
            <input
              id="wb-free-shipping"
              type="number"
              inputMode="decimal"
              min={0}
              value={threshold || ""}
              placeholder="0"
              onChange={(e) => {
                const n = Number(e.target.value)
                ctx.onSettingChange("free_shipping_threshold", Number.isFinite(n) && n > 0 ? n : 0)
              }}
              className={inputClass + " pl-7 md:w-[160px]"}
            />
          </div>
        </Row>
        <Row label="Free shipping bar" hint="A line above the header saying how far a visitor is from free shipping.">
          <Toggle checked={bar} onChange={(on) => ctx.onSettingChange("free_shipping_bar", on)} label="Show the free shipping bar" />
        </Row>
      </Card>
    </>
  )
}
