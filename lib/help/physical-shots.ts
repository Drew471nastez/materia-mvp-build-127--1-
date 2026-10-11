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
  "checkout-settings-phone": [382, 1321],
  "checkout-settings": [752, 1064],
  "checkout-ship": [1200, 1500],
  "customer-emails-phone": [382, 1569],
  "customer-emails": [752, 1285],
  "fulfil-question-phone": [382, 749],
  "fulfil-question": [812, 500],
  "integration-page": [980, 915],
  "integration-printful": [988, 928],
  "integrations-directory-phone": [390, 755],
  "integrations-directory": [988, 705],
  "inventory-page-phone": [390, 844],
  "inventory-page": [1200, 760],
  "location-form-phone": [348, 1655],
  "location-form": [762, 1193],
  "location-pickup": [736, 375],
  "locations-list": [812, 399],
  "low-stock-email": [640, 536],
  "low-stock": [812, 382],
  "new-product-kinds": [452, 344],
  "order-fulfill-items-phone": [390, 615],
  "order-fulfill-items": [552, 516],
  "order-pickup": [752, 525],
  "order-shipped-phone": [382, 605],
  "order-shipped": [752, 601],
  "order-unfulfilled-phone": [382, 670],
  "order-unfulfilled": [752, 666],
  "payouts-balance": [1168, 353],
  "product-buy-box": [460, 462],
  "product-fulfillment": [750, 544],
  "product-inventory": [752, 366],
  "product-shipping": [752, 330],
  "product-variants-phone": [382, 937],
  "product-variants": [752, 861],
  "returns-settings-phone": [382, 1172],
  "returns-settings": [812, 1065],
  "sales-channels-phone": [382, 702],
  "sales-channels": [752, 643],
  "shipping-add-rate-phone": [330, 859],
  "shipping-add-rate": [744, 498],
  "shipping-email": [640, 918],
  "shipping-general-profile-phone": [382, 815],
  "shipping-general-profile": [812, 657],
  "shipping-packages": [812, 243],
  "store-details-phone": [382, 1065],
  "store-details": [752, 926],
  "taxes-create-region": [552, 460],
  "taxes-settings-phone": [382, 1239],
  "taxes-settings": [752, 986],
  "upsells-and-bundles": [1100, 760],
  "website-commerce": [1280, 860],
  "website-domains": [1280, 860],
  "website-on-this-website": [788, 416],
  "website-policies": [1280, 860],
} as const satisfies Record<string, readonly [number, number]>
