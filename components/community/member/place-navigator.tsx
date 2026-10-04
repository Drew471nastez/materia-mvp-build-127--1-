"use client"

/**
 * ===========================================================================
 *  THE NAVIGATOR IN THE COMMUNITY'S BAR (STAND IN)
 * ===========================================================================
 * The hamburger before the community's picture opens Storelib's one
 * navigator, the same one the Storelib header's hamburger opens:
 * components/nav/place-navigator.tsx `PlaceNavigator({ current, className })`
 * (my communities, most recently visited first, Discover communities,
 * Explore, Start creating or Dashboard). It is built alongside this bar, so
 * until it is on this branch this file stands in with the same props and a
 * working menu: the communities the bar already knows about (handed down by
 * the bar through PlaceFallbackContext), Discover communities and Explore.
 *
 * SWAP ON MERGE: once components/nav/place-navigator.tsx exists, this whole
 * file becomes the one line
 *
 *   export { PlaceNavigator } from "@/components/nav/place-navigator"
 *
 * and the bar needs no other change (PlaceFallbackContext is then unused and
 * can go with TopBarData.communities).
 */
import { createContext, useContext } from "react"
import { Compass, LayoutGrid, Menu } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { ICON_BTN } from "./ui"
import type { TopBarCommunity } from "./view-types"

/** What the bar knows that the stand in needs: the communities the person is in. */
export const PlaceFallbackContext = createContext<TopBarCommunity[]>([])

export interface PlaceNavigatorProps {
  current?: { kind: "community"; id: string } | { kind: "storelib" }
  className?: string
}

export function PlaceNavigator({ current, className = "" }: PlaceNavigatorProps) {
  const mine = useContext(PlaceFallbackContext)
  const here = current?.kind === "community" ? current.id : null
  const items: ActionMenuItem[] = [
    ...mine.map((c, i) => ({
      label: c.id === here ? `${c.name} (here)` : c.name,
      href: `/community/${c.slug}`,
      icon: <AppAvatar src={c.logoUrl} name={c.name} alt="" size={20} className="rounded-[6px]" />,
      section: i === 0 ? "Your communities" : undefined,
    })),
    { label: "Discover communities", href: "/explore/communities", icon: <Compass aria-hidden />, separatorBefore: mine.length > 0 },
    { label: "Explore Storelib", href: "/explore", icon: <LayoutGrid aria-hidden /> },
  ]
  return (
    <ResponsiveActionMenu
      title="Go to"
      align="start"
      menuWidth="w-72"
      items={items}
      trigger={
        <button type="button" aria-label="Open navigation" className={`${ICON_BTN} ${className}`} data-place-navigator="">
          <Menu className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
        </button>
      }
    />
  )
}
