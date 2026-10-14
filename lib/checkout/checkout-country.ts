/**
 * The delivery country a buyer picked at a website's checkout, kept on the
 * website's host for a year, so their next checkout opens on it before the
 * first frame (app/checkout/site/page.tsx) instead of guessing again.
 *
 * Pure: the page reads the cookie's name, the checkout writes it.
 */
export const CHECKOUT_COUNTRY_COOKIE = "sl_checkout_country"

/** Remembers a picked country in the browser. Nothing is said when the browser refuses cookies. */
export function rememberCheckoutCountry(country: string): void {
  if (typeof document === "undefined" || !/^[A-Z]{2}$/.test(country)) return
  try {
    document.cookie = `${CHECKOUT_COUNTRY_COOKIE}=${country}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
  } catch {
    /* Asked again next time. */
  }
}
