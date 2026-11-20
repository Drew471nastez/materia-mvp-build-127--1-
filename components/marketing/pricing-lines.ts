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
 */
import { cardRateLabel, sameRateForBothKinds } from "@/lib/billing/fee-calculator"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId, type PlanId } from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"

/** The small line icon drawn beside a line. */
export type PlanLineIcon = "products" | "page" | "bank" | "mail" | "rate" | "everything" | "domain" | "brand" | "badge" | "sites" | "files" | "edits" | "analytics" | "pages"

export interface PlanLine {
  icon: PlanLineIcon
  text: string
  /**
   * A short second part of the same line, drawn smaller and muted as a row
   * under the text (components/billing/plan-cards). The rate line uses it
   * for the physical rate where a plan's differs from its digital one, so
   * the card says both without a seventh line.
   */
  detail?: string
}

/** A line as one sentence, for anything that reads the lines as text: "Card rates: 5% + $0.25, 3% + $0.25 on physical products". */
export function planLineText(line: PlanLine): string {
  return line.detail ? `${line.text}, ${line.detail}` : line.text
}

/**
 * The most lines a card shows. Pricing round 5, the owner: "not more than 5
 * lines". Landing round 14, the owner: six on every card, the sixth one more
 * true line read from the plan's own tables.
 */
export const MAX_PLAN_LINES = 6

/*
  "5% + $0.25": the rate a digital sale pays, without "per sale". A product
  that ships pays its own rate on Free and Grow (lib/payments/fees/defaults),
  said in the line's detail: "3% + $0.25 on physical products". Pro pays the same on
  both, so its line has no detail. Both are written from the fee rules
  (lib/billing/fee-calculator cardRateLabel), never typed.
*/
const fee = (id: PlanId) => cardRateLabel(id, "digital")
const physicalDetail = (id: PlanId): Pick<PlanLine, "detail"> => (sameRateForBothKinds(id) ? {} : { detail: `${cardRateLabel(id, "physical")} on physical products` })
const sites = (n: number) => (n === 1 ? "1 website" : `${n} websites`)

/** The lines for each plan's card, written from the plan tables, six at most. */
export function publicPlanLines(): Record<OfferedPlanId, PlanLine[]> {
  const free = siteLimits("free")
  const grow = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const pro = siteLimits(SCALE_CHECKOUT_PLAN_ID)

  const freeLines: PlanLine[] = [
    { icon: "products", text: "Unlimited products and courses" },
    { icon: "page", text: `Your creator page and ${sites(free.maxSites)}` },
    { icon: "bank", text: "Get paid straight to your bank" },
    { icon: "mail", text: "Email your customers" },
    { icon: "rate", text: `Card rates: ${fee("free")}`, ...physicalDetail("free") },
    /* Landing round 14: the compare table's "Sales and visitor analytics", on every plan (app/(storelib)/app/analytics). */
    { icon: "analytics", text: "Sales and visitor analytics" },
  ]

  const growLines: PlanLine[] = [
    { icon: "everything", text: "Everything in Free" },
    { icon: "rate", text: `Lower card rates: ${fee(PRO_CHECKOUT_PLAN_ID)}`, ...physicalDetail(PRO_CHECKOUT_PLAN_ID) },
  ]
  if (grow.customDomain) growLines.push({ icon: "domain", text: "Your own domain" })
  if (grow.removeBranding) growLines.push({ icon: "brand", text: "No Storelib branding" })
  growLines.push({ icon: "badge", text: "Verified badge on your page" })
  /* Landing round 14: Grow's storage over Free's (lib/storage/plans), said the way Pro's line says it. */
  if (PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes > PLAN_LIMITS.free.storageQuotaBytes) growLines.push({ icon: "files", text: "More room for your files" })

  const proLines: PlanLine[] = [
    { icon: "everything", text: "Everything in Grow" },
    { icon: "rate", text: `Lowest card rates: ${fee(SCALE_CHECKOUT_PLAN_ID)}`, ...physicalDetail(SCALE_CHECKOUT_PLAN_ID) },
  ]
  if (pro.maxSites > grow.maxSites) proLines.push({ icon: "sites", text: `Up to ${sites(pro.maxSites)}` })
  if (PLAN_LIMITS[SCALE_CHECKOUT_PLAN_ID].storageQuotaBytes > PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes) proLines.push({ icon: "files", text: "The most room for your files" })
  if (pro.aiEditsPerMonth > grow.aiEditsPerMonth) proLines.push({ icon: "edits", text: "The most AI edits each month" })
  /* Landing round 14: Pro's pages per website over Grow's and Free's (lib/sites/plan), the compare table's "Pages per website". */
  if (pro.maxPages > grow.maxPages && pro.maxPages > free.maxPages) proLines.push({ icon: "pages", text: "The most pages on each website" })

  return {
    free: freeLines.slice(0, MAX_PLAN_LINES),
    [PRO_CHECKOUT_PLAN_ID]: growLines.slice(0, MAX_PLAN_LINES),
    [SCALE_CHECKOUT_PLAN_ID]: proLines.slice(0, MAX_PLAN_LINES),
  } as Record<OfferedPlanId, PlanLine[]>
}
