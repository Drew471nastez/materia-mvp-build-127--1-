"use client"

import { WelcomeModal, useWelcomeModal } from "./welcome-modal"

export function WelcomeModalWrapper() {
  const { showWelcome, closeWelcome, isChecked } = useWelcomeModal()

  // Don't render anything until we've checked localStorage
  if (!isChecked) return null

  return <WelcomeModal open={showWelcome} onClose={closeWelcome} />
}
