/**
 * The markup scripts/check-missing-image.mjs measures: Storelib's own rows
 * drawn by the real components (ProductImg, MissingImage), and the head an
 * imported theme's page gets (MISSING_IMAGE_HEAD), printed as JSON.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { MissingImage, ProductImg } from "@/components/media/missing-image"
import { MISSING_IMAGE_CSS, MISSING_IMAGE_HEAD } from "@/lib/media/missing-image"

const BROKEN = "/broken/black-sleeves.jpg"

/* The site's mini cart line (components/website-builder/sections/renderers/HeaderSection.tsx): a 64px box, the scheme's tint behind it. */
function MiniCartLine({ title, src }: { title: string; src: string | null }) {
  return (
    <div className="flex items-start gap-3 border-b border-black/10 py-4" data-row="mini-cart">
      <a href="#" className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-lg" style={{ background: "#ececec" }} data-thumb="">
        <ProductImg src={src} className="h-full w-full object-cover" loading="lazy" />
      </a>
      <div className="min-w-0 flex-1" data-title="">
        <a href="#" className="block text-[14px] font-medium leading-snug">{title}</a>
        <p className="mt-0.5 text-[12px] opacity-60">Black / M</p>
        <p className="mt-2 text-[14px] tabular-nums">$48.00</p>
      </div>
    </div>
  )
}

/* Checkout's line (app/(storelib)/checkout/site/site-checkout.tsx LineImage): 48px, white, hairline. */
function CheckoutLine({ title, src }: { title: string; src: string | null }) {
  return (
    <div className="flex items-start gap-3.5 py-2" data-row="checkout">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]" data-thumb="">
        <ProductImg src={src} className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1" data-title="">
        <p className="text-[14px] font-medium text-[#1a1a2e]">{title}</p>
        <p className="text-[13px] text-[#6b7280]">Qty 1</p>
      </div>
    </div>
  )
}

const storelib = renderToStaticMarkup(
  <div className="mx-auto max-w-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <MiniCartLine title="Black Sleeves" src={BROKEN} />
    <MiniCartLine title="Linen Shirt" src={null} />
    <CheckoutLine title="Black Sleeves" src={BROKEN} />
    <CheckoutLine title="Gift card" src={null} />
    <div className="flex gap-3 py-3" data-row="box">
      <div className="h-24 w-24 overflow-hidden rounded-xl" data-thumb=""><MissingImage /></div>
      <div className="h-24 w-40 overflow-hidden rounded-xl" data-thumb=""><MissingImage /></div>
    </div>
  </div>,
)

process.stdout.write(JSON.stringify({ storelib, head: MISSING_IMAGE_HEAD, css: MISSING_IMAGE_CSS }))
