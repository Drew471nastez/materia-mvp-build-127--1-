"use client"

/**
 * ===========================================================================
 *  THE ACCOUNT MENU IN A COMMUNITY'S BAR: STORELIB'S OWN, BEHIND A "..."
 * ===========================================================================
 * Round 7: the picture with a chevron (and its own short menu, whose "My
 * profile" opened the creator's OnePage editor for a creator) is replaced by
 * a quiet "..." button that opens EXACTLY the menu the Storelib header opens
 * from the photo: the same component (DesktopAccountMenu) on a computer and
 * the same sheet (AccountSheet) on a phone, both from components/platform/
 * platform-header-client.tsx. Dashboard or Start creating, Profile (always
 * /account), Settings, Language, Help, Discover, and Log out last, which ends
 * the session the same way the header does (endStorelibSession).
 *
 * The button: 40px, squared at 10px, the faintest grey ground, a hairline
 * and a one pixel shadow (DEPTH_ICON_BTN), so it reads as a control without
 * being a pill.
 */
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { LanguageModal } from "@/components/platform/language-modal"
import { AccountSheet, DesktopAccountMenu, endStorelibSession, type HeaderLink } from "@/components/platform/platform-header-client"
import { cn } from "@/lib/utils"
import { DEPTH_ICON_BTN } from "./ui"
import type { TopBarData } from "./view-types"

/** Paths inside storelib.com: a community is always on the main address, so a link is just its path. */
const link: HeaderLink = (path) => ({ href: path, onClick: () => {} })

export function CommunityAccountMenu({ me, className }: { me: NonNullable<TopBarData["me"]>; className?: string }) {
  const router = useRouter()
  const [sheet, setSheet] = useState(false)
  const [language, setLanguage] = useState(false)
  const logOut = useCallback(async () => {
    setSheet(false)
    await endStorelibSession(router)
  }, [router])
  const seller = !!me.seller
  return (
    <div className={cn("flex shrink-0 items-center", className)} data-community-account="">
      {/* A computer: the header's own dropdown, opened by "..." instead of the photo. */}
      <div className="hidden md:block">
        <DesktopAccountMenu
          avatarUrl={me.avatarUrl ?? undefined}
          name={me.name}
          username={me.username ?? null}
          seller={seller}
          link={link}
          onLanguage={() => setLanguage(true)}
          onLogout={() => void logOut()}
          trigger="more"
          triggerClassName={cn(DEPTH_ICON_BTN, "data-[state=open]:bg-[#eef0f2] data-[state=open]:text-[#1a1a2e]")}
        />
      </div>
      {/* A phone: the same "..." opens the header's account sheet. */}
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label="Your account"
        aria-haspopup="dialog"
        aria-expanded={sheet}
        data-account-more=""
        data-state={sheet ? "open" : "closed"}
        className={cn(DEPTH_ICON_BTN, "md:hidden", sheet && "bg-[#eef0f2] text-[#1a1a2e]")}
      >
        <MoreHorizontal aria-hidden className="h-5 w-5" strokeWidth={2} />
      </button>
      <AccountSheet
        open={sheet}
        onClose={() => setSheet(false)}
        avatarUrl={me.avatarUrl ?? undefined}
        name={me.name}
        username={me.username ?? null}
        seller={seller}
        link={link}
        onLanguage={() => setLanguage(true)}
        onLogout={() => void logOut()}
      />
      <LanguageModal open={language} onOpenChange={setLanguage} />
    </div>
  )
}
