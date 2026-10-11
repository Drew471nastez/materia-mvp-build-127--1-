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
 * Chromium draws each at 2x in light mode, it is cropped to the part the
 * article is about and saved as WebP. The script is a harness bundled with
 * esbuild the way scripts/check-physical-commerce.mjs bundles
 * scripts/render-physical.tsx; when a screen changes, take its picture
 * again the same way and run it to rewrite this file.
 *
 * tests/help-center.test.ts checks every name here has its file and every
 * file is used by an article.
 */
export const PHYSICAL_SHOTS = {
  "buyer-order-page": [900, 1100],
  "checkout-pickup": [1200, 900],
  "checkout-settings": [752, 1064],
  "checkout-ship": [1200, 1000],
  "customer-emails": [752, 1154],
  "fulfil-question": [812, 500],
  "inventory-page": [1200, 760],
  "location-form": [762, 1193],
  "location-pickup": [736, 375],
  "locations-list": [812, 324],
  "low-stock": [812, 330],
  "new-product-kinds": [452, 344],
  "order-mark-shipped": [520, 420],
  "order-pickup": [752, 351],
  "order-shipped": [752, 351],
  "order-unfulfilled": [752, 518],
  "payouts-balance": [1168, 353],
  "product-buy-box": [460, 462],
  "product-fulfillment": [752, 505],
  "product-inventory": [752, 366],
  "product-shipping": [752, 274],
  "product-variants": [752, 937],
  "returns-settings": [812, 1013],
  "sales-channels": [752, 643],
  "shipping-add-rate": [744, 497],
  "shipping-general-profile": [812, 626],
  "shipping-packages": [812, 222],
  "taxes-create-region": [520, 428],
  "taxes-settings": [752, 756],
  "upsells-and-bundles": [1100, 760],
  "website-commerce": [1280, 860],
  "website-domains": [1280, 860],
  "website-policies": [1280, 860],
} as const satisfies Record<string, readonly [number, number]>
