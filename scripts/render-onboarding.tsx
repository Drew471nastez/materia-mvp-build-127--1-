/**
 * The creator onboarding (components/app/creator-onboarding-modal), opened,
 * for scripts/check-onboarding.mjs. `?switch=1` opens it the way starting a
 * second business does, with the way back to the first one at the top left,
 * which is the case the top row has to hold: a name beside a centred bar.
 *
 * The way back refuses on purpose, so the probe can see where what went
 * wrong is drawn. Supabase, the router and every /api call are stubs the
 * probe writes.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"

const params = new URLSearchParams(location.search)
const name = params.get("name") ?? "AndrewRullz"

const switchBack = params.get("switch")
  ? {
      name,
      onSwitch: async () => {
        await new Promise((r) => setTimeout(r, 30))
        throw new Error("That business could not be opened. Try again.")
      },
    }
  : null

createRoot(document.getElementById("app")!).render(
  createElement(CreatorOnboardingModal, { open: true, onClose: () => {}, switchBack } as never),
)
;(window as unknown as { __ran?: boolean }).__ran = true
