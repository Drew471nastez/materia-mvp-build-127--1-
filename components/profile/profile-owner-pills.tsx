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
 *
 * ROUND 17: THE SPACE PILLS' QUIET SWITCH, AND EVERY PILL'S PAGE ALREADY HERE.
 * The owner: "switching in between pill shapes is not smooth there". Each
 * pill's own fill fades in where it is over 140ms, the words turn in one
 * step, a finger tints the pill lightly (lib/ui/pill-switch.ts), as a
 * community's space pills do. And the press no longer waits on the server:
 * Posts was never read ahead (its link said prefetch false and the idle pass
 * skipped it), so a press sat on the old page for a whole server answer and
 * then cut. Every pill's page is read whole once the profile is idle, Posts
 * and Communities included, so the next panel is in place in the frame after
 * the press (components/account/account-hub.tsx lands it).
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
import { keepFresh } from "@/components/nav/keep-fresh"
import { cn } from "@/lib/utils"
import { PILL_FILL, PILL_PRESS, PILL_WORDS, PILL_WORDS_OFF, PILL_WORDS_ON, pressPill, releasePill } from "@/lib/ui/pill-switch"
import type { OwnerPill as OwnerPillLink } from "@/lib/profile/owner-pills"

export { ownerPillLinks } from "@/lib/profile/owner-pills"

/* White on a hairline, the same size chosen or not; the fill, the press and the words are layers inside it (lib/ui/pill-switch.ts). The ::before reaches 8px past it for a finger. */
const PILL =
  "group/pill relative isolate inline-flex h-10 shrink-0 touch-manipulation select-none items-center whitespace-nowrap rounded-full border border-[#e4e7ec] bg-white px-4 text-[14px] font-medium outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent] " +
  "before:absolute before:-inset-2 before:rounded-full before:content-['']"

export function ProfileOwnerPills({ communities, creator = false, active: fixed, className }: { communities: boolean; /** A live store: no Activity pill, /account is their Communities. */ creator?: boolean; active?: OwnerPillKey | null; className?: string }) {
  const pathname = usePathname()
  const fromPath = fixed !== undefined ? fixed : ownerPillFor(pathname, creator)
  const [pressed, setPressed] = useState<OwnerPillKey | null>(null)
  useEffect(() => setPressed(null), [fromPath])
  const active = pressed ?? fromPath
  const router = useRouter()
  const pills = ownerPillLinks(communities, creator)

  /*
    Read ahead once the page is idle, whole: Settings first (the pill, then Edit profile's address), then the profile's own
    panels (Posts, Communities, Activity), then the library. Every pill but the one you are on, so a press lands at once.
  */
  const order: OwnerPillKey[] = ["settings", "posts", "communities", "activity", "library"]
  const ahead = [
    ...pills.filter((p) => p.key === "settings" && p.key !== fromPath).map((p) => p.href),
    ...(fromPath === "settings" ? [] : [EDIT_PROFILE_HREF]),
    ...order.filter((k) => k !== "settings" && k !== fromPath).flatMap((k) => pills.filter((p) => p.key === k && p.href !== pathname).map((p) => p.href)),
  ].join(" ")
  useEffect(() => {
    if (!ahead) return
    return prefetchOnIdle(router, ahead.split(" "))
  }, [ahead, router])
  /*
    AND KEPT READ (round 18, the owner: "switching between the pills is not instant, it takes too much to load them"). A pill
    pressed more than five minutes after the profile was opened found its page stale in the router and waited on the server.
    The same pages are read again as they go stale while the profile is on screen, and when the app comes back
    (components/nav/keep-fresh.ts), on the device's own plan (lib/nav/prefetch-policy.ts).
  */
  useEffect(() => {
    if (!ahead) return
    return keepFresh(() => {
      for (const href of ahead.split(" ")) prefetchHref(router, href, "idle")
    })
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
      /* The profile's panels and the library, whole, as soon as the row is on screen (and again on idle, above); Settings has its own warm path. */
      prefetch={p.key === "library" || p.key === "communities" || p.key === "posts" ? true : false}
      scroll={false}
      aria-current={current ? "page" : undefined}
      data-profile-owner-pill={p.key}
      data-active={on ? "true" : "false"}
      onPointerDown={(e) => {
        if (e.button === 0 && !on) pressPill(e.currentTarget)
        tap.onPointerDown(e)
        onDown()
      }}
      onPointerUp={(e) => {
        releasePill(e.currentTarget)
        tap.onPointerUp(e)
      }}
      onPointerCancel={(e) => {
        releasePill(e.currentTarget)
        tap.onPointerCancel()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") releasePill(e.currentTarget)
      }}
      onClick={tap.onClick}
      className={PILL}
    >
      <span aria-hidden data-pill-press="" className={PILL_PRESS} />
      {/* This pill's own fill: it fades in where it is, never slides over from the last one. */}
      <span aria-hidden data-profile-owner-pill-fill="" className={cn(PILL_FILL, on ? "opacity-100" : "opacity-0")} />
      <span className={cn(PILL_WORDS, on ? PILL_WORDS_ON : PILL_WORDS_OFF)}>{p.label}</span>
    </Link>
  )
}
