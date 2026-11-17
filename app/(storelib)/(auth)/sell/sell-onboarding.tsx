"use client"

import { useEffect, useState } from "react"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
import { switchBusiness, type SwitchedTo } from "@/lib/businesses/switch-client"
import type { OnboardingResume } from "@/lib/account/onboarding-resume"

/**
 * ===========================================================================
 *  SELLER ONBOARDING, OPENED FROM /sell
 * ===========================================================================
 * The server (./page.tsx) has already decided this person is signed in,
 * verified and not a seller yet, so there is nothing left to check here and
 * no second loading screen: the first HTML is the same white screen and
 * spinner the sign in ended on (components/auth/auth-resolving-screen, and
 * ./loading.tsx for a link pressed inside the site), and the setup opens
 * over it as soon as the page can run, while the spinner fades out under
 * it. Nothing of /app is ever drawn behind it; finishing the last step is
 * what takes them there (the onboarding's own window.location.replace).
 */
export function SellOnboarding({
  leaveHref,
  resumePlan,
  firstBusiness,
  resume = null,
  seed = null,
}: {
  /** Where the way out goes: the page they came from, else Discover. */
  leaveHref: string
  /** Back from a paid plan's Stripe checkout: finish the setup with it. */
  resumePlan: "growth" | "pro" | null
  /** A second business being set up (lib/businesses): its way back is to the first one, not out. */
  firstBusiness: SwitchedTo | null
  /** A setup begun and not finished: what was typed, and the step to open on (lib/account/onboarding-resume). */
  resume?: OnboardingResume | null
  /** Their current name and handle, so Name your store does not open blank. */
  seed?: { name: string; username: string | null } | null
}) {
  /* Opened after the first paint, so the dialog's own fade runs from the spinner rather than popping in with the HTML. */
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const switchBack = firstBusiness
    ? {
        name: firstBusiness.name,
        onSwitch: () =>
          switchBusiness(firstBusiness.userId, "/app", {
            arrival: { name: firstBusiness.name, photo: firstBusiness.avatarUrl },
            business: firstBusiness,
          }),
      }
    : null

  return (
    <>
      <div
        data-sell-waiting=""
        aria-hidden={open}
        className="flex min-h-svh w-full items-center justify-center bg-[#0b0b0f] transition-opacity duration-300 ease-out motion-reduce:transition-none"
        style={{ opacity: open ? 0 : 1 }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-white" />
      </div>
      <CreatorOnboardingModal
        open={open}
        onClose={() => {}}
        resumeFromStripe={resumePlan ? { planId: resumePlan } : null}
        resume={resumePlan ? null : resume}
        switchBack={switchBack}
        leave={{ label: "Not now", href: leaveHref }}
        seed={seed}
      />
    </>
  )
}
