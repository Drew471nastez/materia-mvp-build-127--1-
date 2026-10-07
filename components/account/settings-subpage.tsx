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
import { createClient } from "@/lib/supabase/client"
import { displayEmail } from "@/lib/businesses/email-alias"
import { isNativeApp } from "@/lib/platform-utils"
import { swallowGhostTaps } from "@/lib/navigation/swallow-ghost-taps"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 340
const OUT_MS = 360
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
    bioSupported: true,
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
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null
  const [full, prefs] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, bio, avatar_url, cover_url, username, location_city, location_country, personalized_recommendations")
      .eq("id", user.id)
      .maybeSingle(),
    fetch("/api/account/preferences", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ newsletter?: boolean; personalizedRecommendations?: boolean }>) : null))
      .catch(() => null),
  ])
  const slim = full.error
    ? await supabase.from("profiles").select("display_name, avatar_url, username").eq("id", user.id).maybeSingle()
    : null
  const row = ((full.error ? slim?.data : full.data) ?? null) as {
    display_name?: string | null
    bio?: string | null
    avatar_url?: string | null
    cover_url?: string | null
    username?: string | null
    location_city?: string | null
    country?: string | null
    location_country?: string | null
    personalized_recommendations?: boolean | null
  } | null
  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string | undefined]).filter(Boolean) as string[]
  const names: Record<string, string> = { google: "Google", apple: "Apple", github: "GitHub", facebook: "Facebook" }
  const via = providers.filter((p) => p !== "email").map((p) => names[p] ?? p).join(" or ")
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; personalized_recommendations?: boolean }
  return {
    userId: user.id,
    email: displayEmail(user.email) || "",
    name: row?.display_name || meta.full_name || meta.name || "",
    bio: (row?.bio || "").trim(),
    bioSupported: !full.error,
    avatarUrl: row?.avatar_url || null,
    createdAt: user.created_at,
    hasPassword: providers.length === 0 || providers.includes("email"),
    via,
    isSeller: false,
    newsletter: prefs?.newsletter === true,
    personalized: typeof prefs?.personalizedRecommendations === "boolean" ? prefs.personalizedRecommendations : row?.personalized_recommendations !== false && meta.personalized_recommendations !== false,
    username: row?.username || "",
    usernameEditable: true,
    privacy: { showActivity: true, showCommunities: true, supported: false },
    creator: false,
    cover: { url: (row?.cover_url || "").trim() || null, supported: !full.error && row != null && "cover_url" in (full.data as object) },
    location: {
      city: row?.location_city ?? null,
      country: row?.location_country ?? null,
      supported: !full.error && row != null && "location_city" in (full.data as object),
    },
    initialSection: section,
  }
}

/** Above the platform header (z-40), phone search (z-60) and buyer tab bar (z-50). */
const SHEET_Z = 420

function SettingsLayer({ section, data, onClose }: { section: SettingsSection; data: Loaded | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const closed = useRef(false)
  const slidIn = useRef(false)
  const bodyOverflow = useRef("")

  const slideIn = () => {
    if (slidIn.current) return
    slidIn.current = true
    const el = panel.current
    if (!el || typeof el.animate !== "function") return
    el.style.transform = "translate3d(100%, 0, 0)"
    el.animate([{ transform: "translate3d(100%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }], { duration: IN_MS, easing: EASE, fill: "forwards" })
  }

  useLayoutEffect(() => {
    bodyOverflow.current = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (data) slideIn()
    return () => {
      document.body.style.overflow = bodyOverflow.current
    }
  }, [])

  useLayoutEffect(() => {
    if (data) slideIn()
  }, [data])

  const close = () => {
    if (closing.current) return
    swallowGhostTaps()
    closing.current = true
    const el = panel.current
    const finish = () => {
      if (closed.current) return
      closed.current = true
      document.body.style.overflow = bodyOverflow.current
      onClose()
    }
    if (!el || typeof el.animate !== "function") {
      finish()
      return
    }
    const a = el.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(100%, 0, 0)" }], { duration: OUT_MS, easing: EASE, fill: "forwards" })
    a.onfinish = finish
    window.setTimeout(finish, OUT_MS + 60)
  }

  return (
    <div
      ref={panel}
      className="fixed inset-0 overflow-y-auto bg-white overscroll-contain"
      data-edit-profile-sheet=""
      data-settings-subpage=""
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      data-sheet-root=""
      style={{
        transform: "translate3d(100%, 0, 0)",
        willChange: "transform",
        zIndex: SHEET_Z,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="px-4 pb-10 pt-3 sm:px-6">
        {data ? (
          <AccountSettings {...data} initialSection={section} onBack={close} />
        ) : (
          <>
            <button type="button" onClick={close} aria-label="Back to profile" className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#e4e7ec] bg-white text-[#1a1a2e]">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 6 9 12l6 6" /></svg>
            </button>
            <div className="flex min-h-[min(52vh,420px)] items-center justify-center" aria-busy="true">
              <PageSpinner />
            </div>
          </>
        )}
      </div>
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
