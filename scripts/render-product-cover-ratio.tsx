/**
 * Product pictures in every place they are drawn, for scripts/check-product-cover-ratio.mjs (round AL).
 *
 * The pictures are files the probe serves (window.PROBE_COVER): a portrait 1080x1350 cover as uploaded, and the
 * product editor's 1280x720 copy of it with light grey padding either side, named as the editor names it
 * (`<ms>_<name>_processed.jpg`), so the page's own trim (lib/images/cover-trim) knows it for what it is; and a
 * landscape 1600x1000 cover, which the editor keeps as it is (1.6 is "already widescreen" to
 * processImageToWidescreen), so it has no padded copy: the "Professional Resume Kit" case.
 *
 *   ?view=places     the editor's Photos and video tiles, a creator's storelib.com store card, storelib.com's product
 *                    page gallery (as app/(storelib)/(marketing)/p/[slug] draws it), a website section's cards, an Explore card
 *   ?view=onepage    the OnePage product block (a block saved before part 377: only the padded copy), and its sheet
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MediaGrid } from "@/app/(storelib)/app/products/new/media-grid"
import type { MediaItem } from "@/app/(storelib)/app/products/new/editor-form"
import { StorefrontProductCard } from "@/components/storefront/storefront-product-card"
import { ProductCard } from "@/components/explore/product-card"
import { ProductGallery } from "@/components/product/product-gallery"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { defaultSettings, defaultTheme } from "@/lib/onepage/types"
import { withOriginalCoverRow } from "@/lib/products/cover"

type Cover = { padded: string; original: string; padded2: string; landscape: string }
const cover = (window as unknown as { PROBE_COVER: Cover }).PROBE_COVER
const params = new URLSearchParams(location.search)
const view = params.get("view") || "places"
const productId = "11111111-1111-4111-8111-111111111111"

/* What a website section is handed (lib/website-builder/shop-products.ts toCard): `image`, the main picture. */
const withOriginal = withOriginalCoverRow({ id: productId, thumbnail_url: cover.padded, cover_original_url: cover.original, gallery_urls: [cover.padded, cover.padded2] })
const beforePart377 = withOriginalCoverRow({ id: productId, thumbnail_url: cover.padded, gallery_urls: [cover.padded] })

function Places() {
  const [items, setItems] = React.useState<MediaItem[]>([
    { id: "a", type: "image", url: cover.padded, original: cover.original },
    { id: "b", type: "image", url: cover.padded2 },
  ])
  const card = (p: Partial<{ thumbnail_url: string; cover_original_url: string }>) => ({ id: productId, slug: "gym-guide", title: "Gym Starter Guide", price_cents: 2500, type: "digital", ...p })
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16, display: "grid", gap: 24 }}>
      <section data-probe="editor" style={{ maxWidth: 560 }}>
        <MediaGrid items={items} onChange={setItems} onRemove={() => {}} shape="wide" />
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        <div data-probe="store-original"><StorefrontProductCard product={card({ thumbnail_url: cover.padded, cover_original_url: cover.original })} /></div>
        <div data-probe="store-padded"><StorefrontProductCard product={card({ thumbnail_url: cover.padded })} /></div>
        <div data-probe="store-landscape"><StorefrontProductCard product={card({ thumbnail_url: cover.landscape })} /></div>
      </section>
      {/*
        storelib.com's product page: its gallery column as app/(storelib)/(marketing)/p/[slug] draws it (the stored 16:9
        copies, data-cover-padded="keep", fit="contain"). One gallery per picture, so each is the slide in front; one
        across on a phone, as the page's gallery is.
      */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div data-probe="product-page-cover" data-cover-padded="keep"><ProductGallery images={[cover.padded, cover.padded2]} title="Gym Starter Guide" shape="wide" fit="contain" /></div>
        <div data-probe="product-page-second" data-cover-padded="keep"><ProductGallery images={[cover.padded2]} title="Gym Starter Guide" shape="wide" fit="contain" /></div>
        <div data-probe="product-page-landscape" data-cover-padded="keep"><ProductGallery images={[cover.landscape]} title="Professional Resume Kit" shape="wide" fit="contain" /></div>
      </section>
      {/* A theme's product cards: a 16:9 card that covers, and a picture in its own shape. Plain markup, as a theme draws `block.settings.image`. */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        <div data-probe="site-wide" style={{ aspectRatio: "16 / 9", overflow: "hidden", background: "#fff" }}>
          <img src={withOriginal.thumbnail_url ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div data-probe="site-wide-padded" style={{ aspectRatio: "16 / 9", overflow: "hidden", background: "#fff" }}>
          <img src={beforePart377.thumbnail_url ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div data-probe="site-natural" style={{ background: "#fff" }}>
          <img data-probe-natural="" src={beforePart377.thumbnail_url ?? ""} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
        <div data-probe="site-wide-landscape" style={{ aspectRatio: "16 / 9", overflow: "hidden", background: "#fff" }}>
          <img src={cover.landscape} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      </section>
      <section data-probe="explore" style={{ maxWidth: 420 }}>
        <ProductCard product={{ ...card({ thumbnail_url: cover.padded, cover_original_url: cover.original }), slug: "gym-guide" } as never} />
      </section>
    </div>
  )
}

function OnePage() {
  const facts = {
    product: {
      id: productId, title: "Gym Starter Guide", slug: "gym-guide", type: "digital", descriptionHtml: "<p>A guide.</p>", priceCents: 2500, compareAtCents: null, pwyw: false, pwywMinCents: 0, currency: "USD",
      /* What /api/onepage/product answers for a product saved before part 377: the padded copy, then a padded gallery photo. */
      images: [cover.padded, cover.padded2],
      variants: [{ id: "22222222-2222-4222-8222-222222222222", name: "Standard", description: null, priceCents: 2500, pwyw: false, available: true, imageUrl: null }],
      soldOut: false, left: null, pageUrl: "/p/gym-guide", ships: false, faqs: [],
    },
    seller: { name: "Creator", avatarUrl: null },
    checkout: { instant: true, reason: null, url: "/checkout?productId=" + productId, tax: null, marketingOptIn: false, lastNameRequired: false },
    buyer: null,
  }
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => (String(input).includes("/api/onepage/product?") ? new Response(JSON.stringify(facts), { headers: { "Content-Type": "application/json" } }) : original(input, init))
  return (
    <PublicOnePage
      onepage={
        {
          id: "onepage", owner_id: "owner", seller_id: "seller", slug: "creator", title: "Creator", bio: "", avatar_url: null,
          theme: { ...defaultTheme, background_type: "solid", background_color: "#f6f4ef", text_color: "#1a1a2e" },
          settings: defaultSettings,
          blocks: [
            { id: "product", type: "product", enabled: true, sort_order: 1, data: { product_id: productId, product_title: "Gym Starter Guide", product_thumbnail: cover.padded, product_price_cents: 2500, product_slug: "gym-guide", product_type: "digital", show_price: true, style: "callout", style_chosen: true, tap_action: "sheet", instant_checkout: true, cta_text: "View guide" } },
          ],
        } as never
      }
    />
  )
}

Object.assign(globalThis, { PROBE_USER: null })
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_probe"
createRoot(document.getElementById("app")!).render(view === "onepage" ? <OnePage /> : <Places />)
