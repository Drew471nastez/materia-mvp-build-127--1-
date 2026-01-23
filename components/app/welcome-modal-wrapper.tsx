"use client"

import { useState } from "react"
import { WelcomeModal, useWelcomeModal } from "./welcome-modal"
import { CreatorOnboardingModal } from "./creator-onboarding-modal"

export function WelcomeModalWrapper() {
  const { showWelcome, closeWelcome, isChecked } = useWelcomeModal()
  const [showCreatorOnboarding, setShowCreatorOnboarding] = useState(false)

  // Don't render anything until we've checked localStorage
  if (!isChecked) return null

  const handleCreatorSelect = () => {
    // Show the creator onboarding modal
    setShowCreatorOnboarding(true)
  }

  const handleCreatorOnboardingClose = () => {
    setShowCreatorOnboarding(false)
  }

  return (
    <>
      <WelcomeModal
        open={showWelcome}
        onClose={closeWelcome}
        onCreatorSelect={handleCreatorSelect}
      />
      <CreatorOnboardingModal
        open={showCreatorOnboarding}
        onClose={handleCreatorOnboardingClose}
      />
    </>
  )
}
