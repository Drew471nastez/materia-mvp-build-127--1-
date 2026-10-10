/**
 * ===========================================================================
 *  IS IT STILL TRUE, RIGHT NOW
 * ===========================================================================
 * A reminder planned three days ago asks the database again immediately
 * before it sends. Each condition reads fresh rows through the store; what
 * was true when the job was planned does not count.
 *
 *   true      still true: send
 *   false     no longer true: the job is skipped, CONDITION_NO_LONGER_TRUE
 *   null      could not be read: the job waits and asks again later
 *
 * "Still failing" conditions for something the database has no row for (a
 * payout Storelib never recorded) answer true: a critical notice is not
 * dropped because a row is missing.
 */
import { homeProgress, type ProgressItem } from "@/lib/home/progress"
import { reviewRequestBlock } from "@/lib/reviews/request-rules"
import type { NotifyStore, ProductFact } from "./store"
import type { ConditionName } from "./types"

export interface ConditionJob {
  creator_id: string | null
  entity_id: string | null
  data: Record<string, unknown>
  /** The workflow step ("review_1", "review_2"), for a condition that depends on which one this is. */
  step?: string | null
  /** The Storelib login, for a condition read per person rather than per store (the setup steps). */
  recipient_user_id?: string | null
}

const live = (p: ProductFact) => !p.archived && p.status !== "deleted"
const isDraft = (p: ProductFact) => live(p) && (p.status === "draft" || p.status === "unpublished" || p.status === null)
const isReady = (p: ProductFact) => isDraft(p) && !!p.title && p.title.trim().length > 0 && p.hasFile

/** True when there is such a product, and its id and title go to the email. */
function named(product: ProductFact | undefined, facts?: Record<string, unknown>): boolean {
  if (!product) return false
  if (facts) {
    facts.productId = product.id
    if (product.title && product.title.trim()) facts.productTitle = product.title.trim().slice(0, 200)
  }
  return true
}

/**
 * Getting started steps the setup reminder may nudge about: not done, and
 * with a page that finishes them. Two are left out on purpose. "Add your
 * first product" and "Set up payments" have their own emails, and saying
 * both would be two mails about one thing; the guide and the first sale have
 * no page that finishes them (Home's card does those itself), so there would
 * be nowhere to send anybody.
 */
export const SETUP_NUDGE_SKIPS: readonly string[] = ["product", "payments"]

export function nextNudgeStep(steps: readonly ProgressItem[]): ProgressItem | null {
  return steps.find((s) => !s.done && !!s.href && !SETUP_NUDGE_SKIPS.includes(s.id)) ?? null
}

/**
 * What Stripe asked for, in words a person recognises. Its keys are
 * "individual.verification.document", "individual.dob.day" and the like: the
 * person prefix goes, the ones that come up on a creator's account are named
 * properly, and anything else becomes its key with the punctuation taken out,
 * which still reads. Several keys often mean one thing (a date of birth is
 * three of them), so they are deduplicated, and at most three are named, so a
 * fact row stays a line rather than a list.
 */
const REQUIREMENT_WORDS: [RegExp, string][] = [
  [/verification\.additional_document/, "A second document"],
  [/verification\.document/, "Photo ID"],
  [/^id_number|_id_number/, "ID number"],
  [/ssn_last_4/, "Last four of your social security number"],
  [/^dob/, "Date of birth"],
  [/^address|_address/, "Your address"],
  [/first_name|last_name|^name/, "Your name"],
  [/^phone/, "Phone number"],
  [/^email/, "Email address"],
  [/tax_id/, "Tax ID"],
  [/external_account/, "Bank account"],
  [/^url$/, "Your website address"],
  [/^mcc$/, "What you sell"],
]

export function readableRequirements(keys: readonly string[]): string {
  const words = new Set<string>()
  for (const key of keys) {
    const tail = String(key).replace(/^(individual|company|business_profile|representative|owners|directors)\./, "")
    const known = REQUIREMENT_WORDS.find(([re]) => re.test(tail))
    const text = known ? known[1] : tail.replace(/[._]+/g, " ").trim()
    if (!text || !/^[a-z]/i.test(text)) continue
    words.add(known ? text : text.charAt(0).toUpperCase() + text.slice(1))
    if (words.size >= 3) break
  }
  return [...words].join(", ").slice(0, 120)
}

/** Stripe is asking for who somebody is, rather than a bank account or a web address. */
export const IDENTITY_REQUIREMENT = /verification|id_number|ssn_last_4|\bdob\b|document|person/i

export const CONDITION_NAMES: readonly ConditionName[] = [
  "no_product_yet",
  "has_unfinished_draft",
  "has_ready_unpublished_product",
  "payment_setup_incomplete",
  "payment_setup_action_required",
  "store_setup_unfinished",
  "physical_setup_unfinished",
  "verification_still_needed",
  "payout_still_failed",
  "dispute_still_open",
  "domain_still_failing",
  "review_still_wanted",
]

export function isConditionName(v: unknown): v is ConditionName {
  return typeof v === "string" && (CONDITION_NAMES as readonly string[]).includes(v)
}

/**
 * `facts`, when given, receives what the email needs from the rows just read:
 * the draft a "finish" or "publish" reminder is about (productId,
 * productTitle), so the reminder names the product as it is now.
 */
export async function checkCondition(store: NotifyStore, name: ConditionName, job: ConditionJob, facts?: Record<string, unknown>, now: number = Date.now()): Promise<boolean | null> {
  const creatorId = job.creator_id
  const entityId = job.entity_id
  switch (name) {
    case "no_product_yet": {
      if (!creatorId) return false
      const products = await store.products(creatorId)
      if (!products) return null
      return products.filter(live).length === 0
    }
    case "has_unfinished_draft": {
      if (!creatorId) return false
      const products = await store.products(creatorId)
      if (!products) return null
      if (products.some((p) => live(p) && p.status === "published")) return false
      return named(products.find((p) => isDraft(p) && !isReady(p)), facts)
    }
    case "has_ready_unpublished_product": {
      if (!creatorId) return false
      const products = await store.products(creatorId)
      if (!products) return null
      if (products.some((p) => live(p) && p.status === "published")) return false
      return named(products.find(isReady), facts)
    }
    case "payment_setup_incomplete": {
      if (!creatorId) return false
      const p = await store.payments(creatorId)
      if (!p) return null
      const complete = p.status === "connected" || (p.chargesEnabled && p.payoutsEnabled && p.detailsSubmitted)
      /* The reminder names who handles setup (lib/notify/templates/catalog processor). */
      if (facts && p.provider === "airwallex") facts.provider = "airwallex"
      return !complete
    }
    case "payment_setup_action_required": {
      if (!creatorId) return false
      const p = await store.payments(creatorId)
      if (!p) return null
      return !!p.stripeAccountId && !(p.chargesEnabled && p.payoutsEnabled)
    }
    case "store_setup_unfinished": {
      /* Per login, not per store: Home reads the steps from the signed in user. */
      const userId = job.recipient_user_id ?? null
      if (!userId) return false
      const f = await store.setupProgress(userId)
      if (!f) return null
      const progress = homeProgress(f)
      if (progress.setupDone) return false
      const next = nextNudgeStep(progress.steps)
      if (!next || !next.href) return false
      if (facts) {
        facts.stepLabel = next.label
        facts.stepPath = next.href
        facts.stepsDone = progress.completed
        facts.stepsTotal = progress.total
        facts.stepsLeft = Math.max(0, progress.total - progress.completed)
      }
      return true
    }
    case "physical_setup_unfinished": {
      /* Home's physical card, read now (lib/home/physical-setup.ts): what stops a sale first, then the next step. */
      if (!creatorId || !store.physicalSetup) return false
      const s = await store.physicalSetup(creatorId)
      if (!s) return null
      const next = s.blockers[0] ?? s.steps.find((x) => !x.done)
      if (!next) return false
      if (facts) {
        facts.stepLabel = next.label
        facts.stepPath = next.href
        facts.stepsDone = s.steps.filter((x) => x.done).length
        facts.stepsTotal = s.steps.length
        facts.paymentsMissing = s.blockers.length > 0
      }
      return true
    }
    case "verification_still_needed": {
      if (!creatorId) return false
      const p = await store.payments(creatorId)
      if (!p) return null
      /* Nothing recorded: the column is not there yet, or no account.updated has been handled since it was. Say nothing rather than guess. */
      if (!p.requirements) return false
      if (p.requirements.length === 0) return false
      if (facts) {
        facts.requirements = readableRequirements(p.requirements)
        facts.requirementCount = p.requirements.length
        facts.identity = p.requirements.some((r) => IDENTITY_REQUIREMENT.test(r))
        facts.dueBy = p.requirementsDueBy
      }
      return true
    }
    case "payout_still_failed": {
      const id = entityId ?? (typeof job.data.payoutId === "string" ? job.data.payoutId : null)
      if (!id) return true
      const status = await store.payoutStatus(id)
      if (status === null) return null
      if (status === undefined) return true
      return status === "failed" || status === "canceled"
    }
    case "dispute_still_open": {
      const id = entityId ?? (typeof job.data.disputeId === "string" ? job.data.disputeId : null)
      if (!id) return true
      const closed = await store.disputeClosed(id)
      if (closed === null) return null
      return !closed
    }
    case "domain_still_failing": {
      if (!entityId) return true
      const d = await store.domainStatus(entityId)
      if (d === null) return null
      if (d === undefined) return false
      return d.status === "failed" || d.sslStatus === "failed"
    }
    case "review_still_wanted": {
      /* Every rule is in lib/reviews/request-rules: Storelib order, still theirs, not reviewed, not the seller, not unsubscribed, due. */
      if (!entityId) return false
      const f = await store.reviewRequestFacts(entityId)
      if (!f) return null
      const block = reviewRequestBlock(f, job.step === "review_2" ? "reminder" : "request", now)
      if (block) {
        if (facts) facts.reviewSkipped = block
        return false
      }
      if (facts) {
        facts.productId = f.product?.id ?? null
        if (f.product?.title) facts.productTitle = f.product.title.trim().slice(0, 200)
        facts.receiptToken = f.order?.receipt_token ?? null
        if (f.creatorName) facts.creatorName = f.creatorName.slice(0, 80)
        /* The picture and the reply address the email uses: the product as it is now, and the seller's published support inbox. */
        facts.productImage = f.productImage ?? null
        facts.creatorSupportEmail = f.creatorSupportEmail ?? null
        facts.orderId = f.order?.id ?? null
      }
      return true
    }
    default:
      return true
  }
}
