"use client"

import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"

/**
 * The real join onboarding, opened here so it can be walked without creating
 * an account. `preview` skips saves and the redirect. The slides are the
 * same component members see.
 */
export function OnboardingPreview() {
  return (
    <CreatorOnboardingModal
      open
      preview
      onClose={() => {}}
      start={{ next: "/admin/onboarding", name: "Alex Rivera", username: null, bio: "" }}
    />
  )
}
