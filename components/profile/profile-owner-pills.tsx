"use client"

/**
 * ===========================================================================
 *  YOUR OWN PROFILE, AND THE PLACES YOU GO FROM IT
 * ===========================================================================
 * Only on your own profile, where somebody else would see Follow: Activity
 * (not for a creator), Communities (while communities are on), Library and Settings
 * (lib/profile/owner-pills.ts; Edit profile is a button on the cover now),
 * as the Library's pills: white on a
 * hairline, the one you are on pressed in on a grey fill, a row that scrolls
 * sideways on a narrow phone rather than wrapping into a block.
 *
 * THE PILL ANSWERS THE PRESS. The pressed pill is chosen on the press and
 * the address catches up, the way the library's own pills do
 * (components/library/library-tabs.tsx), so a slow page never leaves the
 * old pill lit under the finger. Plain links underneath, so they work
 * before any script has loaded.
 *
 * AND SETTINGS IS ALREADY HERE WHEN IT IS PRESSED (round 11: "the settings
 * pill ... loads smoothly (prefetch, keep warm, no skeleton flash)"). It
 * was the one pill not read ahead, and Settings has no loading screen (its
 * sign in redirect has to be decided first, app/account/layout.tsx), so a
 * press waited for the whole page with the old one on screen. Now, once the
 * profile has settled, Settings (the pill's address and Edit profile's)
 * and the other pills' pages are read ahead as the device and network
 * allow (lib/nav/prefetch-policy.ts), and a finger landing on a pill reads
 * its page at once if that has not happened yet. The router keeps them warm
 * for staleTimes (next.config.mjs).
 *
 * THE FIRST TAP IS THE TAP (round 15, the owner: "the Settings pill ... I have
 * to double click on it"). A pill was a plain link, and a phone turns a touch
 * into a click only when nothing else claims it: a finger landing while the
 * page was still gliding from a flick was spent stopping the glide, and iOS
 * sent no click at all. Each pill now decides on the lift, the way Edit
 * profile and the library's pills do (lib/navigation/first-tap.ts), and a
 * mouse or the keyboard keeps the plain click.
 *
 * AND A PRESS THAT NEVER ARRIVES IS SENT AGAIN (lib/nav/stuck-navigation.ts):
 * the Library pill that spun for ten seconds and left you on the profile.
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { EDIT_PROFILE_HREF, ownerPillFor, ownerPillLinks, type OwnerPillKey } from "@/lib/profile/owner-pills"
import { prefetchHref, prefetchOnIdle } from "@/lib/nav/prefetch-policy"
import { openSettingsSubpage, settingsStaysHere, warmSettings } from "@/components/account/settings-subpage"
import { startRouteLoading } from "@/components/navigation/route-loading-bar"
import { useFirstTap } from "@/lib/navigation/first-tap"
import { watchNavigation } from "@/lib/nav/stuck-navigation"
import { cn } from "@/lib/utils"
import type { OwnerPill as OwnerPillLink } from "@/lib/profile/owner-pills"

export { ownerPillLinks } from "@/lib/profile/owner-pills"

/** The library's numbers (components/library/library-tabs.tsx TAB_FADE_MS, TAB_EASE). */
const FADE_MS = 150
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

const PILL =
  "relative inline-flex h-10 shrink-0 touch-manipulation select-none items-center whitespace-nowrap rounded-full border bg-white px-4 text-[14px] font-medium outline-none " +
  "transition-[color,background-color,border-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] " +
  "before:absolute before:-inset-2 before:rounded-full before:content-['']"

export function ProfileOwnerPills({ communities, creator = false, active: fixed, className }: { communities: boolean; /** A live store: no Activity pill, /account is their Communities. */ creator?: boolean; active?: OwnerPillKey | null; className?: string }) {
  const pathname = usePathname()
  const fromPath = fixed !== undefined ? fixed : ownerPillFor(pathname, creator)
  const [pressed, setPressed] = useState<OwnerPillKey | null>(null)
  useEffect(() => setPressed(null), [fromPath])
  const active = pressed ?? fromPath
  const router = useRouter()
  const pills = ownerPillLinks(communities, creator)

  /* Read ahead once the page is idle: Settings first (the pill, then Edit profile's address), then the pills Next does not read itself. */
  const ahead = [
    ...pills.filter((p) => p.key === "settings" && p.key !== fromPath).map((p) => p.href),
    ...(fromPath === "settings" ? [] : [EDIT_PROFILE_HREF]),
    ...pills.filter((p) => p.key === "activity" && p.key !== fromPath).map((p) => p.href),
  ].join(" ")
  useEffect(() => {
    if (!ahead) return
    return prefetchOnIdle(router, ahead.split(" "))
  }, [ahead, router])

  useEffect(() => {
    if (settingsStaysHere()) void warmSettings("profile")
  }, [])

  return (
    <nav aria-label="Your pages" className={cn("-mx-4 sm:mx-0", className)} data-profile-owner-pills="">
      <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-none px-4 py-0 scrollbar-hide touch-pan-x sm:px-0">
        <div className="mx-auto flex w-max items-center gap-2">
          {pills.map((p) => (
            <OwnerPill
              key={p.key}
              pill={p}
              on={p.key === active}
              current={p.key === fromPath}
              onPress={() => {
                if (p.key === "settings" && settingsStaysHere()) {
                  /* In the app and on a phone, Settings is a layer over the profile, not another address. */
                  openSettingsSubpage("profile")
                  return
                }
                if (p.key === fromPath) return
                setPressed(p.key)
                /* The page that is showing stays; the line says so if the next one is slow (the tab bar does the same). */
                startRouteLoading({ lineOnly: true })
                router.push(p.href, { scroll: false })
                watchNavigation(p.href)
              }}
              onDown={() => {
                if (p.key !== fromPath) prefetchHref(router, p.href, "press")
                if (p.key === "settings" && settingsStaysHere()) void warmSettings()
              }}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}

/** One pill: answers the first tap on the lift (useFirstTap), a mouse or the keyboard on the click. */
function OwnerPill({ pill: p, on, current, onPress, onDown }: { pill: OwnerPillLink; on: boolean; current: boolean; onPress: () => void; onDown: () => void }) {
  const tap = useFirstTap<HTMLAnchorElement>(() => {
    onPress()
    return true
  })
  return (
    <Link
      href={p.href}
      prefetch={p.key === "library" || p.key === "communities" ? true : false}
      scroll={false}
      aria-current={current ? "page" : undefined}
      data-profile-owner-pill={p.key}
      data-active={on ? "true" : "false"}
      onPointerDown={(e) => {
        tap.onPointerDown(e)
        onDown()
      }}
      onPointerUp={tap.onPointerUp}
      onPointerCancel={tap.onPointerCancel}
      onClick={tap.onClick}
      style={{ transitionDuration: `${FADE_MS}ms`, transitionTimingFunction: EASE }}
      className={cn(PILL, on ? "border-[#d7dadf] text-[#1a1a2e]" : "border-[#e4e7ec] text-[#4b5563] hover:text-[#1a1a2e]")}
    >
      {/* This pill's own fill: it fades in where it is, never slides over from the last one. */}
      <span
        aria-hidden
        style={{ transitionDuration: `${FADE_MS}ms`, transitionTimingFunction: EASE }}
        className={cn(
          "pointer-events-none absolute -inset-px rounded-full border border-[#d7dadf] bg-[#e2e4e8] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)] transition-[opacity,scale] motion-reduce:transition-none",
          on ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="relative">{p.label}</span>
    </Link>
  )
}
