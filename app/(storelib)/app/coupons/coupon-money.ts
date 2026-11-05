/**
 * Money on the coupons pages, in the store's own currency (Settings ›
 * Country and currency). A code's fixed amount and its minimum are kept in
 * whole units of that currency (5.00, not 500), and checkout takes them off
 * in it (lib/checkout/coupons, lib/checkout/pricing).
 */
import { appLocale } from "@/lib/i18n/format"
export { currencySign } from "../offers/offer-money"

/** An amount in whole units (5, 12.5) in `currency`: "€5", "RON 12.50". */
export function couponMoney(currency: string) {
  return (value: number) => {
    const whole = Number.isInteger(Number(value))
    try {
      return new Intl.NumberFormat(appLocale(), { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(Number(value))
    } catch {
      return `${Number(value).toFixed(whole ? 0 : 2)} ${currency}`
    }
  }
}
