/**
 * ===========================================================================
 *  THE SHAPE OF ONE COMPARISON PAGE
 * ===========================================================================
 * Every page under /alternatives is drawn from one of these. A competitor is
 * added by writing one more file in lib/alternatives/competitors and naming
 * it in lib/alternatives/index.ts; the routes, the hub, the sitemap, the
 * metadata and the structured data all read the list.
 *
 * WHAT IS SAID ABOUT ANOTHER COMPANY CARRIES ITS EVIDENCE. Every price, fee
 * and feature of a competitor names the source it was read from and the day
 * it was checked (`Source`). A fact the sources disagree on, or that could
 * not be confirmed, says so (`status`), and the page prints that next to it
 * rather than leaving it out of view. tests/alternatives.test.ts fails a
 * claim with neither a source nor a status.
 *
 * WHAT IS SAID ABOUT STORELIB CARRIES THE CODE THAT DOES IT (`code`): a path
 * in this repository. The test fails a path that does not exist, so a
 * feature that is removed takes its claim with it.
 */

/** The day the competitor facts below were last checked, ISO. */
export type IsoDate = `${number}-${number}-${number}`

export type CategoryId = "digital-products" | "link-in-bio" | "communities" | "online-store"

/** A page on the competitor's own site (or its payment provider's) that a fact was read from. */
export interface Source {
  id: string
  /** The page's own title, or a plain description of it. */
  title: string
  url: string
  /** Who publishes it: the competitor, or Stripe for a processing rate. */
  publisher: string
  checkedOn: IsoDate
}

/**
 *   verified     the official source states it
 *   conflicting  official pages disagree; the page says which reading it uses
 *   unverified   it could not be confirmed from an official source
 */
export type ClaimStatus = "verified" | "conflicting" | "unverified"

/** One statement about a competitor. */
export interface Claim {
  text: string
  /** Source ids. Empty only when `status` is "unverified". */
  sources: string[]
  status: ClaimStatus
  /** What the page prints next to a conflicting or unverified claim. */
  note?: string
}

/** One statement about Storelib, with the code that makes it true. */
export interface StorelibPoint {
  text: string
  /** A file or folder in this repository. */
  code: string
  /** A point that is only true while this switch is on; `textOff` is said instead while it is off. */
  flag?: StorelibFlag
  textOff?: string
}

/** A platform switch a Storelib feature waits behind (lib/platform/flags, physical-commerce, explore-marketplace). */
export type StorelibFlag = "communities" | "explore" | "physical"

export type CellValue = "yes" | "no" | "partial" | "unknown"

export interface CompetitorCell {
  value: CellValue
  text?: string
  sources: string[]
  status: ClaimStatus
  note?: string
}

export interface StorelibCell {
  value: CellValue
  text?: string
  code: string
  /** Drawn as "Not offered today" while this switch is off. */
  flag?: StorelibFlag
  /** A row whose answer is a figure ("None on Free"), drawn without a Yes before it. */
  wordless?: true
}

export interface FeatureRow {
  id: string
  label: string
  storelib: StorelibCell
  competitor: CompetitorCell
}

/** A card rate charged per sale, in percent (2.9) and cents (30). */
export interface Rate {
  percent: number
  fixedCents: number
}

/** One of the competitor's plans, as the fee calculator charges it. */
export interface CompetitorPlan {
  id: string
  name: string
  /** What a month costs billed monthly. 0 for a plan with no subscription. */
  monthlyCents: number
  /** The monthly equivalent billed yearly, when the sources give one. */
  yearlyMonthlyCents?: number
  /** The platform's own cut of each sale. */
  fee: Rate
  /**
   * Card processing on top of `fee`. null when the platform's fee already is
   * its processing (Whop) or when no official rate could be found
   * (`processingKnown` false), and the calculator says which.
   */
  processing: Rate | null
  processingKnown: boolean
  processingLabel: string
  /** Whether this plan can sell a digital product at all. */
  sellsDigital: boolean
  claim: Claim
}

export interface StepItem {
  title: string
  text: string
}

export interface Faq {
  q: string
  a: string
  /** An answer that is only true while this Storelib switch is on. */
  flag?: StorelibFlag
  /** The answer while it is off. */
  aOff?: string
}

export type VisualId = "dashboard" | "onepage" | "creator" | "course" | "community" | "editor" | "presets"

export interface Competitor {
  slug: string
  name: string
  /** The competitor's own address, for the first mention. */
  homepage: string
  categories: CategoryId[]
  /** The hub's one line: who it is for, in plain words. */
  summary: string
  /** How it charges, in a few words, for the hub. */
  pricingShort: string
  seo: { title: string; description: string; h1: string }
  /** What the platform is and who uses it, a few short paragraphs. */
  intro: string[]
  /** The honest case for Storelib, specific to this platform. */
  whyStorelib: StorelibPoint[]
  /** When staying on the competitor is the better call. */
  whenToStay: Claim[]
  strengths: Claim[]
  limits: Claim[]
  storelibStrengths: StorelibPoint[]
  storelibLimits: StorelibPoint[]
  features: FeatureRow[]
  plans: CompetitorPlan[]
  /** Facts about pricing that are not a plan: refunds, payouts, tax. */
  pricingNotes: Claim[]
  calculatorDefaults: { priceDollars: number; sales: number }
  examples: { who: "Sellers" | "Educators" | "Creators"; title: string; text: string }[]
  switching: StepItem[]
  /**
   * What happens to each of the three things a seller moves: their products,
   * their customers, and their domain or link. Plain about what does not
   * move (Storelib has no customer or list import). The page links each to
   * the Help Center articles in MOVING_HELP (lib/alternatives/moving.ts).
   */
  moving: { products: string; customers: string; domain: string }
  /** A Storelib importer for this platform, when one exists: named above the steps. */
  importer?: { href: string; label: string; text: string }
  faqs: Faq[]
  visuals: VisualId[]
  sources: Source[]
  /** When the page's words last changed, ISO. */
  updated: IsoDate
}
