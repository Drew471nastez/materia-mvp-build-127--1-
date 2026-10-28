/**
 * ===========================================================================
 *  THE OFFERS GUIDE'S SCREENSHOTS, AND THEIR SIZES
 * ===========================================================================
 * Every picture in public/help/offers/, with its size in CSS pixels (the
 * files are 2x), so an article's image keeps its space while it loads.
 *
 * HOW THEY ARE MADE. Each is the real component (Products › Upsells and
 * bundles and its editor, Storelib's product section blocks, the website's
 * cart page and checkout) mounted outside Next with every /api request
 * answered from made up demo data, a ceramics studio called Fern & Clay,
 * and every price in them worked out by lib/offers. Written by
 * scripts/help-offer-shots.mjs (scripts/render-help-offer-shots.tsx); when
 * a screen changes, run it again.
 *
 * tests/help-offers.test.ts checks every name here has its file and every
 * file is used by an article.
 */
export const OFFER_SHOTS = {
  "cart-page-offers": [1100, 1017],
  "checkout-offers": [480, 716],
  "featured-products-offers": [1200, 1377],
  "offer-bundle-editor": [1100, 1433],
  "offer-new": [1100, 1513],
  "offer-quantity-break-editor": [1100, 1883],
  "offer-try-cart": [302, 164],
  "offer-upsell-editor": [1100, 1888],
  "offers-empty": [1062, 341],
  "offers-list-phone": [390, 471],
  "offers-list": [1162, 474],
  "product-page-offers-phone": [390, 725],
  "product-page-offers": [1072, 1106],
} as const satisfies Record<string, readonly [number, number]>
