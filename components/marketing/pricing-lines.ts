/**
 * ===========================================================================
 *  WHAT THE PUBLIC PLAN CARDS SAY (the home page and /pricing)
 * ===========================================================================
 * The owner, landing round: "what is 1 GB of file storage? We should not have
 * those kind of rules across pricing cards", and the checks should read the
 * way Shopify's or Sellfy's do: what you can do, in plain words.
 *
 * So the public cards say what each plan lets a seller do, and leave the
 * limits (storage, pages per site, AI edits as a number) to the comparison
 * table on the upgrade page. The Billing tab and the upgrade page keep
 * lib/billing/plans.ts's own lines, where those numbers are what somebody
 * already paying wants to read.
 *
 * EVERY LINE IS STILL TRUE. Each one that depends on a plan is written from
 * the table that decides it (the fee from lib/billing/fee-calculator, sites
 * and branding from lib/sites/plan, storage and AI edits
 * compared from their tables), and the rest name things every plan has,
 * each tied in tests/home-landing-rest.test.ts to the code that provides it.
 * A plan gets no line its tables do not give it.
 */
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { PRO_CHECKOUT_PLAN_ID, SCALE_CHECKOUT_PLAN_ID, type OfferedPlanId, type PlanId } from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"

export interface PublicPlanLines {
  features: string[]
  /** What Free does not have that Pro does, drawn greyed so the cards compare. */
  excluded: string[]
}

const fee = (id: PlanId) => getFeeDescription(id).replace("per transaction", "per sale")
const sites = (n: number) => (n === 1 ? "1 website" : `${n} websites`)

/** The lines for each plan on the public cards, written from the plan tables. */
export function publicPlanLines(): Record<OfferedPlanId, PublicPlanLines> {
  const free = siteLimits("free")
  const pro = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const scale = siteLimits(SCALE_CHECKOUT_PLAN_ID)

  const freeFeatures = [
    "Sell unlimited digital products and courses",
    `Your creator page and ${sites(free.maxSites)}`,
    "Get paid straight to your bank",
    "Email your customers",
    "See your sales and visitors",
    fee("free"),
  ]
  const freeExcluded = !free.customDomain && pro.customDomain ? ["Your own domain"] : []

  const proFeatures = ["Everything in Free", `Lower fee: ${fee(PRO_CHECKOUT_PLAN_ID)}`]
  if (pro.customDomain) proFeatures.push("Your own domain")
  if (pro.removeBranding) proFeatures.push("No Storelib branding")
  proFeatures.push("Verified badge on your page")
  if (pro.maxSites > free.maxSites) proFeatures.push(`Up to ${sites(pro.maxSites)}`)
  if (pro.aiEditsPerMonth > free.aiEditsPerMonth) proFeatures.push("More AI edits each month")

  const scaleFeatures = ["Everything in Pro", `Lowest fee: ${fee(SCALE_CHECKOUT_PLAN_ID)}`]
  if (scale.maxSites > pro.maxSites) scaleFeatures.push(`Up to ${sites(scale.maxSites)}`)
  if (PLAN_LIMITS[SCALE_CHECKOUT_PLAN_ID].storageQuotaBytes > PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes) scaleFeatures.push("The most room for your files")
  if (scale.aiEditsPerMonth > pro.aiEditsPerMonth) scaleFeatures.push("The most AI edits each month")

  return {
    free: { features: freeFeatures, excluded: freeExcluded },
    [PRO_CHECKOUT_PLAN_ID]: { features: proFeatures, excluded: [] },
    [SCALE_CHECKOUT_PLAN_ID]: { features: scaleFeatures, excluded: [] },
  } as Record<OfferedPlanId, PublicPlanLines>
}
