/**
 * The ways a tap on a phone becomes a checkout, for scripts/check-checkout-mobile.mjs.
 *
 *   ?path=instant   a OnePage product block whose tap opens the instant checkout window at once
 *   ?path=sheet     a OnePage product block whose tap opens the product sheet; its Buy opens the window
 *   ?path=buy       the product page's Buy button (app/(storelib)/(marketing)/p/[slug]), which goes to /checkout
 *   &price=free|paid
 *
 * The product's facts come from the probe's own server (/api/onepage/product), answered after the
 * probe's lag, so the window is measured against a real round trip and the probe can count the reads.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { BuyButton } from "@/components/checkout/buy-button"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
const path = params.get("path") || "instant"
const paid = params.get("price") !== "free"

function plain(width: number, height: number, color: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = "rgba(255,255,255,0.25)"
  for (let i = 0; i < 10; i++) ctx.fillRect((i * width) / 10, 0, width / 40, height)
  return canvas.toDataURL("image/png")
}
const image = plain(540, 720, "#7f2450")
const avatar = plain(300, 300, "#af6800")
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_probe"
const productId = "11111111-1111-4111-8111-111111111111"
Object.assign(globalThis, { PROBE_USER: null, __productImage: image })

/* A page taller than the screen, scrolled before the tap, so a jump of the page behind shows. */
document.body.style.paddingBottom = "1600px"

const root = createRoot(document.getElementById("app")!)
if (path === "buy") {
  root.render(
    <main className="mx-auto max-w-[480px] px-4 pt-6">
      <div className="aspect-[4/3] rounded-2xl bg-[#eef0f2]" />
      <h1 className="mt-4 text-[24px] font-bold text-[#1a1a2e]">Gym Starter Guide</h1>
      <p className="mt-1 text-[14px] text-[#6b7280]">A complete guide, with clear steps.</p>
      <div className="mt-5" data-probe-buy="">
        <BuyButton productId={productId} price={paid ? 2500 : 0} creatorId="creator" />
      </div>
    </main>,
  )
} else {
  root.render(
    <PublicOnePage
      onepage={
        {
          id: "onepage",
          owner_id: "owner",
          seller_id: "seller",
          slug: "creator",
          title: "Creator account",
          bio: "Training and coaching",
          avatar_url: avatar,
          theme: { ...defaultTheme, background_type: "solid", background_color: "#f6f4ef", text_color: "#1a1a2e" },
          settings: defaultSettings,
          blocks: [
            { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_name: true, show_avatar: true, show_bio: true } },
            {
              id: "product",
              type: "product",
              enabled: true,
              sort_order: 1,
              data: {
                product_id: productId,
                product_title: "Gym Starter Guide",
                product_thumbnail: image,
                product_price_cents: paid ? 2500 : 0,
                product_slug: "gym-guide",
                product_type: "digital",
                show_price: true,
                show_description: true,
                style: "callout",
                style_chosen: true,
                tap_action: path === "sheet" ? "sheet" : "checkout",
                instant_checkout: true,
                cta_text: "View guide",
              },
            },
          ],
        } as never
      }
    />,
  )
}
