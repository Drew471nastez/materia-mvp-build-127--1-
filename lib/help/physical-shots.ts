/**
 * ===========================================================================
 *  THE PHYSICAL PRODUCTS GUIDE'S SCREENSHOTS, AND THEIR SIZES
 * ===========================================================================
 * Every picture in public/help/physical/, with its size in CSS pixels (the
 * files are 2x), so an article's image keeps its space while it loads.
 *
 * HOW THEY ARE MADE. Each is the real component (Settings' sections, the
 * product cards, the order page, Inventory, checkout, the buyer's order
 * page, Payouts through its demo, Website settings) mounted outside Next with
 * every /api request answered from made up demo data: a ceramics studio
 * called Fern & Clay, a buyer called Sam Rivera at example.com, a tracking
 * number of zeros. Nothing real is in them: no person, no account, no id.
 * Written by scripts/help-shots.mjs, which takes the pictures
 * (scripts/render-help-shots.tsx); when a screen changes, run it again.
 *
 * tests/help-center.test.ts checks every name here has its file and every
 * file is used by an article.
 */
export const PHYSICAL_SHOTS = {
  "buyer-order-page": [900, 1100],
  "checkout-pickup": [1200, 1000],
  "checkout-settings": [752, 1064],
  "checkout-ship": [1200, 1500],
  "customer-emails": [752, 1285],
  "fulfil-question": [812, 500],
  "inventory-page": [1200, 760],
  "location-form": [762, 1193],
  "location-pickup": [736, 375],
  "locations-list": [812, 324],
  "low-stock": [812, 382],
  "new-product-kinds": [452, 344],
  "order-mark-shipped": [520, 420],
  "order-pickup": [752, 351],
  "order-shipped": [752, 351],
  "order-unfulfilled": [752, 518],
  "payouts-balance": [1168, 353],
  "product-buy-box": [460, 462],
  "product-fulfillment": [750, 545],
  "product-inventory": [752, 366],
  "product-shipping": [752, 330],
  "product-variants": [752, 970],
  "returns-settings": [812, 1065],
  "sales-channels": [752, 643],
  "shipping-add-rate": [744, 498],
  "shipping-general-profile": [812, 657],
  "shipping-packages": [812, 243],
  "taxes-create-region": [520, 428],
  "taxes-settings": [752, 986],
  "upsells-and-bundles": [1100, 760],
  "website-commerce": [1280, 860],
  "website-domains": [1280, 860],
  "website-on-this-website": [788, 416],
  "website-policies": [1280, 860],
} as const satisfies Record<string, readonly [number, number]>
