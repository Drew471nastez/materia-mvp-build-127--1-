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
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId, type PlanId } from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"

/** The small line icon drawn beside a line. */
export type PlanLineIcon = "products" | "page" | "bank" | "mail" | "rate" | "everything" | "domain" | "brand" | "badge" | "sites" | "files" | "edits"

export interface PlanLine {
  icon: PlanLineIcon
  text: string
}

/** The most lines a card shows (pricing round 5, the owner: "not more than 5 lines"). */
export const MAX_PLAN_LINES = 5

/* "5% + $0.25": the rate a sale pays, without "per sale", so every line stays one line. */
const fee = (id: PlanId) => getFeeDescription(id).replace(/ per (sale|transaction)$/, "")
const sites = (n: number) => (n === 1 ? "1 website" : `${n} websites`)

/** The lines for each plan's card, written from the plan tables, five at most. */
export function publicPlanLines(): Record<OfferedPlanId, PlanLine[]> {
  const free = siteLimits("free")
  const grow = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const pro = siteLimits(SCALE_CHECKOUT_PLAN_ID)

  const freeLines: PlanLine[] = [
    { icon: "products", text: "Unlimited products and courses" },
    { icon: "page", text: `Your creator page and ${sites(free.maxSites)}` },
    { icon: "bank", text: "Get paid straight to your bank" },
    { icon: "mail", text: "Email your customers" },
    { icon: "rate", text: `Card rates: ${fee("free")}` },
  ]

  const growLines: PlanLine[] = [
    { icon: "everything", text: "Everything in Free" },
    { icon: "rate", text: `Lower card rates: ${fee(PRO_CHECKOUT_PLAN_ID)}` },
  ]
  if (grow.customDomain) growLines.push({ icon: "domain", text: "Your own domain" })
  if (grow.removeBranding) growLines.push({ icon: "brand", text: "No Storelib branding" })
  growLines.push({ icon: "badge", text: "Verified badge on your page" })

  const proLines: PlanLine[] = [
    { icon: "everything", text: "Everything in Grow" },
    { icon: "rate", text: `Lowest card rates: ${fee(SCALE_CHECKOUT_PLAN_ID)}` },
  ]
  if (pro.maxSites > grow.maxSites) proLines.push({ icon: "sites", text: `Up to ${sites(pro.maxSites)}` })
  if (PLAN_LIMITS[SCALE_CHECKOUT_PLAN_ID].storageQuotaBytes > PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes) proLines.push({ icon: "files", text: "The most room for your files" })
  if (pro.aiEditsPerMonth > grow.aiEditsPerMonth) proLines.push({ icon: "edits", text: "The most AI edits each month" })

  return {
    free: freeLines.slice(0, MAX_PLAN_LINES),
    [PRO_CHECKOUT_PLAN_ID]: growLines.slice(0, MAX_PLAN_LINES),
    [SCALE_CHECKOUT_PLAN_ID]: proLines.slice(0, MAX_PLAN_LINES),
  } as Record<OfferedPlanId, PlanLine[]>
}
