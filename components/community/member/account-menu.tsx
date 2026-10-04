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
 * Round 9: the button is FLAT (FLAT_ICON_BTN): no ground, no hairline, no
 * shadow, a soft tint under a pointer and while open. And the menu carries
 * the community's own two rows above Storelib's, "Invite people" (the
 * invite sheet, which used to be a button on the card and at the end of the
 * tabs) and "Saved posts" (which used to be a chip beside the sort button),
 * through the menu's `extra` rows, so it is still that one menu.
 */
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { Bookmark, MoreHorizontal, UserPlus } from "lucide-react"
import { LanguageModal } from "@/components/platform/language-modal"
import { SHEET_CLOSE_MS } from "@/components/ui/bottom-sheet"
import { AccountSheet, DesktopAccountMenu, endStorelibSession, type AccountExtraRow, type HeaderLink } from "@/components/platform/platform-header-client"
import { cn } from "@/lib/utils"
import { FLAT_ICON_BTN } from "./ui"
import type { TopBarData } from "./view-types"

/** Paths inside storelib.com: a community is always on the main address, so a link is just its path. */
const link: HeaderLink = (path) => ({ href: path, onClick: () => {} })

/**
 * On a phone the invite sheet rises once the account sheet is most of the
 * way down (components/ui/bottom-sheet.tsx SHEET_CLOSE_MS), so the two
 * never stack and the hand over still reads as one motion.
 */
const SHEET_HANDOFF_MS = Math.round(SHEET_CLOSE_MS * 0.6)

export interface CommunityMenuRows {
  /** Opens the invite sheet; left out where nobody may invite (an archived community). */
  onInvite?: (() => void) | null
  /** The member's saved posts in this community; left out for somebody who is not a member. */
  savedHref?: string | null
}

export function CommunityAccountMenu({ me, className, onInvite = null, savedHref = null }: { me: NonNullable<TopBarData["me"]>; className?: string } & CommunityMenuRows) {
  const router = useRouter()
  const [sheet, setSheet] = useState(false)
  const [language, setLanguage] = useState(false)
  const logOut = useCallback(async () => {
    setSheet(false)
    await endStorelibSession(router)
  }, [router])
  const seller = !!me.seller
  /* The community's rows: on a computer the menu closes and the dialog opens; on a phone the sheet goes first. */
  const rows = useCallback(
    (phone: boolean): AccountExtraRow[] => {
      const out: AccountExtraRow[] = []
      if (onInvite) out.push({ item: "invite", label: "Invite people", icon: UserPlus, onSelect: phone ? () => window.setTimeout(onInvite, SHEET_HANDOFF_MS) : onInvite })
      if (savedHref) out.push({ item: "saved", label: "Saved posts", icon: Bookmark, href: savedHref })
      return out
    },
    [onInvite, savedHref],
  )
  const desktopRows = useMemo(() => rows(false), [rows])
  const phoneRows = useMemo(() => rows(true), [rows])
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
          triggerClassName={FLAT_ICON_BTN}
          extra={desktopRows}
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
        className={cn(FLAT_ICON_BTN, "md:hidden")}
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
        extra={phoneRows}
      />
      <LanguageModal open={language} onOpenChange={setLanguage} />
    </div>
  )
}
