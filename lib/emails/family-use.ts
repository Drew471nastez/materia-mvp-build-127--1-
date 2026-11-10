/**
 * WHICH CUSTOMER EMAIL FAMILIES THIS STORE USES (wave 9, the owner: "if I
 * don't sell physical products or have a community, Customer emails should
 * not show those emails as if they apply, but not hide them completely
 * either: say 'You aren't selling physical products'").
 *
 *   Digital products   always offered and always in use: every store can
 *                      sell a download, and the checkout reminder is here
 *   Physical products  offered while physical commerce is on for Storelib;
 *                      in use once the store has a product it ships
 *                      (`sells.physical`, read by /api/store/emails and checked at the door
 *                      by lib/emails/shapes.ts).
 *                      Unknown (an older answer, a failed read) is in use,
 *                      so nothing is ever hidden behind a guess
 *   Communities        offered while communities are on for Storelib (or
 *                      when the store already has one); in use once it has
 *
 * A family that is offered but not in use keeps its pill and its place, and
 * shows an empty state that says why and how to start, in place of the list
 * (components/app/settings/customer-emails-panel.tsx). Families in use come
 * first, each group in its usual order. Pure, for the panel and the tests.
 */
import type { EmailFamily } from "./buyer-channel"
import { FAMILY_ORDER, emailsOf } from "./customer-list"
import { tt } from "@/lib/i18n/text"

/** What /api/store/emails says the store does. `physical` null: could not be read. */
export interface FamilyUse {
  physical: boolean | null
  communitiesOn: boolean
}

export interface FamilyPlan {
  family: EmailFamily
  /** The store does this, so its emails go out: listed as they are. */
  inUse: boolean
}

/**
 * The families this list offers, those in use first. `physicalOn` is the
 * platform's switch (usePhysicalCommerceEnabled); `communities` how many the
 * store has. Without `sells` (an answer from before wave 9) every offered
 * family reads as it did: physical in use, communities only when there is one.
 */
export function familyPlan({ physicalOn, sells, communities }: { physicalOn: boolean; sells?: FamilyUse | null; communities: number }): FamilyPlan[] {
  const plan: FamilyPlan[] = []
  for (const family of FAMILY_ORDER) {
    if (family === "digital") plan.push({ family, inUse: true })
    else if (family === "physical") {
      if (physicalOn) plan.push({ family, inUse: sells?.physical !== false })
    } else if (communities > 0 || sells?.communitiesOn === true) plan.push({ family, inUse: communities > 0 })
  }
  /* Stable: in use first, each keeping FAMILY_ORDER among its own. */
  return [...plan.filter((p) => p.inUse), ...plan.filter((p) => !p.inUse)]
}

/** The emails that go out for this store: every family in use, nothing from one it does not do. */
export function emailsInUse(plan: FamilyPlan[], physicalOn: boolean): number {
  return plan.filter((p) => p.inUse).reduce((n, p) => n + emailsOf(p.family, physicalOn).length, 0)
}

export interface FamilyEmptyCopy {
  title: string
  body: string
  action: string
  href: string
}

/** What a family the store does not use says in place of its list, and where to start it. */
export const FAMILY_EMPTY: Record<Exclude<EmailFamily, "digital">, FamilyEmptyCopy> = {
  physical: {
    get title() { return tt("You aren't selling physical products") },
    get body() { return tt("Order, shipping, pickup and return emails go to your buyers automatically once you sell something you ship.") },
    get action() { return tt("Add a physical product") },
    href: "/app/products/new?type=physical",
  },
  communities: {
    get title() { return tt("You don't have any communities") },
    get body() { return tt("Welcome, invite, event ticket and paid plan emails go to your members automatically once you start a community.") },
    get action() { return tt("Create a community") },
    href: "/app/community/new",
  },
}
