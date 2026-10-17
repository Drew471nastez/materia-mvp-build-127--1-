/**
 * THE JOIN BUTTON'S PRICE AND WORDS, PURE (round 26): what the side card, the phone's bar and the pricing card print,
 * with no React and no checkout in the module, so the tests and the server can read them (join-controls.tsx draws
 * them and re-exports them under the same names).
 */
import { JOIN_TRIAL_LABEL } from "@/lib/communities/format"
import { money, pricePer } from "@/lib/memberships/state"
import type { JoinOption, JoinStateView } from "./types"

type Interval = "month" | "year"

/** Both intervals on offer: the switch is drawn. */
export function bothIntervals(o: JoinOption | null): boolean {
  return !!o?.checkout?.month && !!o?.checkout?.year
}

/** The price for the chosen interval, "$19/month", or the option's own line. */
export function intervalPrice(o: JoinOption | null, interval: Interval): string {
  if (!o) return ""
  if (o.billing === "recurring") {
    if (interval === "year" && o.yearlyCents) return pricePer(o.yearlyCents, "year", o.currency)
    if (o.monthlyCents) return pricePer(o.monthlyCents, "month", o.currency)
    if (o.yearlyCents) return pricePer(o.yearlyCents, "year", o.currency)
  }
  return o.priceLine
}

/**
 * The price as the pricing card prints it: the figure large and what it is
 * per, apart ("$19" and "/month", "$249" and "once", "Free"). Null for a
 * tier with no price yet.
 */
export function priceParts(o: JoinOption | null, interval: Interval): { amount: string; per: string | null } | null {
  if (!o) return null
  if (o.kind === "free") return { amount: "Free", per: null }
  if (o.billing === "recurring") {
    const year = interval === "year" && o.yearlyCents ? o.yearlyCents : null
    const cents = year ?? o.monthlyCents ?? o.yearlyCents
    if (!cents) return null
    const per = year || !o.monthlyCents ? "/year" : "/month"
    return { amount: money(cents, o.currency), per }
  }
  if (o.priceCents) return { amount: money(o.priceCents, o.currency), per: "once" }
  return o.priceLine ? { amount: o.priceLine, per: null } : null
}

/**
 * The button's words with the chosen interval's price in them: "Join $24/month", "Join $240/year" (never "Join for").
 * A trial keeps "Start free trial" whatever the interval; several plans keep the state's own words ("Choose plan").
 */
export function buttonLabel(join: Pick<JoinStateView, "kind" | "option" | "label" | "plans">, interval: Interval): string {
  if ((join.plans?.length ?? 0) > 1) return join.label
  if (join.kind === "checkout" && join.option?.billing === "recurring") return (join.option.trialDays ?? 0) > 0 ? JOIN_TRIAL_LABEL : `Join ${intervalPrice(join.option, interval)}`
  return join.label
}
