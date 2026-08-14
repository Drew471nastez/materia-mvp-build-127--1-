"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { MobileBottomNav } from "@/components/explore/mobile-bottom-nav"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
import { triggerHaptic } from "@/lib/native-bridge"
import { isNativeApp } from "@/lib/native-bridge"
import { isSellFormRoute } from "@/lib/marketplace/sell-route"

/**
 * The bottom navigation. ONE of them, for the whole app.
 *
 * It used to live inside MobileFeed alone, so it vanished the moment you opened
 * a listing, your settings or the sell form. On a phone — especially inside the
 * app, where there is no browser chrome to fall back on — that leaves you with
 * no way back except the OS gesture. A tab bar that disappears isn't a tab bar.
 *
 * This one was added for those routes, and the feed kept rendering its own,
 * which fixed the disappearance and left something subtler behind: THE BAR WAS
 * REBUILT every time you crossed between Acasă and anywhere else, because two
 * different React trees owned it on either side of that boundary. A brand-new
 * <nav> has no previous state to animate from, so the icon's fill — a CSS
 * transition, which needs a "from" — did not play at all on those crossings,
 * and the optimistic press state that lights a tab the instant you touch it was
 * thrown away with the component that held it. Profile to Messages eased;
 * Acasă to anything snapped. Half the taps in the app.
 *
 * So it renders here on every route including the feed, at z-[80] above the
 * feed's own z-[60] shell, mounted once in the marketing layout and never
 * unmounted. The feed reserves the height with a spacer instead of drawing a
 * second bar.
 */

/**
 * A conversation is a screen, not a tab.
 *
 * Every chat app on a phone drops its tab bar when you open a thread, and for
 * two reasons that are both visible here. It is dead furniture — you came to
 * read and to type, and the way out is the back arrow already in the header —
 * and it is in the way: the composer has to sit on the bottom edge of the
 * screen, so a bar under it is a white band between the input and the keyboard
 * that goes nowhere. Its spacer is the empty space below the composer, and the
 * bar itself is the thing that ends up wedged against an open keyboard.
 *
 * The inbox keeps it. /messages is a list you browse, and browsing is exactly
 * what tabs are for.
 */
function isConversation(pathname: string): boolean {
  return pathname.startsWith("/messages/") && pathname.length > "/messages/".length
}

/**
 * A listing is a screen with its own bottom bar.
 *
 * product-detail.tsx pins Fă o ofertă and Cumpără across the bottom at
 * z-40 on a phone — the two things the entire page exists to offer. The tab bar
 * is z-[80] and was drawn straight over them. So the primary action on the most
 * important screen in the marketplace was underneath a row of navigation, and
 * the page was ALSO paying for the tab bar's spacer on top of the padding it
 * already reserves for its own, which is a step in the layout on the way in.
 *
 * The way out of a listing is the back arrow in the photograph, which is where
 * every marketplace puts it.
 */
function isListing(pathname: string): boolean {
  return (
    pathname.startsWith("/products/") &&
    !isSellFormRoute(pathname) &&
    !pathname.startsWith("/products/drafts")
  )
}

/**
 * A form is a screen too.
 *
 * /profile/edit has its own sticky header with the way back and the way to
 * finish in it, and nothing below it is navigation — it is fields. A tab bar
 * under a form is an invitation to leave halfway through, sitting on top of the
 * last thing you were filling in.
 */
function isFullScreenForm(pathname: string): boolean {
  /**
   * /products/new IS NOT IN THIS LIST, and taking it out is what stopped the
   * flash when you open the sell sheet.
   *
   * The sheet is an intercepted route now: the screen you were on is still
   * mounted and still on screen underneath it. Hiding this bar for that path
   * therefore did not hide a bar on a page you had left — it REMOVED a bar from
   * the page you were still looking at, and the shell is a flex column, so
   * everything in it reflowed. From a profile that is the whole page jumping by
   * the height of the bar and its spacer, in the frames before the sheet has
   * risen far enough to cover it. Closing played the same jump in reverse as
   * the bar came back.
   *
   * Nothing needs hiding. The sheet is `fixed inset-0` at z-95; this bar is
   * z-80 and is simply behind it. A thing you cannot see does not need to be
   * removed, and removing it was moving the page underneath.
   */
  return pathname.startsWith("/profile/edit")
}

/** Routes where a bottom bar would be in the way. */
function suppressed(pathname: string): boolean {
  return (
    isConversation(pathname) ||
    isListing(pathname) ||
    isFullScreenForm(pathname) ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    // Seller dashboard has its own navigation entirely.
    pathname.startsWith("/app")
  )
}

/**
 * The feed is a fixed full-screen overlay that pays for the bar with a spacer of
 * its own, so the flow spacer below would be 63px of document that nothing is
 * standing in for — which is enough to make a page with nothing to scroll
 * scrollable. The bar itself still renders there; only the placeholder does not.
 */
function ownsItsOwnSpace(pathname: string): boolean {
  return pathname === "/"
}

export function GlobalMobileNav() {
  const pathname = usePathname()
  // Read after mount: Capacitor isn't on `window` during SSR, and guessing would
  // mean rendering the wrong navigation for a frame.
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [native, setNative] = useState(false)

  // Categories always resolve on the feed — that's where results live.
  const onCategory = useCallback(
    (id: string) => router.push(id === "all" ? "/" : `/?category=${id}`),
    [router],
  )

  useEffect(() => {
    setNative(isNativeApp())
  }, [])

  // In the app the tab bar is the ONLY navigation — there's no header and no
  // browser back button — so it stays up even on checkout and auth screens.
  const hideBar = native
    ? // The seller dashboard is excluded in the app as well as on the web, and
      // that was missing. It paints itself #111111 top to bottom and carries its
      // own navigation, so a white marketplace tab bar sat across the bottom of
      // it — a second, contradictory way to navigate, in the wrong colour, on
      // the one surface that is not the marketplace.
      pathname.startsWith("/explore") ||
        pathname.startsWith("/app") ||
        isConversation(pathname) ||
        // Both of these carry their own bottom bar or their own header, and in
        // the app the tab bar was drawn over it. See above.
        isListing(pathname) ||
        isFullScreenForm(pathname)
    : suppressed(pathname)
  if (hideBar) return null

  const active = isSellFormRoute(pathname)
    ? "sell"
    : pathname.startsWith("/messages")
      ? "inbox"
      : // Settings is reached FROM the profile and is still part of it, so both
        // paths light the same tab rather than dropping the highlight to Home.
        pathname.startsWith("/profile") || pathname.startsWith("/settings")
        ? "profile"
        : "home"

  return (
    <>
      {/* Reserves the bar's height so a page's last row isn't sat on. */}
      {/* Stands in for the fixed bar below, so a page's last row isn't sat on.
          It has to track the bar's real height: the tabs grew to fill their
          columns (54px plus the row's padding and the top border), and a
          spacer left behind would put every page a few pixels under it. */}
      {!ownsItsOwnSpace(pathname) && (
        // `shrink-0`, and it is not a detail — without it this spacer does not
        // exist on any page long enough to scroll.
        //
        // The marketing shell is a FLEX COLUMN, and a flex item shrinks by
        // default. On a page whose content overflows, the browser has to take
        // that overflow out of something, and a zero-content div with a stated
        // height is the cheapest thing in the column to squeeze — so it was
        // compressed away entirely and the page's last row ended up under the
        // bar. Measured in the app's own shell at 390x844: the final listing
        // sat 24px BELOW the top of the bar with no inset, and 58px below it
        // with a home indicator. With this, the clearance is +39px either way,
        // which is the grid's own bottom padding.
        //
        // It looked fine on an empty profile and broke on one with listings,
        // which is why it read as a problem with the listings.
        <div
          aria-hidden
          className="md:hidden shrink-0"
          style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 63px)" }}
        />
      )}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-[80]">
        {/* Search lights up while its overlay is open. It is the one tab that
            opens something rather than going somewhere, so nothing about the
            path can say it is the tab you are on — and a control that stays
            unlit while the thing it opened is covering the screen reads as
            never having been pressed. */}
        <MobileBottomNav active={searchOpen ? "search" : (active as any)} onSearch={() => {
          void triggerHaptic("light")
          setSearchOpen(true)
        }} />
      </div>

      {/* The overlay lives HERE, with the bar that is on every page. It had no
          handler outside the feed, so the search tab was a dead button
          everywhere else — it opened nothing at all on the sell form, messages
          or settings. One overlay owned by the bar means search behaves the same
          on every screen. */}
      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery=""
      />
    </>
  )
}
