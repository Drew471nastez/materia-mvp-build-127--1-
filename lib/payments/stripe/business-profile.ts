import { creatorPageUrl } from "@/lib/onepage/resolve-address"

/**
 * ===========================================================================
 *  WHAT STRIPE IS TOLD ABOUT A CREATOR'S BUSINESS
 * ===========================================================================
 * Stripe asks every connected account for a website that shows what it
 * sells, and a description of the products, how buyers find the business
 * and how they pay. Its own form says a placeholder site is not accepted,
 * and a platform whose sellers all point at the platform's home page reads
 * as one business wearing many names, which is a fraud signal.
 *
 * Every account used to be opened with https://storelib.com as its website
 * and the creator's profile bio as the description ("Building cool stuff on
 * the internet"). Now it is the creator's own Storelib page, where their
 * products are, and a description of what actually happens: digital
 * products, sold through that page, paid once by card at Storelib's
 * checkout, delivered straight after payment. The creator can still change
 * both in Payout account, inside Stripe's own form.
 */
export const DIGITAL_GOODS_MCC = "5818"

export function creatorBusinessProfile(input: { username: string | null | undefined; displayName: string | null | undefined; platformUrl: string }): {
  url: string
  mcc: string
  product_description: string
} {
  let host = "storelib.com"
  try {
    host = new URL(input.platformUrl).host || host
  } catch {
    /* keep storelib.com */
  }
  const username = (input.username || "").trim()
  const url = username ? creatorPageUrl(username, host) : input.platformUrl
  const name = (input.displayName || "").replace(/\s+/g, " ").trim().slice(0, 80) || "This creator"
  const product_description = [
    `${name} sells digital products, such as downloads, templates and online courses, through their Storelib store at ${url}.`,
    "Buyers find the store through the creator's own audience, website and social media.",
    "Buyers pay once by card at Storelib's checkout and get their files straight after payment, by email and in their library.",
  ].join(" ")
  return { url, mcc: DIGITAL_GOODS_MCC, product_description }
}
