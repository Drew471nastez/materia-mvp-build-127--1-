"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Heart, Menu, MessageCircle, Search, ShoppingBag } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
import { SearchTrigger } from "@/components/marketplace/search-row"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { useLocale } from "@/components/locale-provider"
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { nativeLogOut } from "@/lib/native-bridge"
import { AccountDrawer } from "./account-drawer"
import { DrawerRow, DrawerSectionTitle, SideDrawer } from "./side-drawer"

/**
 * The header a mobile BROWSER gets.
 *
 * Inside the iOS/Android shell the site correctly has no header at all — the app
 * has a status bar, a search strip and a tab bar of its own, and a second row of
 * site chrome on top of that makes it read as a website in a box. On a phone
 * browser none of that is true: there is no tab bar, the only way around is
 * whatever the page provides, and a marketplace with no header is a page you can
 * only leave by going back.
 *
 * Which of the two you get is decided in CSS, not here — see the
 * `.web-only-header` / `.native-only-topbar` pair in app/globals.css. The class
 * that drives it is on <html> before the first paint, whereas isNativeApp() can
 * only be answered after hydration; branching on it in render would mean one
 * painted frame of the wrong chrome on every single load.
 */

// The same mark the platform header uses. Duplicated rather than imported
// because that module is a 2000-line client component and this header must not
// pull it into the mobile bundle.
const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"

type HeaderAuth = {
  signedIn: boolean
  avatarUrl: string | null
  displayName: string | null
  username: string | null
}

const SIGNED_OUT: HeaderAuth = { signedIn: false, avatarUrl: null, displayName: null, username: null }

// Categories always resolve on the feed — that is where results live. "all" is
// the unfiltered feed itself, so it goes to the bare route rather than carrying
// a filter that means "no filter".
function categoryHref(id: string): string {
  return id === "all" ? "/" : `/?category=${id}`
}

/**
 * Routes that are not a place you browse, so the search row collapses to an
 * icon on them.
 *
 * A field reading "Caută articole" is furniture from another room over your
 * messages, your account or your orders — and on a conversation it is not just
 * out of place, it is expensive. That screen sizes itself to the visible
 * viewport and starts below this header, so every pixel the header spends is a
 * pixel the messages do not get; with a keyboard open the row was costing about
 * half of what was left.
 *
 * The header itself stays. On a phone browser there is no tab bar, so it is the
 * only way off the page — which is exactly why the native app can drop this
 * chrome entirely on the same routes (see global-mobile-topbar.tsx, which calls
 * this same set "pages with no chrome of their own") and the web cannot. The
 * search does not disappear either; it moves into the row above as an icon,
 * opening the same overlay.
 */
function isCompactHeader(pathname: string): boolean {
  return (
    pathname.startsWith("/messages") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/purchases") ||
    pathname.startsWith("/sales")
  )
}

/**
 * THE ROUND ICON BUTTONS IN THIS BAR, AND WHY NONE OF THEM SCALES.
 *
 * Every one of them was `transition-transform active:scale-[0.97]`, and that is
 * the bump. Three percent of a 44px button is a pixel and a third — too small to
 * read as a deliberate movement and too large to be nothing, so what it looks
 * like is the icon wobbling. It is also the wrong shape of feedback for a
 * TARGET: the hit area is 44px, the glyph inside it is 23, and shrinking the
 * whole box means the thing that moves is mostly empty space around a mark that
 * barely moves at all.
 *
 * Worse, it is driven by `:active`, which the browser sets when it has decided
 * the touch is a press and clears on its own schedule — so on a scroll that
 * starts over a button the scale flickers on and off under a finger that was
 * never pressing anything.
 *
 * A tint has none of those problems. It fills the target rather than resizing
 * it, so the 44px circle is what lights up; it arrives instantly
 * (`active:duration-0`) and fades out over 200ms, which is the asymmetry a
 * physical button has; and a colour that is briefly wrong is invisible next to a
 * shape that is briefly the wrong size. It is the same rule the profile's pinned
 * bar and the manage sheet's rows already state, and this bar was the last place
 * still doing it the other way.
 *
 * The pills get the same treatment for the same reason — see below.
 */
const PRESS =
  "[-webkit-tap-highlight-color:transparent] touch-manipulation " +
  "transition-colors duration-200 ease-out active:duration-0"

const ICON_BTN =
  `flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 ${PRESS} active:bg-neutral-100`

/**
 * THE PILLS, WHICH HAD THE SAME BUMP AND NEEDED A DIFFERENT ANSWER.
 *
 * Leaving these on `active:scale-[0.97]` while the six icons beside them moved
 * to a tint would have been worse than the bump: one row, two grammars, and the
 * signup pill sitting immediately next to a cart icon that now behaves
 * differently. A press treatment is a rule about the surface, not about one
 * control.
 *
 * A filled pill cannot borrow the icons' `active:bg-neutral-100` — grey over
 * brand purple is a different button, not a pressed one. It darkens to #6d28d9
 * instead, which is not a new colour: it is the last stop of the gradient the
 * app already paints the sell button with, so the pressed state is a shade the
 * product already owns.
 */
const PILL_FILLED = `flex items-center rounded-full bg-[#7c3aed] font-semibold text-white ${PRESS} active:bg-[#6d28d9]`
const PILL_QUIET = `flex items-center rounded-full font-semibold ${PRESS} active:bg-neutral-100`

export function MobileWebHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useLocale()
  const compact = isCompactHeader(pathname ?? "")

  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Seeded synchronously from the persisted snapshot so the header draws the
  // RIGHT header on its first paint. Waiting on the network here is what used to
  // put a skeleton above every page and flick a signed-in visitor through the
  // logged-out header on the way to their avatar; that bug is not coming back.
  const [auth, setAuth] = useState<HeaderAuth>(() => {
    const snapshot = readAuthSnapshot()
    if (!snapshot?.signedIn) return SIGNED_OUT
    return {
      signedIn: true,
      avatarUrl: snapshot.avatarUrl,
      displayName: snapshot.displayName,
      username: snapshot.username,
    }
  })

  useEffect(() => {
    const supabase = createClient()
    let alive = true

    const sync = async () => {
      // getSession() reads the stored session locally; getUser() posts to
      // Supabase to re-validate the JWT. This runs only to decide which icons to
      // draw, and everything that matters is authorised server-side anyway, so
      // it takes the local read and keeps the network off the first paint.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const user = sessionData.session?.user ?? null
      if (!alive) return

      // A session we failed to read is not a session that is absent. Falling
      // through to the signed-out header on an error would drop the snapshot
      // that draws the right header on the next load, so a transient auth
      // failure would present as having been logged out. Keep what we have.
      if (sessionError) return

      if (!user) {
        clearAuthSnapshot()
        setAuth(SIGNED_OUT)
        return
      }

      const snapshot = readAuthSnapshot()
      if (snapshot?.signedIn && snapshot.userId === user.id) {
        // The snapshot already describes this exact user, so there is nothing
        // here worth a query — it was seeded into state before the first paint.
        setAuth({
          signedIn: true,
          avatarUrl: snapshot.avatarUrl,
          displayName: snapshot.displayName,
          username: snapshot.username,
        })
        return
      }

      // profiles.avatar_url is the single source of truth for the avatar; the
      // OAuth picture is only a fallback for an account that never set one.
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, username")
        .eq("id", user.id)
        .single()
      if (!alive) return

      const meta = user.user_metadata as Record<string, unknown> | undefined
      const avatarUrl =
        (profile?.avatar_url as string | null) ||
        (meta?.avatar_url as string | undefined) ||
        (meta?.picture as string | undefined) ||
        null

      setAuth({
        signedIn: true,
        avatarUrl,
        displayName: profile?.display_name ?? null,
        username: profile?.username ?? null,
      })
      writeAuthSnapshot({
        signedIn: true,
        userId: user.id,
        avatarUrl,
        displayName: profile?.display_name ?? null,
        username: profile?.username ?? null,
        // Seller status is not something this header ever asks about, so it is
        // carried over rather than guessed. Writing false here would demote a
        // seller in every other surface that reads the same snapshot.
        isSeller: snapshot?.userId === user.id ? !!snapshot?.isSeller : false,
      })
    }

    void sync()

    const { data } = supabase.auth.onAuthStateChange((event: string) => {
      // Clear the moment we sign out, so a reload can't briefly show the
      // previous user's avatar before the session check catches up.
      if (event === "SIGNED_OUT") clearAuthSnapshot()
      void sync()
    })

    return () => {
      alive = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    setAccountOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    clearAuthSnapshot()
    if (isNativePlatform()) {
      nativeLogOut()
      return
    }
    router.push("/")
    router.refresh()
  }, [router])

  const onSelectCategory = useCallback(
    (id: string) => {
      router.push(categoryHref(id))
    },
    [router],
  )

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeAccount = useCallback(() => setAccountOpen(false), [])

  const wordmark = (
    <span className="flex items-center gap-1.5">
      <Image
        src={LOGO_URL}
        alt=""
        width={102}
        height={34}
        className="h-[34px] w-auto rounded-[7px]"
        priority
      />
      <span className="text-[19px] font-bold tracking-tight text-neutral-900">Storelib</span>
    </span>
  )

  // Publish this header's real height, so anything that has to start below it
  // measures rather than guesses.
  //
  // The home feed is the reason: it is `fixed inset-0`, because inside the app
  // it IS the screen — and on the web that painted straight over this header,
  // leaving the one route people land on with no navigation out of it. It reads
  // --web-header-h to inset itself instead. A hard-coded number would be wrong
  // the moment the safe-area inset changes, the search row wraps, or the logo
  // font loads, so it is observed rather than written down twice.
  const headerRef = useRef<HTMLElement>(null)
  /**
   * Read the header and write its height to the root, forcing layout on the way.
   *
   * `getBoundingClientRect()` is what makes this correct rather than merely
   * early: called inside a layout effect it flushes pending style and layout, so
   * it returns the height the header has AFTER the commit that just happened
   * rather than the one it had before.
   */
  const publishHeaderHeight = useCallback(() => {
    const el = headerRef.current
    if (!el) return
    document.documentElement.style.setProperty(
      "--web-header-h",
      `${Math.round(el.getBoundingClientRect().height)}px`,
    )
  }, [])

  /**
   * A LAYOUT effect, and that is the whole of a layout shift on every
   * navigation.
   *
   * This was a passive `useEffect`, which runs AFTER the browser paints. So the
   * first painted frame of every route change had no `--web-header-h` published
   * yet — and `.thread-shell` positions itself with
   * `top: var(--web-header-h, 0px)`. It therefore painted at the very top of
   * the screen, covering this header, and then jumped down by the header's full
   * height the moment this effect finally ran.
   *
   * That is the "shifting layout" when opening a conversation and coming back:
   * not an animation, not a transition — a fixed element positioned from a
   * variable that did not exist yet, corrected one frame later. On a slow
   * commit it is a visible drop of ~150px.
   *
   * A layout effect runs after the DOM is in place and BEFORE paint, so the
   * variable is published for the first frame and nothing has to move.
   */
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    publishHeaderHeight()
    const observer = new ResizeObserver(publishHeaderHeight)
    observer.observe(el)
    return () => {
      observer.disconnect()
      // Zeroed rather than REMOVED, and the difference matters on a remount.
      //
      // Removing it makes every reader fall back to its own default, and those
      // defaults are written as `0px` — so the value is the same either way.
      // What is not the same is that an explicit `0px` is one style write,
      // while a removal invalidates the custom-property inheritance for the
      // whole document and forces a full recalculation on a frame that is
      // already busy committing a route.
      //
      // Leaving a stale height behind would inset a feed that no longer has a
      // header above it — inside the app, that is the whole screen misplaced —
      // so it is set to zero, not left alone.
      document.documentElement.style.setProperty("--web-header-h", "0px")
    }
  }, [publishHeaderHeight])

  /**
   * ===========================================================================
   *  THE BUMP BETWEEN THE PROFILE AND THE HOME PAGE
   * ===========================================================================
   * This header is not one height. `isCompactHeader` drops the search row on
   * /profile, /settings, /messages and the order pages, so crossing between your
   * account and the feed changes it by a whole row — about 56px. And the feed is
   * `position: fixed` with `top: var(--web-header-h)`, so that number is not
   * decoration: it is where the home screen starts.
   *
   * The effect above publishes it, and it runs ONCE. On a route change the
   * header re-renders taller or shorter without remounting, so nothing above
   * re-ran — the only thing left to notice was the ResizeObserver, which fires
   * from the browser's own rendering steps rather than from the commit that
   * caused the change. The value was therefore right in the end and wrong at the
   * moment it mattered, and the feed arrived inset by the height of the header
   * you had just LEFT before settling onto the height of the one you are looking
   * at. That is the little bump on the way to Acasă, and it plays in reverse on
   * the way back.
   *
   * So the height is republished from the commit that reshapes the header,
   * synchronously, before the browser paints the arriving route. `compact` is
   * the whole of what can change it between routes — the icon row is a fixed
   * `h-14` and the safe-area inset does not move — so this fires exactly when
   * the geometry actually changes and not on every navigation.
   *
   * The observer stays for everything a render cannot predict: the logo's font
   * landing, an orientation change, the safe-area inset changing on a
   * standalone install.
   */
  useLayoutEffect(() => {
    publishHeaderHeight()
  }, [compact, publishHeaderHeight])

  return (
    <>
      <header
        ref={headerRef}
        className="web-only-header sticky top-0 z-[55] border-b border-neutral-200 bg-white md:hidden"
      >
        {/* Padded rather than offset so the white surface runs up under the
            status bar on an installed/standalone browser instead of leaving a
            strip of page showing above it. */}
        <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex h-14 items-center gap-1 px-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Meniu"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className={`-ml-1 shrink-0 ${ICON_BTN}`}
            >
              <Menu className="h-[23px] w-[23px]" strokeWidth={2.2} />
            </button>

            <Link href="/" className="shrink-0" aria-label="Storelib">
              {wordmark}
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {/* Search, where the row below would have been. Same overlay, same
                  handler — only the affordance changes. */}
              {compact && (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Caută"
                  className={ICON_BTN}
                >
                  <Search className="h-[22px] w-[22px]" strokeWidth={2.1} />
                </button>
              )}
              {auth.signedIn ? (
                <>
                  <Link
                    href="/messages"
                    aria-label="Mesaje"
                    className={ICON_BTN}
                  >
                    <MessageCircle className="h-[22px] w-[22px]" />
                  </Link>
                  <Link
                    href="/wishlist"
                    aria-label="Favorite"
                    className={ICON_BTN}
                  >
                    <Heart className="h-[22px] w-[22px]" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setAccountOpen(true)}
                    aria-label="Contul meu"
                    aria-haspopup="dialog"
                    aria-expanded={accountOpen}
                    className={`ml-0.5 ${ICON_BTN}`}
                  >
                    <Avatar className="h-9 w-9 border border-neutral-200">
                      <AvatarImage src={auth.avatarUrl || undefined} alt="" />
                      <AvatarFallback className="bg-neutral-100 text-[13px] font-semibold text-neutral-500">
                        {(auth.displayName || auth.username || "?").trim().charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/cart"
                    aria-label="Coș"
                    className={ICON_BTN}
                  >
                    <ShoppingBag className="h-[22px] w-[22px]" />
                  </Link>
                  <Link
                    href="/signup"
                    className={`ml-1 px-4 text-[13.5px] ${PILL_FILLED}`}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Search only. The category pill rail is deliberately not here — it is
              the app's answer to having no address bar and no header, and under a
              header that already carries a menu of categories it is the same list
              twice.

              Dropped entirely on the routes isCompactHeader names, where it has
              moved into the row above as an icon. The ResizeObserver on the
              header republishes --web-header-h when this goes, so the
              conversation below it re-pins itself to the new height rather than
              leaving a gap where the row used to be. */}
          {!compact && (
            <div className="flex px-3 pb-3">
              <SearchTrigger onOpen={() => setSearchOpen(true)} />
            </div>
          )}
        </div>
      </header>

      <SideDrawer open={menuOpen} onClose={closeMenu} side="left" label="Meniu" header={wordmark}>
        {!auth.signedIn && (
          <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
            <Link
              href="/signup"
              onClick={closeMenu}
              data-drawer-autofocus
              className={`h-12 justify-center text-[15px] ${PILL_FILLED}`}
            >
              Vinde
            </Link>
            <Link
              href="/signup"
              onClick={closeMenu}
              className={`h-12 justify-center border border-neutral-900 text-[15px] text-neutral-900 ${PILL_QUIET}`}
            >
              Înregistrează-te
            </Link>
            <Link
              href="/login"
              onClick={closeMenu}
              className={`h-12 justify-center text-[15px] text-neutral-700 ${PILL_QUIET}`}
            >
              Log in
            </Link>
          </div>
        )}

        <DrawerSectionTitle>Categorii</DrawerSectionTitle>
        <div className="pb-2">
          {CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <DrawerRow
                key={category.id}
                href={categoryHref(category.id)}
                label={t(`category.${category.id}`)}
                icon={<Icon className="h-[18px] w-[18px]" />}
                onNavigate={closeMenu}
              />
            )
          })}
        </div>

        {auth.signedIn && (
          <div className="border-t border-neutral-100 pb-6 pt-1">
            <DrawerRow href="/profile" label="Profilul meu" onNavigate={closeMenu} />
          </div>
        )}
      </SideDrawer>

      <AccountDrawer
        open={accountOpen}
        onClose={closeAccount}
        avatarUrl={auth.avatarUrl}
        displayName={auth.displayName}
        username={auth.username}
        onSignOut={handleSignOut}
      />

      {/* Kept outside <header> on purpose: the header owns a stacking context
          (sticky + z-index), and the overlay is a full-screen fixed layer that
          has to sit above the bottom nav rather than be trapped underneath the
          header's own z-index. */}
      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectCategory={onSelectCategory}
        initialQuery=""
      />
    </>
  )
}
