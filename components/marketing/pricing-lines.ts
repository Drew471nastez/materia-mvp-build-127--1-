/**
 * ===========================================================================
 *  WHAT THE PLAN CARDS SAY (every surface: home, /pricing, Billing, upgrade)
 * ===========================================================================
 * The owner, landing round: "what is 1 GB of file storage? We should not have
 * those kind of rules across pricing cards", and the lines should read the
 * way Shopify's or Sellfy's do: what you can do, in plain words.
 *
 * PRICING ROUND 5, THE OWNER: the cards drawn like the reference picture, the
 * same lines on every surface, "more general, simple", "Card rates" instead
 * of "fees", and never more than five lines on a card. Each line carries the
 * name of a small line icon (components/billing/plan-cards draws it).
 * The limits (storage, pages per site, AI edits as a number) stay in the
 * comparison table on the upgrade page.
 *
 * EVERY LINE IS STILL TRUE. Each one that depends on a plan is written from
 * the table that decides it (the rate from lib/billing/fee-calculator, sites
 * and branding from lib/sites/plan, storage and AI edits compared from their
 * tables), and the rest name things every plan has, each tied in
 * tests/home-landing-rest.test.ts to the code that provides it. A plan gets no
 * line its tables do not give it.
 *
 * PRICING ONE ROW ROUND, THE OWNER: every line on every card fits on one row,
 * at 390 and 1280 (scripts/check-pricing-lines-one-row.mjs). The fixed wording
 * is said short ("Creator page + 2 websites", "Most pages per site"); the
 * numbers in it are still read from the tables.
 */
import { cardRateLabel, lowestRateKind, smallOrderThresholdLabel, standardRateFor } from "@/lib/billing/fee-calculator"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId, type PlanId } from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"

/** The small line icon drawn beside a line. */
export type PlanLineIcon = "products" | "page" | "bank" | "mail" | "rate" | "everything" | "domain" | "brand" | "badge" | "sites" | "files" | "edits" | "analytics" | "pages"

/** A plan's card rate on each kind of sale, and the sale under which the small-order rate applies. */
export interface PlanLineRates {
  digital: string
  physical: string
  smallOrderUnder: string
}

export interface PlanLine {
  icon: PlanLineIcon
  text: string
  /**
   * The rate line's rates by kind of sale, digital first. Pricing tooltip
   * round, the owner: no second row under the rate line. The line is one row
   * that starts with the plan's lowest rate, and a small info circle after
   * it opens these (components/billing/card-rates-tip).
   */
  rates?: PlanLineRates
}

/** A line as one sentence, for anything that reads the lines as text: "Rates from 3% + $0.25: 5% + $0.25 on digital products, 3% + $0.25 on physical products". */
export function planLineText(line: PlanLine): string {
  return line.rates ? `${line.text}: ${line.rates.digital} on digital products, ${line.rates.physical} on physical products` : line.text
}

/**
 * The most lines a card shows. Pricing round 5, the owner: "not more than 5
 * lines". Landing round 14, the owner: six on every card, the sixth one more
 * true line read from the plan's own tables.
 */
export const MAX_PLAN_LINES = 6

/*
  THE RATE LINE (pricing tooltip round, the owner). One row that starts with
  the plan's lowest rate, without "per sale": "Rates from 3% + $0.25"
  where a plan charges the two kinds differently (Free and Grow charge a
  product that ships less, lib/payments/fees/defaults), "Lowest rates:
  1.5% + $0.25" where both are the same (Pro). The rates by kind, digital
  first, sit behind the info circle after it. All of it is written from the
  fee rules (lib/billing/fee-calculator), never typed.
  Short enough to stay one row on a phone's card (390); the tip's title says "Card rates".
*/
const rateLine = (id: PlanId, lead: string): Pick<PlanLine, "text" | "rates"> => {
  const same = standardRateFor(id, "digital") === standardRateFor(id, "physical")
  return {
    text: `${lead}${same ? ":" : " from"} ${cardRateLabel(id, lowestRateKind(id))}`,
    rates: { digital: cardRateLabel(id, "digital"), physical: cardRateLabel(id, "physical"), smallOrderUnder: smallOrderThresholdLabel() },
  }
}
const sites = (n: number) => (n === 1 ? "1 website" : `${n} websites`)

/** The lines for each plan's card, written from the plan tables, six at most. */
export function publicPlanLines(): Record<OfferedPlanId, PlanLine[]> {
  const free = siteLimits("free")
  const grow = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const pro = siteLimits(SCALE_CHECKOUT_PLAN_ID)

  const freeLines: PlanLine[] = [
    { icon: "products", text: "Unlimited products" },
    { icon: "page", text: `Creator page + ${sites(free.maxSites)}` },
    { icon: "bank", text: "Payouts to your bank" },
    { icon: "mail", text: "Email customers" },
    { icon: "rate", ...rateLine("free", "Rates") },
    /* Landing round 14: the compare table's "Sales and visitor analytics", on every plan (app/(storelib)/app/analytics), said short. */
    { icon: "analytics", text: "Sales analytics" },
  ]

  const growLines: PlanLine[] = [
    { icon: "everything", text: "Everything in Free" },
    { icon: "rate", ...rateLine(PRO_CHECKOUT_PLAN_ID, "Rates") },
  ]
  if (grow.customDomain) growLines.push({ icon: "domain", text: "Your own domain" })
  if (grow.removeBranding) growLines.push({ icon: "brand", text: "No Storelib branding" })
  growLines.push({ icon: "badge", text: "Verified badge" })
  /* Landing round 14: Grow's storage over Free's (lib/storage/plans), said the way Pro's line says it. */
  if (PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes > PLAN_LIMITS.free.storageQuotaBytes) growLines.push({ icon: "files", text: "More room for files" })

  const proLines: PlanLine[] = [
    { icon: "everything", text: "Everything in Grow" },
    { icon: "rate", ...rateLine(SCALE_CHECKOUT_PLAN_ID, "Lowest rates") },
  ]
  if (pro.maxSites > grow.maxSites) proLines.push({ icon: "sites", text: `Up to ${sites(pro.maxSites)}` })
  if (PLAN_LIMITS[SCALE_CHECKOUT_PLAN_ID].storageQuotaBytes > PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes) proLines.push({ icon: "files", text: "Most room for files" })
  if (pro.aiEditsPerMonth > grow.aiEditsPerMonth) proLines.push({ icon: "edits", text: "Most AI edits" })
  /* Landing round 14: Pro's pages per website over Grow's and Free's (lib/sites/plan), the compare table's "Pages per website". */
  if (pro.maxPages > grow.maxPages && pro.maxPages > free.maxPages) proLines.push({ icon: "pages", text: "Most pages per site" })

  return {
    free: freeLines.slice(0, MAX_PLAN_LINES),
    [PRO_CHECKOUT_PLAN_ID]: growLines.slice(0, MAX_PLAN_LINES),
    [SCALE_CHECKOUT_PLAN_ID]: proLines.slice(0, MAX_PLAN_LINES),
  } as Record<OfferedPlanId, PlanLine[]>
}
