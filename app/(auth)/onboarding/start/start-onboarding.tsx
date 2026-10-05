"use client"

import { useEffect, useState } from "react"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
import { welcomeDone } from "@/lib/account/welcome"

/**
 * ===========================================================================
 *  A NEW ACCOUNT'S FIRST STEPS, OPENED FROM /onboarding/start
 * ===========================================================================
 * The same onboarding /sell opens (./page.tsx decided this person is signed
 * in and not a seller), on the profile slide. The same white screen and
 * spinner the sign in ended on is the first HTML, and the onboarding fades
 * in over it as soon as the page can run (as on /sell).
 *
 * "Not now" at the top marks it answered and goes where they were going.
 */
export function StartOnboarding({ next, name, username, avatar, bio }: { next: string | null; name: string; username: string | null; avatar: string | null; bio: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const done = welcomeDone(next)
  return (
    <>
      <div
        data-start-waiting=""
        aria-hidden={open}
        className="flex min-h-svh w-full items-center justify-center bg-white transition-opacity duration-300 ease-out motion-reduce:transition-none"
        style={{ opacity: open ? 0 : 1 }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
      </div>
      <CreatorOnboardingModal
        open={open}
        onClose={() => {}}
        start={{ next, name, username, avatar, bio }}
        leave={{
          label: "Not now",
          href: done,
          onLeave: () => fetch("/api/account/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skip: true }) }).then(() => undefined),
        }}
      />
    </>
  )
}
