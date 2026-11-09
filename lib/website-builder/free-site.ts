/**
 * ===========================================================================
 *  A FREE SITE: THE HOST DRAWS NONE OF THE DEFAULT THEME'S UI (round N)
 * ===========================================================================
 * The owner: "It needs to be fully free, not limited by the theme's design
 * choices: cart drawer, footer, currency and language selectors, search
 * modals, layouts."
 *
 * A free site is one whose chrome is its own: site_chrome "home"
 * (lib/website-builder/universal-chrome.ts), written when a website is
 * started from nothing (lib/website-builder/create-website.ts, chrome
 * "none"), which is how Start with AI and the agent make one. Its header,
 * footer, cart, search and switches are the site's own code.
 *
 * Besides the header and footer (universal-chrome.ts), the page drew UI of
 * the default theme on EVERY site, whatever its code said:
 *
 *   breadcrumbs       a bar under the header on every page but home, ON
 *                     unless a setting turned it off (theme-breadcrumbs.ts)
 *   language switch   two pill selects under the footer whenever the site
 *                     has more than one language or currency
 *                     (theme/language-switch.tsx)
 *   announcement bar, free shipping bar, intro screen
 *                     off unless a setting turns them on
 *   cart drawer, search window, menu drawer
 *                     only when a section asks (site-chrome-hooks.tsx)
 *
 * The rule for a free site, in one place: the host draws a piece of the
 * default theme's UI only when someone asked for it EXPLICITLY. A setting
 * that is on by default is off here; a setting someone turned on stays on
 * (the creator chose it in Theme settings); a drawer or window opens only for
 * a hook in the site's code, and is the built-in one only when the code has
 * no panel of its own (storefront-hooks.ts). Nothing here changes a site
 * that is not free: every value below is `true` for one, and each piece
 * keeps reading its own setting as before.
 *
 * KEPT ON EVERY SITE, free or not, because they are not design:
 *   - the cookie card (app/(site)/layout.tsx CookieConsentBanner): the site
 *     loads analytics and the creator's pixels (StoreTracking) only after a
 *     visitor's consent, which the ePrivacy rules require in the EU and UK.
 *     It takes the site's own words and colours (Website settings ›
 *     Policies), and a creator can switch it off there.
 *   - checkout and its return notice ("?checkout=paid"), the missing picture
 *     guard, the stuck layer guard: behaviour, not the theme's look.
 *   - links kept in the page's language (language-switch.tsx
 *     useLocalizedLinks): behaviour, drawn as nothing.
 *
 * PURE, so the rule has a test (tests/storefront-headless-n2.test.ts).
 */
import { homeChromeOnly } from "./universal-chrome"

type Settings = Record<string, unknown> | null | undefined

/** True for a site whose chrome is its own (site_chrome "home"). */
export function isFreeSite(theme: Settings): boolean {
  return homeChromeOnly(theme)
}

/** Which pieces of the default theme's UI the host may draw on this page. Each piece still reads its own setting. */
export interface HostUi {
  announcementBar: boolean
  freeShippingBar: boolean
  introScreen: boolean
  breadcrumbs: boolean
  /** The built-in language and currency selects under the footer. */
  languageSwitch: boolean
  /** The card that offers a visitor their own language (Settings › Markets, an explicit choice there). */
  languageSuggest: boolean
}

const ALL: HostUi = { announcementBar: true, freeShippingBar: true, introScreen: true, breadcrumbs: true, languageSwitch: true, languageSuggest: true }

export function hostUi(theme: Settings): HostUi {
  if (!isFreeSite(theme)) return ALL
  const t = theme as Record<string, unknown>
  return {
    /* Off unless turned on, on every site: turned on is an explicit choice, and stays. */
    announcementBar: t.announcement_bar_enabled === true,
    freeShippingBar: t.free_shipping_bar === true,
    introScreen: t.intro_enabled === true,
    /* On unless turned off on other sites; here only when turned on. */
    breadcrumbs: t.breadcrumbs_enabled === true,
    /* No setting asks for it: the site's own data-storelib-locale-list / -currency-list is the switch. */
    languageSwitch: false,
    languageSuggest: true,
  }
}
