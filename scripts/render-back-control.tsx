/**
 * The real BackControl out of the product bar, in three states: at rest,
 * pending for less time than the delay, and pending for longer than it.
 *
 * It is not exported, so the bar is rendered and the control read out of it
 * — which also means this measures the control as it is actually used rather
 * than a copy of it wired up by hand.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

/**
 * The bar calls useRouter(), which throws outside an app router. Without this
 * the whole render was thrown away and the probe reported "no Back control"
 * as though the button had been deleted.
 *
 * `push` deliberately does nothing: the point is to watch what the control
 * does WHILE a navigation is outstanding, so a navigation that never resolves
 * is exactly the case being measured.
 */
/** A route that never arrives, which is what the spinner is for. */
const never = new Promise<void>(() => {})
function Underway(): React.ReactNode {
  throw never
}

function Harness() {
  const [navigating, setNavigating] = React.useState(false)
  const router = React.useMemo(
    () =>
      ({
        /*
          `push` starts a navigation that does not finish. React is already
          inside startTransition when this runs, so the suspended render keeps
          the transition pending — which is exactly the state a real route
          being fetched puts the control in.
        */
        push: () => setNavigating(true),
        replace: () => setNavigating(true),
        back: () => setNavigating(true),
        forward: () => {},
        refresh: () => {},
        prefetch: () => {},
      }) as unknown as React.ContextType<typeof AppRouterContext>,
    [],
  )

  return (
    <AppRouterContext.Provider value={router}>
      <div id="host" style={{ width: 390, background: "#fff" }}>
        <LiveProductCreatorBar
          settings={defaultProductCreatorBarSettings}
          creatorName="AndrewRullz"
          creatorId="probe"
          creatorUsername="andrewrullz"
          productTitle="Geanta Guess Reptila"
          productSlug="geanta-guess-reptila"
        />
        <React.Suspense fallback={null}>{navigating ? <Underway /> : null}</React.Suspense>
      </div>
    </AppRouterContext.Provider>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
