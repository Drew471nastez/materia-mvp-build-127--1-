"use client"

/**
 * Settings over the profile, on a phone, an iPad and in the iOS and Android
 * apps. It is not another address: the profile stays where it is, this
 * layer slides over it, and the back chevron slides it away. A computer
 * with a mouse still opens /account/settings.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AccountSettings } from "@/components/account/account-settings"
import { PageSpinner } from "@/components/ui/activity-spinner"
import { isNativeApp } from "@/lib/platform-utils"
import { CLICK_ECHO_MS } from "@/lib/navigation/first-tap"
import { ACCOUNT_SETTINGS_SHEET_Z } from "@/lib/account/settings-sheet"
import { BackControl } from "@/components/navigation/back-control"
import { swallowGhostTaps } from "@/lib/navigation/swallow-ghost-taps"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 340
export const SETTINGS_SHEET_OUT_MS = 440
const OUT_MS = SETTINGS_SHEET_OUT_MS
const CACHE_MS = 5 * 60_000

export type SettingsSection = "profile" | "account" | "privacy" | "notifications" | "preferences"

type Open = { section: SettingsSection; id: number; data: Loaded | null }

type Loaded = React.ComponentProps<typeof AccountSettings>

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
  return !!window.matchMedia?.("(pointer: coarse) and (max-width: 1180px)").matches
}

/** What the profile page already knows, so Edit profile can open filled on the first frame. */
export function primeSettingsFromProfile(seed: {
  userId: string
  name: string
  username: string | null
  bio: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
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
    isSeller: false,
    newsletter: base?.newsletter ?? false,
    personalized: base?.personalized ?? true,
    username: seed.username || "",
    usernameEditable: true,
    privacy: base?.privacy ?? { showActivity: true, showCommunities: true, supported: false },
    creator: false,
    cover: { url: (seed.coverUrl || base?.cover?.url || "").trim() || null, supported: true },
    location: base?.location ?? { city: null, country: null, supported: false },
    initialSection: "profile",
  }
  cached = { data, at: Date.now(), complete: cached?.complete ?? false }
}

function peekCache(section: SettingsSection): Loaded | null {
  if (!cached || Date.now() - cached.at > CACHE_MS) return null
  return { ...cached.data, initialSection: section }
}

/** Start the settings read before the finger lifts, so the screen can arrive whole. */
export function warmSettings(section: SettingsSection = "profile") {
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
  const id = ++seq
  const data = peekCache(section)
  const open: Open = { section, id, data }
  if (listen) listen(open)
  else window.dispatchEvent(new CustomEvent("storelib:settings-subpage", { detail: open }))
  if (cached?.complete && data) return
  void warmSettings(section).then((fresh) => {
    if (!fresh) return
    const filled: Open = { section, id, data: { ...fresh, initialSection: section } }
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

function SettingsLayer({ section, data, onClose }: { section: SettingsSection; data: Loaded | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const closed = useRef(false)
  const bodyOverflow = useRef("")

  useLayoutEffect(() => {
    const html = document.documentElement
    const el = panel.current
    html.setAttribute("data-app-sheet-up", "open")
    bodyOverflow.current = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (!el) return () => {
      html.removeAttribute("data-app-sheet-up")
      document.body.style.overflow = bodyOverflow.current
    }
    el.querySelector<HTMLElement>("[data-settings-sheet-scroll]")?.scrollTo(0, 0)
    if (typeof el.animate !== "function") return
    el.style.transform = "translate3d(100%, 0, 0)"
    requestAnimationFrame(() => {
      el.animate([{ transform: "translate3d(100%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }], {
        duration: IN_MS,
        easing: EASE,
        fill: "forwards",
      })
    })
    return () => {
      html.removeAttribute("data-app-sheet-up")
      document.body.style.overflow = bodyOverflow.current
    }
  }, [])

  const close = () => {
    if (closing.current || closed.current) return
    closing.current = true
    const el = panel.current
    el?.querySelector<HTMLElement>("[data-settings-sheet-scroll]")?.scrollTo({ top: 0, behavior: "auto" })
    const finish = () => {
      if (closed.current) return
      closed.current = true
      document.documentElement.removeAttribute("data-app-sheet-up")
      document.body.style.overflow = bodyOverflow.current
      swallowGhostTaps(OUT_MS + CLICK_ECHO_MS + 80)
      onClose()
    }
    if (!el || typeof el.animate !== "function") {
      finish()
      return
    }
    const a = el.animate(
      [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(100%, 0, 0)" }],
      { duration: OUT_MS, easing: EASE, fill: "forwards" },
    )
    a.onfinish = () => finish()
    a.oncancel = () => finish()
    window.setTimeout(() => finish(), OUT_MS + 150)
  }

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
        transform: "translate3d(100%, 0, 0)",
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
            <AccountSettings {...data} initialSection={section} onBack={close} />
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
  seed?: { userId: string; name: string; username: string | null; bio: string | null; avatarUrl?: string | null; coverUrl?: string | null }
}) {
  useEffect(() => {
    if (!settingsStaysHere()) return
    if (seed) primeSettingsFromProfile(seed)
    void warmSettings("profile")
  }, [seed?.userId, seed?.name, seed?.username, seed?.bio, seed?.avatarUrl, seed?.coverUrl])
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
  return createPortal(<SettingsLayer key={open.id} section={open.section} data={open.data} onClose={() => setOpen(null)} />, document.body)
}
