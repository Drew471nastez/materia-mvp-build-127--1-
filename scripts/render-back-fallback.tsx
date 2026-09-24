/**
 * The real product bar on a stand-in product page, with a router whose push
 * is a real document navigation, so a browser can open the page the ways a
 * visitor does and press the real arrow. Bundled and driven by
 * scripts/check-back-fallback.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"
import { noteClientNavigation } from "@/lib/navigation/in-app-history"

const w = window as unknown as { __navs: string[]; __noteNav: () => void }
w.__navs = []
/* What a router.replace used to do to the count: a route change with no
   history entry behind it. */
w.__noteNav = () => noteClientNavigation("/login")

const router = {
  push: (href: string) => { w.__navs.push(`push ${href}`); window.location.assign(href) },
  replace: (href: string) => { w.__navs.push(`replace ${href}`); window.location.replace(href) },
  back: () => { w.__navs.push("router.back"); window.history.back() },
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as unknown as React.ContextType<typeof AppRouterContext>

createRoot(document.getElementById("app")!).render(
  <AppRouterContext.Provider value={router}>
    <LiveProductCreatorBar
      settings={defaultProductCreatorBarSettings}
      creatorName="Andrew"
      creatorId="probe"
      creatorUsername="andrew"
      productTitle="The ebook"
      productSlug="ebook"
    />
  </AppRouterContext.Provider>,
)
