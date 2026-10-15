"use client"

/**
 * Settings over the profile, on a phone, an iPad and in the iOS and Android
 * apps. It is not another address: the profile stays where it is, this
 * layer slides over it, and the back chevron slides it away. A computer
 * with a mouse still opens /account/settings.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import type { AccountSettings as AccountSettingsType } from "@/components/account/account-settings"
import { PageSpinner } from "@/components/ui/activity-spinner"
import { isNativeApp } from "@/lib/platform-utils"
import { CLICK_ECHO_MS } from "@/lib/navigation/first-tap"
import { ACCOUNT_SETTINGS_SHEET_Z } from "@/lib/account/settings-sheet"
import { BackControl } from "@/components/navigation/back-control"
import { recentPress, swallowGhostTaps } from "@/lib/navigation/swallow-ghost-taps"
import { pauseAccountScrollPin } from "@/lib/navigation/tab-scroll"
import { useLayer } from "@/lib/ui/layers"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 340
/*
  GOING BACK, AT ONCE AND SMOOTH (round 18, the owner: "going back from the Settings page should feel smoother: keep it
  instant, but smooth"). Filmed at 4x CPU on a 390px phone, a tap on Back crossed most of the screen in about 90ms and then
  crawled the last 50px for another 300ms on the opening's strongly eased curve: gone 380 to 420ms after the finger lifted,
  most of it a tail that read as the screen hanging on. And the slide was a CSS transition that only starts once React has
  drawn the change, with the whole of Settings drawn again in that render, so a busy page held it back. The slide now starts
  on the compositor in the tap's own handler, before React draws anything, and runs SETTINGS_SHEET_OUT_MS on a curve with a
  short, even settle (OUT_EASE): gone 285 to 325ms after the lift, measured the same way.
*/
export const SETTINGS_SHEET_OUT_MS = 320
const OUT_EASE = "cubic-bezier(0.3, 0.7, 0.2, 1)"
const OUT_MS = SETTINGS_SHEET_OUT_MS
const CACHE_MS = 5 * 60_000

export type SettingsSection = "profile" | "account" | "privacy" | "notifications" | "preferences"

/** `full`: the data is the whole settings read, not the copy made from the profile while it loads. */
type Open = { section: SettingsSection; id: number; data: Loaded | null; full?: boolean }

type Loaded = React.ComponentProps<typeof AccountSettingsType>

/*
  THE SETTINGS SCREEN IS FETCHED WHEN IT IS WANTED (round 27, the app speed review: its 1,300 lines were in every page's
  bundle, the app's first screen included, because this host is mounted at the root). Its code is asked for with its
  data (warmSettings, on the press that opens it), so the sheet still arrives whole.
*/
const loadSettingsCode = () => import("@/components/account/account-settings")
const AccountSettings = dynamic(() => loadSettingsCode().then((m) => m.AccountSettings), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[min(52vh,420px)] items-center justify-center" aria-busy="true">
      <PageSpinner />
    </div>
  ),
})

type Cache = { data: Loaded; at: number; complete: boolean }

let listen: ((open: Open) => void) | null = null
let seq = 0
let cached: Cache | null = null
let inflight: Promise<Loaded | null> | null = null

/** Phones, tablets and the native apps. A mouse on a wide screen keeps the settings address. */
export function settingsStaysHere(): boolean {
  if (typeof window === "undefined") return false
  if (isNativeApp()) return true
  if (document.documentElement.classList.contains("capacitor")) return true
  /*
    A window under 768px too, whatever points at it. Edit profile already opened the layer there and the Settings pill did not,
    so a narrow window on a computer got two different screens from the two buttons. One rule for both now.
  */
  return !!window.matchMedia?.("(pointer: coarse) and (max-width: 1180px), (max-width: 767px)").matches
}

/** What the profile page already knows, so Edit profile can open filled on the first frame. */
export function primeSettingsFromProfile(seed: {
  userId: string
  name: string
  username: string | null
  bio: string | null
  avatarUrl?: string | null
  /** Their OWN cover (profiles.cover_url), not the one the profile draws: that can be their creator page's. */
  coverUrl?: string | null
  /** Their creator page's cover, which the profile draws when they have none of their own (round J1). */
  pageCoverUrl?: string | null
}) {
  if (typeof window === "undefined") return
  const base = cached?.data
  const data: Loaded = {
    userId: seed.userId,
    email: base?.email ?? "",
    name: seed.name,
    bio: (seed.bio || "").trim(),
    bioSupported: base?.bioSupported ?? true,
    avatarUrl: seed.avatarUrl ?? base?.avatarUrl ?? null,
    createdAt: base?.createdAt ?? new Date().toISOString(),
    hasPassword: base?.hasPassword ?? true,
    via: base?.via ?? "",
    /* What only the full read knows is kept from it: a creator never sees, for a moment, the switches and the editable handle a buyer has. */
    isSeller: base?.isSeller ?? false,
    newsletter: base?.newsletter ?? false,
    personalized: base?.personalized ?? true,
    username: seed.username || "",
    usernameEditable: base?.usernameEditable ?? true,
    privacy: base?.privacy ?? { showActivity: true, showCommunities: true, supported: false },
    creator: base?.creator ?? false,
    cover: {
      url: ((seed.coverUrl !== undefined ? seed.coverUrl : base?.cover?.url) || "").trim() || null,
      supported: true,
      page: seed.pageCoverUrl !== undefined ? seed.pageCoverUrl : (base?.cover?.page ?? null),
    },
    location: base?.location ?? { city: null, country: null, supported: false },
    initialSection: "profile",
  }
  /* A copy made from the profile is not the whole settings: the next open reads them again, so it is filled with the real ones. */
  cached = { data, at: Date.now(), complete: false }
}

function peekCache(section: SettingsSection): Loaded | null {
  if (!cached || Date.now() - cached.at > CACHE_MS) return null
  return { ...cached.data, initialSection: section }
}

/** Start the settings read before the finger lifts, so the screen can arrive whole. */
export function warmSettings(section: SettingsSection = "profile") {
  void loadSettingsCode().catch(() => {})
  if (!inflight) {
    inflight = loadOwnSettings(section).then((data) => {
      inflight = null
      if (data) cached = { data, at: Date.now(), complete: true }
      return data
    })
  }
  return inflight
}

export function openSettingsSubpage(section: SettingsSection = "profile") {
  void loadSettingsCode().catch(() => {})
  const id = ++seq
  const data = peekCache(section)
  const open: Open = { section, id, data, full: !!cached?.complete && !!data }
  if (listen) listen(open)
  else window.dispatchEvent(new CustomEvent("storelib:settings-subpage", { detail: open }))
  if (cached?.complete && data) return
  void warmSettings(section).then((fresh) => {
    if (!fresh) return
    const filled: Open = { section, id, data: { ...fresh, initialSection: section }, full: true }
    if (listen) listen(filled)
    else window.dispatchEvent(new CustomEvent("storelib:settings-subpage", { detail: filled }))
  })
}

export function sectionFromSettingsHref(href: string): SettingsSection {
  const m = /section=(profile|account|privacy|notifications|preferences)/.exec(href)
  return (m?.[1] as SettingsSection) || "account"
}

async function loadOwnSettings(section: SettingsSection): Promise<Loaded | null> {
  try {
    const res = await fetch(`/api/account/settings-bundle?section=${section}`, { credentials: "same-origin" })
    if (!res.ok) return null
    return (await res.json()) as Loaded
  } catch {
    return null
  }
}

function SettingsLayer({ section, data, full = false, onClose }: { section: SettingsSection; data: Loaded | null; full?: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const closed = useRef(false)
  const scrollY = useRef(0)
  const [entered, setEntered] = useState(false)
  /*
    THE SECTION YOU ARE ON SURVIVES THE FULL READ (round 17). The screen is built again when the whole settings read lands
    (key "seed" to "full", below), and it used to open again on the section it was asked for: a pill pressed while the read
    was on its way was undone a moment later, and read as a pill that needed a second tap.
  */
  const sectionNow = useRef<SettingsSection>(section)
  /* Counted over the page (lib/ui/layers.ts): it covers the tab bar, which holds still under it and is there when it slides away. */
  useLayer("screen", true, panel)

  useLayoutEffect(() => {
    const html = document.documentElement
    const y = window.scrollY
    scrollY.current = y
    html.setAttribute("data-app-sheet-up", "open")
    /* Do not set overflow:hidden on body. On iOS that throws the page to the top and it stays there when the sheet leaves. */
    const block = (e: TouchEvent) => {
      const n = e.target as Node | null
      if (n && panel.current?.contains(n)) return
      e.preventDefault()
    }
    document.addEventListener("touchmove", block, { passive: false })
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true))
    })
    if (reduce) setEntered(true)
    return () => {
      cancelAnimationFrame(id)
      html.removeAttribute("data-app-sheet-up")
      document.removeEventListener("touchmove", block)
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y)
    }
  }, [])

  const close = () => {
    if (closing.current || closed.current) return
    closing.current = true
    /* Where the finger was that asked to close: the echo, if one comes, lands there and nowhere else (swallow-ghost-taps.ts). */
    const pressedAt = recentPress()
    const y = scrollY.current
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y)
    pauseAccountScrollPin(OUT_MS + 1400, y)
    const el = panel.current
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (el && !still && typeof el.animate === "function") {
      /* From where it stands now (a slide in still running included), to off the right edge, held there until it is taken away. */
      const from = getComputedStyle(el).transform
      el.style.transition = "none"
      el.animate([{ transform: from === "none" ? "translate3d(0, 0, 0)" : from }, { transform: "translate3d(100%, 0, 0)" }], { duration: OUT_MS, easing: OUT_EASE, fill: "forwards" })
    }
    setEntered(false)
    const finish = () => {
      if (closed.current) return
      closed.current = true
      document.documentElement.removeAttribute("data-app-sheet-up")
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y)
      swallowGhostTaps(OUT_MS + CLICK_ECHO_MS + 80, pressedAt)
      onClose()
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    window.setTimeout(finish, reduce ? 20 : OUT_MS + 50)
  }

  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  return (
    <div
      ref={panel}
      className="fixed inset-0 flex flex-col overflow-hidden bg-white overscroll-contain"
      data-edit-profile-sheet=""
      data-settings-subpage=""
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      data-sheet-root=""
      style={{
        transform: entered ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
        transition: reduce || !entered ? "none" : `transform ${IN_MS}ms ${EASE}`,
        willChange: "transform",
        zIndex: ACCOUNT_SETTINGS_SHEET_Z,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        data-settings-sheet-scroll=""
      >
        <div className="px-4 pb-8 pt-3 sm:px-6" data-settings-sheet-body="">
          {data ? (
            /* Built again once the full read lands: the fields copy their values in once, and a city typed into the seed's empty location would otherwise save the country as nothing. */
            <AccountSettings key={full ? "full" : "seed"} {...data} initialSection={sectionNow.current} onSection={(key) => (sectionNow.current = key)} onBack={close} />
          ) : (
            <>
              <BackControl fallback="/account" label="Back to profile" onBack={close} className="h-11 w-11 rounded-[10px]" />
              <div className="flex min-h-[min(52vh,420px)] items-center justify-center" aria-busy="true">
                <PageSpinner />
              </div>
            </>
          )}
        </div>
      </div>
      <div data-sheet-save-dock="" className="shrink-0" />
    </div>
  )
}

/** Keep settings data warm on pages that open it as a layer (account, profile). */
export function SettingsWarm({
  seed,
}: {
  seed?: { userId: string; name: string; username: string | null; bio: string | null; avatarUrl?: string | null; coverUrl?: string | null; pageCoverUrl?: string | null }
}) {
  useEffect(() => {
    if (!settingsStaysHere()) return
    if (seed) primeSettingsFromProfile(seed)
    void warmSettings("profile")
  }, [seed?.userId, seed?.name, seed?.username, seed?.bio, seed?.avatarUrl, seed?.coverUrl, seed?.pageCoverUrl])
  return null
}

export function SettingsSubpageHost() {
  const [open, setOpen] = useState<Open | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<Open>).detail
      if (!detail?.section) return
      setOpen((cur) => (cur && cur.id === detail.id ? { ...cur, ...detail } : detail))
    }
    listen = (next) => setOpen((cur) => (cur && cur.id === next.id ? { ...cur, ...next } : next))
    window.addEventListener("storelib:settings-subpage", on)
    return () => {
      listen = null
      window.removeEventListener("storelib:settings-subpage", on)
    }
  }, [])
  if (!open || typeof document === "undefined") return null
  /* Only this layer's own close: one reopened while the last was sliding out is a new layer, and the old one's timer must not take it away. */
  const id = open.id
  return createPortal(<SettingsLayer key={id} section={open.section} data={open.data} full={open.full} onClose={() => setOpen((cur) => (cur?.id === id ? null : cur))} />, document.body)
}
