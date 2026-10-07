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

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 380
const OUT_MS = 420

export type SettingsSection = "profile" | "account" | "privacy" | "notifications" | "preferences"

type Open = { section: SettingsSection; id: number; data: Loaded | null }

let listen: ((open: Open) => void) | null = null
let seq = 0
let warm: Promise<Loaded | null> | null = null

/** Phones, tablets and the native apps. A mouse on a wide screen keeps the settings address. */
export function settingsStaysHere(): boolean {
  if (typeof window === "undefined") return false
  if (isNativeApp()) return true
  if (document.documentElement.classList.contains("capacitor")) return true
  return !!window.matchMedia?.("(pointer: coarse) and (max-width: 1180px)").matches
}

/** Start the settings read before the finger lifts, so the screen can arrive whole. */
export function warmSettings() {
  if (!warm) warm = loadOwnSettings("profile")
  return warm
}

export function openSettingsSubpage(section: SettingsSection = "profile") {
  const open: Open = { section, id: ++seq, data: null }
  const load = warmSettings()
  if (listen) listen(open)
  else window.dispatchEvent(new CustomEvent("storelib:settings-subpage", { detail: open }))
  void load.then((data) => {
    const filled = { ...open, data }
    if (listen) listen(filled)
    else window.dispatchEvent(new CustomEvent("storelib:settings-subpage", { detail: filled }))
  })
}

export function sectionFromSettingsHref(href: string): SettingsSection {
  const m = /section=(profile|account|privacy|notifications|preferences)/.exec(href)
  return (m?.[1] as SettingsSection) || "account"
}

type Loaded = React.ComponentProps<typeof AccountSettings>

async function loadOwnSettings(section: SettingsSection): Promise<Loaded | null> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null
  const full = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, cover_url, username, location_city, location_country, personalized_recommendations")
    .eq("id", user.id)
    .maybeSingle()
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
  const prefs = await fetch("/api/account/preferences", { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<{ newsletter?: boolean; personalizedRecommendations?: boolean }>) : null))
    .catch(() => null)
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

function clearSettingsChrome() {
  document.documentElement.removeAttribute("data-settings-subpage")
}

function SettingsLayer({ section, data, onClose }: { section: SettingsSection; data: Loaded | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(false)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-settings-subpage", "")
    const el = panel.current
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (el) {
      el.style.transform = "translate3d(100%, 0, 0)"
      const a = el.animate([{ transform: "translate3d(100%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }], { duration: IN_MS, easing: EASE, fill: "forwards" })
      return () => {
        a.cancel()
        clearSettingsChrome()
        document.body.style.overflow = prev
      }
    }
    return () => {
      clearSettingsChrome()
      document.body.style.overflow = prev
    }
  }, [])

  const close = () => {
    if (closing.current) return
    closing.current = true
    const el = panel.current
    if (!el || typeof el.animate !== "function") {
      clearSettingsChrome()
      document.body.style.overflow = ""
      onClose()
      return
    }
    const a = el.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(100%, 0, 0)" }], { duration: OUT_MS, easing: EASE, fill: "forwards" })
    const done = () => {
      clearSettingsChrome()
      document.body.style.overflow = ""
      onClose()
    }
    a.onfinish = done
    window.setTimeout(done, OUT_MS + 80)
  }

  return (
    <div
      ref={panel}
      className="fixed inset-0 z-[300] overflow-y-auto bg-white"
      data-edit-profile-sheet=""
      data-settings-subpage=""
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      data-sheet-root=""
      style={{ transform: "translate3d(100%, 0, 0)", willChange: "transform", zIndex: 300, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
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
