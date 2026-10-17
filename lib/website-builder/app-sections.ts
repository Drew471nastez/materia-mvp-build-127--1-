/**
 * ===========================================================================
 *  SECTIONS AND BLOCKS THAT STORELIB'S APPS PROVIDE
 * ===========================================================================
 * Add section has an Apps category, as Shopify's theme editor does: the
 * sections an app puts on a website, under the app's name, with whether the
 * app is on for this store and where to turn it on when it is not. They are
 * ordinary theme sections (themes/default/sections), added like any other;
 * this file only says which app each belongs to.
 *
 * TO ADD AN APP'S SECTION, an app registers it here: its section `type`
 * (the file it is drawn from must exist in the theme), or a `block` type
 * with the section types it goes in. An app that is new adds itself to
 * STORELIB_SECTION_APPS with the id its state is read under
 * (GET /api/store/integrations/apps, lib/integrations/storelib-apps.ts).
 * registerAppSections does the same at runtime for a module that would
 * rather not edit this list.
 *
 * Only real apps and real sections: Countdown and the plain Newsletter
 * sections are sections, not apps, and stay in their own categories. Email
 * capture is listed under Email because its sign ups land in the store's
 * contacts and its emails.
 *
 * Pure.
 */

export interface SectionApp {
  id: string
  name: string
  /** A name from components/website-builder/sections/icon-map.tsx. */
  icon: string
  /**
   * The id GET /api/store/integrations/apps reports the app's state under,
   * or null for an app that is always on (nothing to turn on).
   */
  stateId: string | null
  /** Where the app is turned on and set up. */
  href: string
}

export interface AppSectionEntry {
  app: string
  kind: "section" | "block"
  /** The section type, or the block type. */
  type: string
  /** For a block: the section types it goes in. */
  in?: string[]
  /** One line, for a card. */
  description?: string
}

export const STORELIB_SECTION_APPS: SectionApp[] = [
  { id: "reviews", name: "Storelib Reviews", icon: "star", stateId: "storelib-reviews", href: "/app/integrations?integration=storelib-reviews" },
  { id: "offers", name: "Bundles and upsells", icon: "gift", stateId: "storelib-bundles", href: "/app/offers" },
  { id: "email", name: "Email", icon: "mail", stateId: null, href: "/app/emails" },
  { id: "wishlist", name: "Wishlist", icon: "heart", stateId: null, href: "/app/customers" },
]

const ENTRIES: AppSectionEntry[] = [
  { app: "reviews", kind: "section", type: "reviews_product", description: "The product's reviews, with a form to write one." },
  { app: "reviews", kind: "section", type: "reviews_all", description: "Every review in the store." },
  { app: "reviews", kind: "section", type: "reviews_carousel", description: "Reviews in a row that scrolls." },
  { app: "reviews", kind: "section", type: "reviews_badge", description: "Stars and the review count." },
  { app: "reviews", kind: "block", type: "rating", in: ["product"], description: "Stars under the product's name." },
  { app: "email", kind: "section", type: "promo_newsletter", description: "Sign ups go to your contacts." },
  { app: "email", kind: "section", type: "newsletter", description: "Sign ups go to your contacts." },
  { app: "wishlist", kind: "block", type: "wishlist", in: ["product"], description: "Save for later, on the product." },
]

/**
 * Register more: an app's sections, or a new app. A type already listed is
 * replaced, so registering twice is harmless.
 */
export function registerAppSections(entries: AppSectionEntry[], app?: SectionApp): void {
  if (app && !STORELIB_SECTION_APPS.some((a) => a.id === app.id)) STORELIB_SECTION_APPS.push(app)
  for (const e of entries) {
    const at = ENTRIES.findIndex((x) => x.kind === e.kind && x.type === e.type)
    if (at >= 0) ENTRIES[at] = e
    else ENTRIES.push(e)
  }
}

export function appById(id: string): SectionApp | null {
  return STORELIB_SECTION_APPS.find((a) => a.id === id) ?? null
}

/** Every registered entry. */
export function appSectionEntries(): readonly AppSectionEntry[] {
  return ENTRIES
}

/** The app a section type belongs to, or null for a section no app provides. */
export function appForSection(type: string): { entry: AppSectionEntry; app: SectionApp } | null {
  const entry = ENTRIES.find((e) => e.kind === "section" && e.type === type)
  const app = entry ? appById(entry.app) : null
  return entry && app ? { entry, app } : null
}

/** The app a block type belongs to, in this section type. */
export function appForBlock(type: string, sectionType: string): { entry: AppSectionEntry; app: SectionApp } | null {
  const entry = ENTRIES.find((e) => e.kind === "block" && e.type === type && (!e.in || e.in.includes(sectionType)))
  const app = entry ? appById(entry.app) : null
  return entry && app ? { entry, app } : null
}

/**
 * On, off, or not known yet: from the states the apps route answered. An app
 * with nothing to turn on is always on; a state the route could not read is
 * unknown (null), and the card then says nothing either way.
 */
export function appIsOn(app: SectionApp, states: Record<string, string | null | undefined> | null): boolean | null {
  if (!app.stateId) return true
  const s = states?.[app.stateId]
  if (s === "on") return true
  if (s === "off" || s === "setup") return false
  return null
}
