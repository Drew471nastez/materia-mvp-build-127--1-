/**
 * A new account's onboarding (components/app/creator-onboarding-modal with
 * `start`, as app/(storelib)/(auth)/onboarding/start opens it), for
 * scripts/check-onboarding-branch.mjs. `?native=1` is the phone app: a
 * stubbed Capacitor bridge, so the join branch has its notifications step
 * and "Allow notifications" asks the stub (window.__pushAsked).
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"

const params = new URLSearchParams(location.search)
if (params.get("native") === "1") {
  ;(window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: {} }
}

createRoot(document.getElementById("app")!).render(
  createElement(CreatorOnboardingModal, {
    open: true,
    onClose: () => {},
    start: { next: "/community/clay-studio?join=1", name: params.get("name") ?? "Ana Lucia", username: params.get("handle") ?? "ana-lucia" },
    leave: { label: "Not now", href: "/community/clay-studio?join=1", onLeave: async () => {} },
  } as never),
)
;(window as unknown as { __ran?: boolean }).__ran = true
