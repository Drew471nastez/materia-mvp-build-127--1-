"use client"

/**
 * ===========================================================================
 *  THE PROFILE AS IT IS BEING EDITED, ON THE PAGE BEHIND THE SHEET (r51)
 * ===========================================================================
 * "Every change shows live in the preview without pressing Save." The colour
 * scheme already did (use-scheme-preview); the name, the bio, the photo, the
 * cover, the social links and the three Show on profile switches only showed
 * once Save had gone to the server and the page had been drawn again.
 *
 * The page's header is a client component, and the sheet is on the same
 * page (inside the workspace's frame as well as at the page's own address),
 * so the form is handed to the header here, in memory: the sheet writes
 * what is in its fields while it is open, the header draws it over what the
 * server gave it, and closing without saving clears it, which puts the
 * saved page back with nothing to fetch. A save keeps it until the page's
 * new props have arrived, so nothing flickers back to the old values in
 * between (edit-profile-button).
 *
 * Nothing here is stored or sent anywhere. One page has one header, so one
 * draft at a time. The header reads it only where it carries the owner's
 * controls, so no other header that shares the component can pick it up.
 */

import * as React from "react"

import type { CoverCrop } from "@/lib/images/cover-crop"

export interface ProfileDraft {
  name: string
  bio: string
  avatarUrl: string | null
  coverUrl: string | null
  crop: CoverCrop
  /** Platform key to a resolved profile link; "" for none. */
  socialLinks: Record<string, string>
  showReviews: boolean
  showSales: boolean
  showSocialLinks: boolean
}

let current: ProfileDraft | null = null
const listeners = new Set<() => void>()

export function setProfileDraft(next: ProfileDraft | null) {
  if (next === current) return
  current = next
  for (const fn of listeners) fn()
}

export function getProfileDraft(): ProfileDraft | null {
  return current
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const none = () => null

/** The draft, for a component that draws the profile. `enabled` false always reads null. */
export function useProfileDraft(enabled = true): ProfileDraft | null {
  const draft = React.useSyncExternalStore(subscribe, getProfileDraft, none)
  return enabled ? draft : null
}
