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
}: {
  userId: string
  name: string
  username: string | null
  bio: string | null
  usernameEditable: boolean
  avatarUrl?: string | null
  coverUrl?: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    if (!settingsStaysHere()) return
    primeSettingsFromProfile({ userId, name, username, bio, avatarUrl, coverUrl })
    void warmSettings("profile")
  }, [userId, name, username, bio, avatarUrl, coverUrl])

  return (
    <button
      type="button"
      onPointerEnter={() => {
        router.prefetch(SETTINGS_PROFILE)
        if (settingsStaysHere()) void warmSettings()
      }}
      onPointerDown={() => {
        if (settingsStaysHere()) void warmSettings()
      }}
      onClick={() => {
        /* A phone, a tablet or the app: Settings' Profile tab over this page. A computer: the same tab at its address. */
        if (settingsStaysHere() || !window.matchMedia?.("(min-width: 768px)").matches) {
          openSettingsSubpage("profile")
          return
        }
        router.push(SETTINGS_PROFILE)
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        if (settingsStaysHere() || !window.matchMedia?.("(min-width: 768px)").matches) {
          e.preventDefault()
          openSettingsSubpage("profile")
        }
      }}
      aria-label="Edit profile"
      data-profile-edit=""
      className={cn(secondaryDepth, "pointer-events-auto h-10 rounded-[10px] px-4 text-[14px]")}
    >
      <span className="min-[390px]:hidden">Edit</span>
      <span className="hidden min-[390px]:inline">Edit profile</span>
    </button>
  )
}
