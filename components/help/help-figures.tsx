/**
 * ===========================================================================
 *  PICTURES FOR THE HELP CENTRE
 * ===========================================================================
 * Each figure is a small drawing of the real screen an article explains,
 * built from the same colours, radii and type as the app, so a reader
 * recognises it when they open the real thing. Plain markup, no images to
 * go stale, sharp at any size, readable by a screen reader through the
 * caption. An article names a figure by id (lib/help/articles: "figure").
 */
import type { ReactNode } from "react"

const INK = "#1a1a2e"

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] p-3 sm:p-5" role="img" aria-label={label}>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  )
}

function Card({ title, sub, children }: { title?: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb]/80 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-4">
      {title ? <p className="text-[14px] font-semibold text-[#1a1a2e]">{title}</p> : null}
      {sub ? <p className="mt-0.5 text-[12px] leading-[17px] text-[#6b7280]">{sub}</p> : null}
      {children ? <div className={title || sub ? "mt-3" : ""}>{children}</div> : null}
    </div>
  )
}

function Toggle({ on = true, label, sub }: { on?: boolean; label: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#1a1a2e]">{label}</p>
        {sub ? <p className="text-[11.5px] text-[#6b7280]">{sub}</p> : null}
      </div>
      <span className={`relative mt-0.5 inline-block h-5 w-9 shrink-0 rounded-full ${on ? "bg-[#1a1a2e]" : "bg-[#d1d5db]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </div>
  )
}

function Input({ label, value, w }: { label?: string; value: string; w?: string }) {
  return (
    <div className={w}>
      {label ? <p className="mb-1 text-[11.5px] font-medium text-[#374151]">{label}</p> : null}
      <div className="flex min-h-8 items-center rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[12.5px] leading-[17px] text-[#1a1a2e]">{value}</div>
    </div>
  )
}

function Button({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return <span className={`inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium ${primary ? "bg-[#1a1a2e] text-white" : "border border-[#e5e7eb] bg-white text-[#1a1a2e]"}`}>{children}</span>
}

function Radio({ on, title, line }: { on?: boolean; title: string; line?: string }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb]"} bg-white`}>
      <span className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db]"}`}>{on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[#1a1a2e]">{title}</span>
        {line ? <span className="block text-[11px] leading-[15px] text-[#6b7280]">{line}</span> : null}
      </span>
    </div>
  )
}

function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "amber" | "blue" }) {
  const c = { gray: "bg-[#f1f2f4] text-[#4b5563]", green: "bg-[#dcfce7] text-[#166534]", amber: "bg-[#fef3c7] text-[#92400e]", blue: "bg-[#e0e7ff] text-[#3730a3]" }[tone]
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>
}

function Arrow() {
  return (
    <span aria-hidden className="hidden text-[#9ca3af] sm:block">
      →
    </span>
  )
}

const FIGURES: Record<string, (label: string) => ReactNode> = {
  "order-journey": (label) => (
    <Frame label={label}>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center">
        {[
          ["1", "Buyer pays", "Stock is held, nobody else can take it"],
          ["2", "Order arrives", "Unfulfilled, and you get an email"],
          ["3", "You ship it", "Mark as shipped, add tracking"],
          ["4", "Buyer is told", "Email with a Track package button"],
        ].map(([n, t, l], i) => (
          <div key={n} className="contents">
            <div className="rounded-xl border border-[#e5e7eb]/80 bg-white p-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1a1a2e] text-[11px] font-semibold text-white">{n}</span>
              <p className="mt-2 text-[13px] font-semibold text-[#1a1a2e]">{t}</p>
              <p className="text-[11.5px] leading-[16px] text-[#6b7280]">{l}</p>
            </div>
            {i < 3 ? <Arrow /> : null}
          </div>
        ))}
      </div>
    </Frame>
  ),
  "product-type": (label) => (
    <Frame label={label}>
      <Card title="What are you selling?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Radio title="Digital" line="Files to download" />
          <Radio title="Course" line="Lessons" />
          <Radio title="Membership" line="Monthly access" />
          <Radio on title="Physical" line="Shipped or picked up" />
        </div>
      </Card>
    </Frame>
  ),
  "product-cards": (label) => (
    <Frame label={label}>
      <div className="space-y-2">
        {[
          ["Inventory", "Track it, how many you have, low stock alert"],
          ["Variants", "Sizes and colors, each with price, quantity and photo"],
          ["Shipping", "Weight and shipping profile"],
          ["Fulfillment", "Who ships it"],
          ["Advanced", "SKU, barcode, cost, customs, tax, tags (optional)"],
        ].map(([t, s], i) => (
          <div key={t} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb]/80 bg-white px-3.5 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f1f2f4] text-[11px] font-semibold text-[#1a1a2e]">{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[#1a1a2e]">{t}</span>
              <span className="block text-[11.5px] text-[#6b7280]">{s}</span>
            </span>
          </div>
        ))}
      </div>
    </Frame>
  ),
  "inventory-card": (label) => (
    <Frame label={label}>
      <Card title="Inventory" sub="Stock goes down with every sale. Nobody can buy more than you have.">
        <div className="space-y-3">
          <Toggle label="Track inventory" sub="Count how many you have and stop selling at zero." />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Quantity" value="24" />
            <Input label="Low stock alert" value="5" />
          </div>
          <Toggle on={false} label="Keep selling when out of stock" sub="Buyers can still order, and you ship when it's back." />
        </div>
      </Card>
    </Frame>
  ),
  "low-stock-email": (label) => (
    <Frame label={label}>
      <div className="mx-auto max-w-[420px] rounded-xl border border-[#e5e7eb] bg-white p-4">
        <p className="text-[11px] text-[#6b7280]">From Storelib</p>
        <p className="mt-1 text-[15px] font-semibold text-[#1a1a2e]">Stock is running low</p>
        <div className="mt-3 divide-y divide-[#f1f2f4] text-[12.5px]">
          <div className="flex justify-between py-1.5">
            <span>Hoodie, M / Black</span>
            <span className="font-medium">3 left</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span>Tote bag</span>
            <span className="font-medium text-[#b42318]">Sold out</span>
          </div>
        </div>
        <span className="mt-3 inline-flex h-8 items-center rounded-lg bg-[#1a1a2e] px-3 text-[12px] font-medium text-white">Open Inventory</span>
      </div>
    </Frame>
  ),
  variants: (label) => (
    <Frame label={label}>
      <Card title="Variants" sub="6 variants, made from your options">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#eceef1] p-2">
            <span className="text-[12px] font-medium text-[#374151]">Size</span>
            {["S", "M", "L"].map((v) => (
              <span key={v} className="rounded-md bg-[#f1f2f4] px-2 py-0.5 text-[12px] font-medium">
                {v}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#eceef1] p-2">
            <span className="text-[12px] font-medium text-[#374151]">Color</span>
            {["Black", "White"].map((v) => (
              <span key={v} className="rounded-md bg-[#f1f2f4] px-2 py-0.5 text-[12px] font-medium">
                {v}
              </span>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-[#eceef1] text-[12px]">
            <div className="grid grid-cols-[28px_1fr_60px_44px_70px] gap-2 bg-[#f8f9fa] px-2.5 py-1.5 font-medium uppercase tracking-[0.02em] text-[#6b7280]">
              <span />
              <span>Variant</span>
              <span>Price</span>
              <span>Qty</span>
              <span>SKU</span>
            </div>
            {[
              ["S / Black", "$40", "8", "#1a1a2e"],
              ["S / White", "$40", "5", "#f3f4f6"],
              ["M / Black", "$40", "12", "#1a1a2e"],
            ].map(([n, p, q, c]) => (
              <div key={n} className="grid grid-cols-[28px_1fr_60px_44px_70px] items-center gap-2 border-t border-[#f1f2f4] px-2.5 py-1.5">
                <span className="h-6 w-6 rounded-md border border-[#e5e7eb]" style={{ background: c }} />
                <span className="font-medium text-[#1a1a2e]">{n}</span>
                <span>{p}</span>
                <span>{q}</span>
                <span className="text-[#9ca3af]">Optional</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </Frame>
  ),
  fulfillment: (label) => (
    <Frame label={label}>
      <Card title="Fulfillment" sub="How will this product be fulfilled?">
        <div className="grid gap-2 sm:grid-cols-2">
          <Radio on title="I'll ship it myself" line="You pack each order and send it." />
          <Radio title="Fulfillment warehouse / 3PL" line="A warehouse holds your stock and ships." />
          <Radio title="Dropshipping supplier" line="Your supplier ships to the buyer." />
          <Radio title="Print on demand" line="Printed and shipped after it sells." />
        </div>
      </Card>
    </Frame>
  ),
  "split-order": (label) => (
    <Frame label={label}>
      <div className="space-y-2">
        <Card>
          <div className="flex items-center justify-between">
            <Pill tone="amber">Unfulfilled</Pill>
            <span className="text-[11.5px] text-[#6b7280]">Shipped by you</span>
          </div>
          <p className="mt-2 text-[12.5px] text-[#1a1a2e]">Sticker pack × 2</p>
          <div className="mt-2 flex justify-end">
            <Button primary>Mark as shipped</Button>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <Pill tone="amber">Unfulfilled</Pill>
            <span className="text-[11.5px] text-[#6b7280]">Printed and shipped by PrintCo</span>
          </div>
          <p className="mt-2 text-[12.5px] text-[#1a1a2e]">Hoodie, M / Black × 1</p>
          <p className="mt-1.5 rounded-md bg-[#f7f7f8] px-2 py-1 text-[11px] text-[#4b5563]">The order is sent to your print partner. Add their tracking when they ship it.</p>
        </Card>
      </div>
    </Frame>
  ),
  profiles: (label) => (
    <Frame label={label}>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { name: "General", sub: "Every product", zones: [["United States", "Standard $5 · Express $15"], ["Rest of world", "Standard $18"]] },
          { name: "Heavy items", sub: "Only the products you pick", zones: [["United States", "Freight $40"]] },
        ].map((p) => (
          <div key={p.name} className="rounded-xl border-2 border-dashed border-[#d1d5db] bg-white p-3">
            <p className="text-[13px] font-semibold text-[#1a1a2e]">
              Profile: {p.name}
            </p>
            <p className="text-[11.5px] text-[#6b7280]">{p.sub}</p>
            <div className="mt-2 space-y-1.5">
              {p.zones.map(([z, r]) => (
                <div key={z} className="rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-2.5 py-2">
                  <p className="text-[12px] font-semibold text-[#1a1a2e]">Zone: {z}</p>
                  <p className="text-[11.5px] text-[#4b5563]">Rates: {r}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  ),
  "zone-rates": (label) => (
    <Frame label={label}>
      <Card>
        <div className="rounded-lg border border-[#eceef1]">
          <div className="border-b border-[#eceef1] px-3 py-2">
            <p className="text-[13px] font-semibold text-[#1a1a2e]">United States</p>
            <p className="text-[11.5px] text-[#6b7280]">United States</p>
          </div>
          {[
            ["Standard", "Flat rate · 3 to 5 business days", "$5.00"],
            ["Express", "Flat rate · 1 to 2 business days", "$15.00"],
            ["Free shipping", "On orders over $50.00", "Free"],
          ].map(([n, d, p]) => (
            <div key={n} className="flex items-center justify-between border-b border-[#f1f2f4] px-3 py-2 last:border-b-0">
              <span>
                <span className="block text-[12.5px] text-[#1a1a2e]">{n}</span>
                <span className="block text-[11px] text-[#6b7280]">{d}</span>
              </span>
              <span className="text-[12.5px] font-medium">{p}</span>
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  ),
  tiers: (label) => (
    <Frame label={label}>
      <Card title="Standard" sub="Based on order price">
        <div className="space-y-1.5 text-[12.5px]">
          {[
            ["Order price from $0.00", "$8.00"],
            ["Order price from $30.00", "$4.00"],
            ["Order price from $80.00", "$0.00"],
          ].map(([a, b]) => (
            <div key={a} className="grid grid-cols-2 gap-2">
              <span className="rounded-lg border border-[#e5e7eb] px-2.5 py-1.5">{a}</span>
              <span className="rounded-lg border border-[#e5e7eb] px-2.5 py-1.5">{b}</span>
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  ),
  "pickup-settings": (label) => (
    <Frame label={label}>
      <Card title="Studio" sub="Home or studio · Brooklyn, United States">
        <div className="space-y-3 rounded-lg border border-[#eceef1] p-3">
          <Toggle label="Offer local pickup here" sub="Buyers can collect their order here. Free for them." />
          <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
            <Input label="Usually ready in" value="24 hours" />
            <Input label="Pickup instructions" value="Side door, weekdays 10 to 6. Bring your order number." />
          </div>
        </div>
      </Card>
    </Frame>
  ),
  "checkout-pickup": (label) => (
    <Frame label={label}>
      <div className="mx-auto max-w-[420px] space-y-2.5 rounded-xl border border-[#e5e7eb] bg-white p-4">
        <p className="text-[14px] font-semibold text-[#1a1a2e]">How do you want it?</p>
        <div className="grid grid-cols-2 gap-2 text-[12.5px] font-medium">
          <span className="grid h-9 place-items-center rounded-lg border border-[#d9dce1] text-[#4b5563]">Ship</span>
          <span className="grid h-9 place-items-center rounded-lg border border-[#1a1a2e] text-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]">Pick up</span>
        </div>
        <div className="rounded-lg border border-[#d9dce1] p-3">
          <div className="flex justify-between">
            <span className="text-[12.5px] font-medium">Studio</span>
            <span className="text-[12.5px] font-medium">Free</span>
          </div>
          <p className="text-[11.5px] text-[#6b7280]">12 Main St, Brooklyn, NY</p>
          <p className="text-[11.5px] text-[#166534]">Usually ready in 24 hours</p>
        </div>
      </div>
    </Frame>
  ),
  "order-steps": (label) => (
    <Frame label={label}>
      <Card>
        <div className="flex items-center gap-1.5">
          {["Unfulfilled", "Processing", "Shipped", "Delivered"].map((s, i) => (
            <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${i < 2 ? "bg-[#1a1a2e] text-white" : i === 2 ? "border-2 border-[#1a1a2e] text-[#1a1a2e]" : "border border-[#d1d5db] text-[#9ca3af]"}`}>{i < 2 ? "✓" : i + 1}</span>
              <span className={`truncate text-[11.5px] font-medium ${i <= 2 ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`}>{s}</span>
              {i < 3 ? <span className={`hidden h-px flex-1 sm:block ${i < 2 ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]"}`} /> : null}
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  ),
  "mark-shipped": (label) => (
    <Frame label={label}>
      <div className="mx-auto max-w-[440px] rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        <p className="text-[15px] font-semibold" style={{ color: INK }}>
          Mark as shipped
        </p>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#eceef1] px-3 py-2 text-[12.5px]">
          <span>Hoodie, M / Black</span>
          <span className="rounded-md border border-[#e5e7eb] px-2 py-0.5">1</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input label="Carrier" value="USPS" />
          <Input label="Tracking number" value="9400 1000 0000 0000" />
        </div>
        <div className="mt-3">
          <Toggle label="Email the buyer" sub="Sends the shipping confirmation with the tracking link." />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button>Cancel</Button>
          <Button primary>Mark as shipped</Button>
        </div>
      </div>
    </Frame>
  ),
}

export function HelpFigure({ figure, caption }: { figure: string; caption: string }) {
  const draw = FIGURES[figure]
  if (!draw) return null
  return (
    <figure className="my-0">
      {draw(caption)}
      <figcaption className="mt-2 text-[13.5px] leading-snug text-[#6b7280]">{caption}</figcaption>
    </figure>
  )
}

export const HELP_FIGURE_IDS = Object.keys(FIGURES)
