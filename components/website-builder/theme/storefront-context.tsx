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
import { createContext, useContext, type ReactNode } from "react"
import type { SiteCommerce } from "@/lib/website-builder/site-commerce"

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
}

const StorefrontContext = createContext<Storefront>({})

export function StorefrontProvider({ value, children }: { value: Storefront; children: ReactNode }) {
  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
}

export function useStorefront(): Storefront {
  return useContext(StorefrontContext)
}
