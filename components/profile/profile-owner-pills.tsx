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
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { EDIT_PROFILE_HREF, ownerPillFor, ownerPillLinks, type OwnerPillKey } from "@/lib/profile/owner-pills"
import { prefetchHref, prefetchOnIdle } from "@/lib/nav/prefetch-policy"
import { openSettingsSubpage, settingsStaysHere, warmSettings } from "@/components/account/settings-subpage"
import { PillGlider } from "@/components/ui/pill-glider"
import { cn } from "@/lib/utils"

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
        <div className="group/pills relative mx-auto flex w-max items-center gap-2">
          {/* One fill that glides to the chosen pill (components/ui/pill-glider.tsx), over the white pills and under the labels. */}
          <PillGlider
            active={active ?? "none"}
            selector='[data-active="true"]'
            className="border border-[#d7dadf] bg-[#e2e4e8] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
          />
          {pills.map((p) => {
            const on = p.key === active
            return (
              <Link
                key={p.key}
                href={p.href}
                prefetch={p.key === "library" || p.key === "communities" ? true : false}
                scroll={false}
                aria-current={p.key === fromPath ? "page" : undefined}
                data-profile-owner-pill={p.key}
                data-active={on ? "true" : "false"}
                onPointerDown={() => {
                  if (p.key !== fromPath) prefetchHref(router, p.href, "press")
                  if (p.key === "settings" && settingsStaysHere()) void warmSettings()
                }}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                  /* In the app and on a phone, Settings is a layer over the profile, not another address. */
                  if (p.key === "settings" && settingsStaysHere()) {
                    e.preventDefault()
                    openSettingsSubpage("profile")
                    return
                  }
                  if (p.key !== fromPath) setPressed(p.key)
                }}
                style={{ transitionDuration: `${FADE_MS}ms`, transitionTimingFunction: EASE }}
                className={cn(PILL, on ? "border-[#d7dadf] text-[#1a1a2e]" : "border-[#e4e7ec] text-[#4b5563] hover:text-[#1a1a2e]")}
              >
                {/* This pill's own fill, until the row's one gliding fill has measured (data-glide); then only the glider is drawn. */}
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -inset-px rounded-full border border-[#d7dadf] bg-[#e2e4e8] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)] group-data-[glide]/pills:hidden",
                    on ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="relative z-[2]">{p.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
