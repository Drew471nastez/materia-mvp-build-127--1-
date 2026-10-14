"use client"

/**
 * ===========================================================================
 *  WHICH SITE A SECTION IS BEING DRAWN ON
 * ===========================================================================
 * A section is written once and rendered on every creator's site, so it knows
 * nothing about whose site it is on. That is right for markup and wrong for
 * the two sections that have to send something somewhere: a newsletter needs
 * a list to add to, and a form needs an inbox.
 *
 * The newsletter form was the visible cost. Its submit handler set a success
 * message and stopped, so a visitor was told "you're in" and nothing was
 * recorded anywhere. Nobody could tell, because the section looked like it
 * worked.
 *
 * One context, set by the page that already knows the answer, empty inside
 * the builder's canvas. A section reads it and decides whether it can do the
 * thing it offers.
 */
import type { SiteLanguageChoice } from "./language-switch"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { pricingFor, type StorefrontDisplay } from "@/lib/markets/pricing"
import type { SiteCommerce } from "@/lib/website-builder/site-commerce"
import { uiWord, type UiWord } from "@/lib/markets/ui-words"
import { shopMoneyIn, SHOP_CURRENCY } from "@/lib/store/shop-money"

export interface Storefront {
  /** The creator whose site this is. Absent in the editor's canvas. */
  creatorId?: string
  /** Which theme install is being drawn, for anything scoped to one site. */
  installId?: string
  /** True while the builder is drawing, so a section does not send anything. */
  inEditor?: boolean
  /**
   * The page keys the site stores, when the surface has them. The footer's
   * policies row reads it to list a shipping page only where one exists.
   */
  pages?: string[]
  /** The page being drawn ("refund-policy"), when the surface knows it. */
  pageKey?: string
  /**
   * Website settings › Commerce: stock on product pages, the free shipping
   * banner, the cart's returns line. Filled in by ThemePage from the theme's
   * settings (lib/website-builder/site-commerce.ts), never by a page.
   */
  commerce?: SiteCommerce
  /**
   * The language this page is drawn in and the website's others, on a
   * website with more than one (Settings › Markets and languages,
   * lib/markets/live.ts). ThemePage puts it on the page's `lang` and `dir`
   * and draws the language switch under the footer.
   */
  language?: SiteLanguageChoice
  /**
   * The shop's own words in the page's language (Translate › Shop words,
   * lib/markets/ui-words.ts); empty in the website's own language.
   */
  words?: Record<string, string>
  /**
   * The visitor's market's currency, when it is not the store's (lib/markets
   * live.ts Localizer display): the cart shows its amounts converted, as the
   * product cards are, and says what checkout charges in.
   */
  display?: StorefrontDisplay
  /**
   * The store's own currency (Settings › Country & Currency,
   * lib/store/selling-currency): what its prices are in and checkout charges.
   * Absent, the platform's, which is what every store sold in before.
   */
  currency?: string
}

const StorefrontContext = createContext<Storefront>({})

export function StorefrontProvider({ value, children }: { value: Storefront; children: ReactNode }) {
  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
}

export function useStorefront(): Storefront {
  return useContext(StorefrontContext)
}

/** A word the shop draws itself, in the page's language (lib/markets/ui-words.ts). */
export function useWord(): (word: UiWord) => string {
  const words = useContext(StorefrontContext).words
  return (word) => uiWord(words, word)
}

/** The store's price as written on its website ("$48.00", "RON 48.00"), the shape every Storelib theme's cart used (lib/store/shop-money.ts). */
const ownMoneyIn = (currency: string) => (cents: number) => shopMoneyIn(cents, currency)

/**
 * An amount of the cart in the visitor's market's currency when the page
 * shows one ("44,50 €"), else the store's own. Display only: checkout
 * charges the store's prices, and useChargeNote says so.
 */
export function useMoney(): (cents: number) => string {
  const { display, currency } = useContext(StorefrontContext)
  return useMemo(() => {
    const ownMoney = ownMoneyIn(currency ?? SHOP_CURRENCY)
    const pricing = display ? pricingFor(display.market, display.base, display.fx) : null
    if (!pricing || !display) return ownMoney
    return (cents: number) => pricing.format(cents, display.locale) ?? ownMoney(cents)
  }, [display, currency])
}

/** What checkout charges in, when the cart shows another currency; null otherwise. */
export function useChargeNote(): string | null {
  return useContext(StorefrontContext).display?.note ?? null
}
