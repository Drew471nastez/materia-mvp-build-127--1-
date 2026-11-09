/**
 * ROUND W8: THE COUNT BESIDE A BLOCK'S ROW, IN ONE WIDTH.
 *
 * The owner's Links list: the sparkle, the numbers, the switch and the more
 * button jumped from row to row because "1284" is wider than "3". The count
 * is kept to four characters (1284 is 1.3k, 25300 is 25k, 2400000 is 2.4M)
 * and its slot is one width on every row (components/onepage/tabs/links-tab),
 * the whole figure in the button's accessible name.
 */
export function rowCountLabel(n: number): string {
  if (!(n >= 0) || !Number.isFinite(n)) return "0"
  if (n < 1000) return String(Math.round(n))
  const short = (v: number, unit: string) => (v < 9.95 ? `${Math.round(v * 10) / 10}`.replace(/\.0$/, "") : `${Math.round(v)}`) + unit
  if (n < 999_500) return short(n / 1000, "k")
  return short(n / 1_000_000, "M")
}
