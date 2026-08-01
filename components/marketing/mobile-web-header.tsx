"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Heart, Menu, MessageCircle, ShoppingBag } from "lucide-react"
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

export function MobileWebHeader() {
  const router = useRouter()
  const { t } = useLocale()

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
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user ?? null
      if (!alive) return

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
    await supabase.auth.signOut()
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

  return (
    <>
      <header className="web-only-header sticky top-0 z-[55] border-b border-neutral-200 bg-white md:hidden">
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
              className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
            >
              <Menu className="h-[23px] w-[23px]" strokeWidth={2.2} />
            </button>

            <Link href="/" className="shrink-0" aria-label="Storelib">
              {wordmark}
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {auth.signedIn ? (
                <>
                  <Link
                    href="/messages"
                    aria-label="Mesaje"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
                  >
                    <MessageCircle className="h-[22px] w-[22px]" />
                  </Link>
                  <Link
                    href="/wishlist"
                    aria-label="Favorite"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
                  >
                    <Heart className="h-[22px] w-[22px]" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setAccountOpen(true)}
                    aria-label="Contul meu"
                    aria-haspopup="dialog"
                    aria-expanded={accountOpen}
                    className="ml-0.5 flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-[0.97]"
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
                    className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
                  >
                    <ShoppingBag className="h-[22px] w-[22px]" />
                  </Link>
                  <Link
                    href="/signup"
                    className="ml-1 flex h-9 items-center rounded-full bg-[#7c3aed] px-4 text-[13.5px] font-semibold text-white transition-transform active:scale-[0.97]"
                  >
                    Înregistrează-te
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Search only. The category pill rail is deliberately not here — it is
              the app's answer to having no address bar and no header, and under a
              header that already carries a menu of categories it is the same list
              twice. */}
          <div className="flex px-3 pb-3">
            <SearchTrigger onOpen={() => setSearchOpen(true)} />
          </div>
        </div>
      </header>

      <SideDrawer open={menuOpen} onClose={closeMenu} side="left" label="Meniu" header={wordmark}>
        {!auth.signedIn && (
          <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
            <Link
              href="/signup"
              onClick={closeMenu}
              data-drawer-autofocus
              className="flex h-12 items-center justify-center rounded-full bg-[#7c3aed] text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
            >
              Vinde acum
            </Link>
            <Link
              href="/signup"
              onClick={closeMenu}
              className="flex h-12 items-center justify-center rounded-full border border-neutral-900 text-[15px] font-semibold text-neutral-900 transition-transform active:scale-[0.97]"
            >
              Înregistrează-te
            </Link>
            <Link
              href="/login"
              onClick={closeMenu}
              className="flex h-12 items-center justify-center rounded-full text-[15px] font-semibold text-neutral-700 transition-[background-color,transform] duration-150 active:scale-[0.97] active:bg-neutral-100"
            >
              Autentificare
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
