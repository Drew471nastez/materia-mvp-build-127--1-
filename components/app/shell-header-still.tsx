"use client"

import { Bell, ChevronDown, Compass, Search, Settings } from "lucide-react"
import { CompassIcon as ExploreIcon } from "@solar-icons/react/linear/compass"
import { avatarSource, initialsOf } from "@/components/app/app-avatar"
import { StorelibLogo } from "@/components/brand/storelib-logo"

/**
 * ===========================================================================
 *  THE BLACK BAR, STILL, WITH THE BUSINESS YOU ARE GOING TO
 * ===========================================================================
 * "The switching of the businesses, there's the black top bar there showing,
 * which I don't understand why."
 *
 * The switch screen (components/app/business-switch-screen) is drawn on the
 * shell's own frame (app/app/cold-start), and that frame's bar was empty: a
 * black band with nothing in it from the press to the new /app's first
 * frame, on both sides of the reload. This is what goes in it now: the
 * header as the new business will have it, its photo and its name, the
 * chevron, and the icons on the right, drawn at the pixels the real header
 * (components/app/sidebar.tsx, components/app/mobile-account-menu.tsx) puts
 * them. So the bar changes only by its name and photo at the press, keeps
 * them across the reload, and when the screen hands over the real header is
 * under it at the same places: nothing moves, nothing flashes.
 *
 * A picture of the header, not the header: nothing here can be pressed, and
 * it holds no state. The real one needs the app's language, its session and
 * its script, none of which a document's first HTML has. It copies the real
 * header's classes, and scripts/check-business-switch.mjs holds every piece
 * of it to the real one's box at every width, so the two cannot drift apart
 * unnoticed.
 *
 * THE PHOTO is the file the real header asks for (AppAvatar's avatarSource),
 * drawn as soon as it is there, with no fade: the menu fetched and decoded it
 * when its list opened (components/app/business-switcher), so on the page
 * you were on it is there at the press, and the new document finds it in the
 * cache. Without a photo, the initials, as the real header draws them.
 */

/** The photo size in each bar: 24px in the phone's, 28px from md, as the real header. */
export const STILL_AVATAR = { phone: 24, desktop: 28 } as const

function StillAvatar({ name, photo, size, className }: { name: string; photo: string | null; size: number; className: string }) {
  const source = avatarSource(photo, size)
  return (
    <span
      data-still="avatar"
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[#2a2a30] text-white/85 ${className}`}
      style={{ width: size, height: size }}
    >
      {source ? (
        /* decoding="sync": drawn in the same frame as the bar or not at all, never the bare circle for a frame and then the photo. It is preloaded (the menu's list, and the arrival's own <head> preload). */
        // eslint-disable-next-line @next/next/no-img-element
        <img {...source} alt="" width={size} height={size} decoding="sync" fetchPriority="high" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="font-medium leading-none" style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}

/* The phone bar's icon buttons are ghost `size="icon"` Buttons (components/ui/button): these are their classes, so the icons sit where theirs do. */
const PHONE_ICON = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/90 [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
const DESKTOP_ICON = "flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75"

export function ShellHeaderStill({ name, photo }: { name: string; photo: string | null }) {
  return (
    <div data-header-still="" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0">
      {/* The phone's bar: components/app/sidebar.tsx's mobile header, and the account trigger of mobile-account-menu. */}
      <div data-still-bar="phone" className="flex h-[68px] items-center justify-between px-4 py-[10px] md:hidden" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="relative flex-1">
          <span data-still="trigger" className="flex w-fit items-center justify-start gap-2 rounded-xl px-2 py-1.5">
            <StillAvatar name={name} photo={photo} size={STILL_AVATAR.phone} className="ring-1 ring-white/20" />
            <span data-still="name" className="max-w-[120px] truncate text-[13px] font-medium text-white/90">{name}</span>
            <ChevronDown data-still="chevron" className="h-3.5 w-3.5 text-white/50" />
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <span data-still="explore" className={PHONE_ICON}><ExploreIcon size={20} strokeWidth={1.6} /></span>
          <span data-still="bell" className={PHONE_ICON}><Bell className="h-5 w-5" /></span>
        </div>
      </div>

      {/* From md: the desktop header's bar, its account button, the search, the icons and the logo. */}
      <div data-still-bar="desktop" className="hidden pt-[env(safe-area-inset-top,_0px)] md:block">
        <div className="relative flex h-[58px] items-center px-5">
          <div className="relative shrink-0">
            <span data-still="trigger" className="flex items-center gap-2.5 rounded-full px-2.5 py-1.5">
              <StillAvatar name={name} photo={photo} size={STILL_AVATAR.desktop} className="ring-1 ring-white/20" />
              <span data-still="name" className="max-w-[140px] truncate text-[13px] font-medium text-white/90">{name}</span>
              <ChevronDown data-still="chevron" className="h-3.5 w-3.5 text-white/50" />
            </span>
          </div>
          <div className="relative flex flex-1 justify-center px-6">
            <span data-still="search" className="flex h-[36px] w-full max-w-[480px] items-center gap-2.5 rounded-full border border-white/10 bg-white/10 px-4">
              <Search className="h-4 w-4 shrink-0 text-white/50" />
              <span className="flex-1 text-left text-[13px] text-white/60">Search orders, customers, products</span>
              <span className="hidden items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-white/50 lg:flex">
                <span className="text-[10px]">&#8984;</span>K
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span data-still="compass" className={DESKTOP_ICON}><Compass className="h-[19px] w-[19px]" strokeWidth={1.5} /></span>
              <span data-still="bell" className={DESKTOP_ICON}><Bell className="h-[19px] w-[19px]" strokeWidth={1.5} /></span>
              <span data-still="settings" className={DESKTOP_ICON}><Settings className="h-[19px] w-[19px]" strokeWidth={1.5} /></span>
            </div>
            <div className="h-5 w-px bg-white/15" />
            <span data-still="logo" className="flex shrink-0 items-center gap-2.5">
              <StorelibLogo size={27} alt="" />
              <span className="text-[15px] font-semibold text-white">Storelib</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
