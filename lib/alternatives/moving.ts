/**
 * The Help Center articles beside each part of "Moving to Storelib" on a
 * comparison page: products, customers, and the domain or bio link. Each is
 * a real article (lib/help/articles); tests/content-r45.test.ts checks it.
 */
export const MOVING_HELP: Record<"products" | "customers" | "domain", string[]> = {
  products: ["/help/products/create-a-product", "/help/products/files-and-delivery", "/help/orders-and-payouts/connect-stripe"],
  customers: ["/help/email/subscribers", "/help/email/send-an-email"],
  domain: ["/help/website-builder/custom-domain", "/help/website-builder/onepage"],
}

export const MOVING_TITLES: Record<keyof typeof MOVING_HELP, string> = {
  products: "Your products",
  customers: "Your customers",
  domain: "Your domain and links",
}
