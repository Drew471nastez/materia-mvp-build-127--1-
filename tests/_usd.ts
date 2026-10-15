/**
 * Imported FIRST by a suite whose expectations are written in dollars: a
 * store's prices are in the platform's charge currency (lib/store/shop-money),
 * read once when the module loads, and that is lei unless the deployment says
 * dollars. The live build charges dollars (tests/_journey/env.ts), so these
 * suites check what a visitor there sees. tests/shop-money.test.ts checks lei.
 */
process.env.NEXT_PUBLIC_PLATFORM_CURRENCY = "usd"
export {}
