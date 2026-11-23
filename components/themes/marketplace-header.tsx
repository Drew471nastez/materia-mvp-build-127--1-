"use client"

/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S ONE BAR (marketplace round 23)
 * ===========================================================================
 * The owner: "no double header, keep one: the Storelib theme marketplace
 * header". The site's own header is not drawn on any page under /themes
 * (components/marketing/conditional-header.tsx, isThemeStore), so this is
 * the only bar: the purple Storelib logo and the marketplace's name on the
 * left; on the right, for somebody signed in, Dashboard, the bell and their
 * photo (the same bell and the same account menu and sheet as the site's
 * header, so the rows, the unread count and Log out behave the same), and
 * for anybody else Sign in and Get started.
 *
 * WHO IS SIGNED IN is read from the header's own snapshot (lib/auth/
 * auth-snapshot), synchronously, in a layout effect, so the frame that
 * first shows the right side already shows the right one. The pages are
 * the same for everybody and held at the edge, so the server cannot know:
 * until the browser has said, the right side is there at its height but
 * clear, and it fades in once. Nothing on the left moves.
 *
 * In the iPhone and Android apps the site's header made the room under the
 * status bar; this bar makes its own (env(safe-area-inset-top), zero in a
 * browser).
 */
import * as React from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { AppAvatar } from "@/components/app/app-avatar"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { AccountSheet, DesktopAccountMenu, endStorelibSession, type HeaderLink } from "@/components/platform/platform-header-client"
import { readAuthSnapshot, subscribeAuthSnapshot, type AuthSnapshot } from "@/lib/auth/auth-snapshot"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { MARKETPLACE_PATH } from "@/lib/themes/marketplace-shared"
import { MARKET_CONTAINER } from "@/components/themes/marketplace-shell"

const LanguageModal = dynamic(() => import("@/components/platform/language-modal").then((m) => m.LanguageModal), { ssr: false })

/** Paths inside storelib.com: this bar is only ever on Storelib's own domain. */
const link: HeaderLink = (path) => ({ href: path, onClick: () => {} })

const ICON_BUTTON = "text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] h-10 w-10"
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2"

export function MarketplaceHeader() {
  return (
    <header data-market-header="" className="relative z-30 bg-white pt-[env(safe-area-inset-top)]">
      <div className={cn(MARKET_CONTAINER, "flex h-16 items-center justify-between gap-3 sm:h-[72px]")}>
        <Link href={MARKETPLACE_PATH} data-market-bar="" className={cn("-ml-1 inline-flex h-11 min-w-0 items-center gap-2.5 rounded-lg px-1", FOCUS)}>
          <StorelibLogo size={30} priority alt="" />
          <span className="truncate text-[17px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[18px]">
            <span className="max-sm:hidden">Storelib theme marketplace</span>
            <span className="sm:hidden">Themes</span>
          </span>
        </Link>
        <Who />
      </div>
    </header>
  )
}

function useSnapshot(): AuthSnapshot | null | undefined {
  /* undefined until the browser has said; null is nobody. */
  const [who, setWho] = React.useState<AuthSnapshot | null | undefined>(undefined)
  React.useLayoutEffect(() => {
    const read = () => setWho(readAuthSnapshot())
    read()
    return subscribeAuthSnapshot(read)
  }, [])
  return who
}

function Who() {
  const who = useSnapshot()
  const known = who !== undefined
  const me = who?.signedIn ? who : null
  return (
    <div
      data-market-who={!known ? "unknown" : me ? "signed-in" : "guest"}
      aria-hidden={!known || undefined}
      className={cn("flex shrink-0 items-center transition-opacity duration-200 ease-out motion-reduce:transition-none", known ? "opacity-100" : "pointer-events-none opacity-0")}
    >
      {me ? <SignedIn me={me} /> : <Guest />}
    </div>
  )
}

function Guest() {
  return (
    <div className="flex items-center gap-1 sm:gap-2" data-market-guest="">
      <Link href="/login" prefetch={false} className={cn("inline-flex h-10 items-center rounded-lg px-3 text-[15px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f1f2f4]", FOCUS)}>
        Sign in
      </Link>
      <Link
        href="/signup"
        prefetch={false}
        className={cn("inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-[#1a1a2e] px-4 text-[15px] font-medium text-white transition-colors hover:bg-[#2d2d44]", FOCUS)}
      >
        Get started
      </Link>
    </div>
  )
}

function SignedIn({ me }: { me: AuthSnapshot }) {
  const router = useRouter()
  const [sheet, setSheet] = React.useState(false)
  const [language, setLanguage] = React.useState(false)
  const [languageAsked, setLanguageAsked] = React.useState(false)
  const avatarUrl = useShellAvatar(me.avatarUrl, me.userId ?? undefined) || undefined
  const name = me.displayName?.trim() || me.username || "You"
  const logOut = React.useCallback(async () => {
    setSheet(false)
    await endStorelibSession(router)
  }, [router])
  const openLanguage = () => {
    setLanguageAsked(true)
    setLanguage(true)
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2" data-market-signed-in="">
      <Link
        href="/app"
        data-market-dashboard=""
        className={cn("mr-1 inline-flex h-10 items-center rounded-lg px-3 text-[15px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f1f2f4]", FOCUS)}
      >
        Dashboard
      </Link>
      <NotificationBell className={ICON_BUTTON} />
      <div className="ml-1 hidden md:block">
        <DesktopAccountMenu
          avatarUrl={avatarUrl}
          name={name}
          username={me.username}
          seller={me.isSeller}
          link={link}
          onLanguage={openLanguage}
          onLogout={() => void logOut()}
          avatarSize={36}
        />
      </div>
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label="Your account"
        aria-haspopup="dialog"
        aria-expanded={sheet}
        data-header-avatar=""
        className="ml-0.5 grid h-10 w-10 place-items-center rounded-full outline-none [-webkit-tap-highlight-color:transparent] active:opacity-80 md:hidden"
      >
        <AppAvatar src={avatarUrl} name={name} alt="" size={34} className="ring-1 ring-[rgba(16,18,27,0.1)]" />
      </button>
      <AccountSheet
        open={sheet}
        onClose={() => setSheet(false)}
        keepMounted
        avatarUrl={avatarUrl}
        name={name}
        username={me.username}
        seller={me.isSeller}
        link={link}
        onLanguage={() => {
          setSheet(false)
          window.setTimeout(openLanguage, 200)
        }}
        onLogout={() => void logOut()}
      />
      {languageAsked ? <LanguageModal open={language} onOpenChange={setLanguage} /> : null}
    </div>
  )
}
