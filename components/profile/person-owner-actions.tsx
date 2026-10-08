"use client"

/**
 * YOUR OWN PAGE'S CONTROL ON THE COVER, for a person without a store: the
 * same white raised button a creator gets there (components/storefront/
 * edit-profile-button.tsx), going to the fields it edits, Settings' Profile
 * (the photo, the name, the bio, the cover, where you are from). A link, so
 * it is one press and works before anything has hydrated.
 */
import Link from "next/link"
import { Pencil } from "lucide-react"
import { OWNER_CONTROL_DEPTH } from "@/components/storefront/owner-actions-menu"
import { openSettingsSubpage, settingsHref, settingsStaysHere, warmSettings } from "@/components/account/settings-subpage"

export const PERSON_EDIT_HREF = settingsHref("profile")

export function PersonOwnerActions() {
  return (
    <Link
      href={PERSON_EDIT_HREF}
      onPointerDown={() => {
        if (settingsStaysHere()) void warmSettings()
      }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        if (!settingsStaysHere()) return
        e.preventDefault()
        openSettingsSubpage("profile")
      }}
      aria-label="Edit profile"
      data-person-edit=""
      className={`relative inline-flex h-9 items-center gap-2 rounded-lg bg-white/95 px-3 text-sm font-medium text-gray-900 backdrop-blur transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-white sm:px-4 ${OWNER_CONTROL_DEPTH}`}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Edit profile</span>
    </Link>
  )
}
