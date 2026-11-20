/**
 * The worked examples on the comparison pages, written from the same sums
 * the calculator does, so a sentence on a page can never disagree with the
 * calculator above it or with what checkout charges.
 */
import type { Rate } from "./types"
import { storelibFeeCents } from "./storelib"
import { STORELIB } from "./storelib"
import { perSaleCents } from "./calculator"

export const money = (cents: number) => {
  const d = cents / 100
  return Number.isInteger(d) ? `$${d.toLocaleString("en-US")}` : `$${d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * "Forty sales of $25 a month is $1,000. Gumroad keeps $120 of it. Storelib
 * Free keeps $60, and Grow keeps $40 plus its $14 price." The competitor's
 * own cut only, before card processing, which both sides pay.
 */
export function monthOfFees(input: { priceDollars: number; sales: number; name: string; rate: Rate; monthlyCents?: number }): string {
  const price = Math.round(input.priceDollars * 100)
  const gross = price * input.sales
  const theirs = perSaleCents(price, input.rate) * input.sales + (input.monthlyCents ?? 0)
  const free = storelibFeeCents(price, "free") * input.sales
  const pro = storelibFeeCents(price, "growth") * input.sales
  const plan = input.monthlyCents ? ` including its plan` : ""
  return `${input.sales} sales of ${money(price)} a month is ${money(gross)}. ${input.name} keeps ${money(theirs)} of it${plan}, before card processing. Storelib Free keeps ${money(free)}, and Grow keeps ${money(pro)} plus its ${STORELIB.proPrice} price. Card processing applies on both.`
}
