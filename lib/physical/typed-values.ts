/**
 * ===========================================================================
 *  WHAT A FIELD KEEPS AS IT IS TYPED, IN THE PHYSICAL PRODUCT EDITOR
 * ===========================================================================
 * "Sensible values in all inputs." Each field takes only what its value can
 * be, as it is typed, so nothing has to be refused at Save:
 *
 *   money      digits and one decimal point, two places (none for yen), up
 *              to 9,999,999; a comma typed as the decimal point is a point
 *   count      a whole number, never negative: stock, low stock, limits
 *   decimal    weight and sizes: one point, up to three places
 *   sku        letters, digits and - _ . / , no spaces (one becomes -)
 *   barcode    UPC, EAN, GTIN or ISBN: digits, and the X an ISBN-10 can end in
 *
 * Pure, so tests/product20.test.ts holds every rule without a browser.
 */

/** An amount as typed: "12,5" is 12.5, "1,234.50" is 1234.50, never two points. */
export function moneyTyped(raw: string, decimals = 2): string {
  let s = raw.replace(/[^\d.,]/g, "")
  /* Both marks: the comma groups thousands. One: it is the decimal point. */
  s = s.includes(".") && s.includes(",") ? s.replace(/,/g, "") : s.replace(/,/g, ".")
  const [whole, ...rest] = s.split(".")
  const intPart = whole.replace(/^0+(?=\d)/, "").slice(0, 7)
  if (decimals === 0 || rest.length === 0) return intPart
  return `${intPart || "0"}.${rest.join("").slice(0, decimals)}`
}

/** A whole number, never negative, up to `maxDigits` digits. Leading zeros go, except a single 0. */
export function countTyped(raw: string, maxDigits = 7): string {
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, maxDigits)
}

/** A weight or a size: one decimal point, up to `places` places. */
export function decimalTyped(raw: string, places = 3): string {
  const s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "")
  const [whole, ...rest] = s.split(".")
  const intPart = whole.replace(/^0+(?=\d)/, "").slice(0, 6)
  return rest.length ? `${intPart || "0"}.${rest.join("").slice(0, places)}` : intPart
}

/** A SKU: the characters warehouses and spreadsheets keep, a space turned into a dash, 64 at most. */
export function skuTyped(raw: string): string {
  return raw.replace(/\s+/g, "-").replace(/[^A-Za-z0-9\-_./]/g, "").slice(0, 64)
}

/** A barcode: digits, and an ISBN-10's final X; 14 at most (GTIN-14). */
export function barcodeTyped(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase().slice(0, 14)
}

/** A barcode that isn't 8, 10, 12, 13 or 14 long, said in a few words; empty or right is null. */
export function barcodeProblem(code: string): string | null {
  if (!code) return null
  return [8, 10, 12, 13, 14].includes(code.length) ? null : "Barcodes are 8, 10, 12, 13 or 14 characters"
}

/** The SKUs used by more than one variant, as typed (case does not matter). */
export function repeatedSkus(skus: string[]): Set<string> {
  const seen = new Map<string, number>()
  for (const s of skus) {
    const k = s.trim().toLowerCase()
    if (k) seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
}

/** A compare at price at or under the price shows no sale: said so, rather than saved and ignored. */
export function compareAtProblem(compareAt: string, price: string): string | null {
  const c = Number.parseFloat(compareAt)
  const p = Number.parseFloat(price)
  if (!compareAt.trim() || !Number.isFinite(c) || !Number.isFinite(p)) return null
  return c > p ? null : "Higher than the price, to show a sale"
}
