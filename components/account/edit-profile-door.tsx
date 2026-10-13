"use client"

/**
 * Edit profile on /account opens Settings on its Profile tab. On a computer
 * that is the settings address. On a phone, an iPad and in the iOS and
 * Android apps it is a layer over this page (settings-subpage.tsx), so
 * nothing loads and back returns here.
 */
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useFirstTap } from "@/lib/navigation/first-tap"
import { cn } from "@/lib/utils"
import { openSettingsSubpage, primeSettingsFromProfile, settingsStaysHere, warmSettings } from "@/components/account/settings-subpage"

/** Settings, opened on its Profile tab. */
const SETTINGS_PROFILE = "/account/settings?section=profile"

export function EditProfileDoor({
  userId,
  name,
  username,
  bio,
  avatarUrl = null,
  coverUrl = null,
  pageCoverUrl = null,
}: {
  userId: string
  name: string
  username: string | null
  bio: string | null
  usernameEditable: boolean
  avatarUrl?: string | null
  /** Their own cover (profiles.cover_url). */
  coverUrl?: string | null
  /** Their creator page's cover (round J1). */
  pageCoverUrl?: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    if (!settingsStaysHere()) return
    primeSettingsFromProfile({ userId, name, username, bio, avatarUrl, coverUrl, pageCoverUrl })
    void warmSettings("profile")
  }, [userId, name, username, bio, avatarUrl, coverUrl, pageCoverUrl])

  const open = () => {
    if (settingsStaysHere() || !window.matchMedia?.("(min-width: 768px)").matches) {
      openSettingsSubpage("profile")
      return true
    }
    router.push(SETTINGS_PROFILE)
    return true
  }
  const tap = useFirstTap(() => open())

  return (
    <button
      type="button"
      onClick={tap.onClick}
      onPointerEnter={() => {
        router.prefetch(SETTINGS_PROFILE)
        if (settingsStaysHere()) void warmSettings("profile")
      }}
      onPointerDown={(e) => {
        tap.onPointerDown(e)
        if (settingsStaysHere()) void warmSettings("profile")
      }}
      onPointerUp={tap.onPointerUp}
      onPointerCancel={tap.onPointerCancel}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        if (settingsStaysHere() || !window.matchMedia?.("(min-width: 768px)").matches) {
          e.preventDefault()
          openSettingsSubpage("profile")
        }
      }}
      aria-label="Edit profile"
      data-profile-edit=""
      className={cn(
        secondaryDepth,
        "pointer-events-auto relative min-h-[44px] touch-manipulation rounded-[10px] px-4 text-[14px] [-webkit-tap-highlight-color:transparent]",
        "before:absolute before:-inset-2 before:rounded-[12px] before:content-['']",
      )}
    >
      <span className="min-[390px]:hidden">Edit</span>
      <span className="hidden min-[390px]:inline">Edit profile</span>
    </button>
  )
}
