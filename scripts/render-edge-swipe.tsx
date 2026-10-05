/**
 * The app's buyer shell for scripts/check-edge-swipe.mjs: the real header
 * (ConditionalHeader), the real buyer tab bar, the real history tracker and
 * the real EdgeSwipeBack from the root layout, over two pages:
 *
 *   /explore              a long grid of cards (links to the product), so
 *                         there is a page of ours behind the product
 *   /account/library      a list with the tab bar up (the product page has
 *                         none), to see the tab bar stay put
 *   /maker/preset-pack    a product shaped page: a sticky strip, a row that
 *                         scrolls sideways from the very edge, a gallery that
 *                         takes sideways moves itself (touch-action: pan-y),
 *                         and three switches that put up what the swipe must
 *                         leave alone: the real BottomSheet, a lightbox
 *                         (data-lightbox, as components/community/member/
 *                         lightbox.tsx marks itself) and the composer open in
 *                         place (data-composer="open", as composer.tsx does)
 *
 * The router is the probe's stub; window.__nav says where the visit starts.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { LocaleProvider } from "@/components/locale-provider"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { NativeChrome } from "@/components/platform/native-chrome"
import { AppHistoryTracker } from "@/components/platform/app-history-tracker"
import { EdgeSwipeBack } from "@/components/platform/edge-swipe-back"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { edgeSwipeEnvironment, edgeSwipeRouteAllowed, handledSideways, overlayUp, typing } from "@/lib/navigation/edge-swipe"
import { readBackEvidence } from "@/lib/navigation/go-back"
import { planBack } from "@/lib/navigation/back-plan"

/* For the probe: why a touch at a point would or would not start a swipe. */
;(window as unknown as Record<string, unknown>).__edgeWhy = (x: number, y: number) => ({
  env: edgeSwipeEnvironment(window),
  route: edgeSwipeRouteAllowed(location.pathname),
  plan: planBack(readBackEvidence(), null).kind,
  evidence: readBackEvidence(),
  overlay: overlayUp(document),
  typing: typing(document),
  sideways: handledSideways(document.elementFromPoint(x, y), window),
  target: (document.elementFromPoint(x, y) as HTMLElement | null)?.outerHTML.slice(0, 120) ?? null,
})

const HUES = [18, 42, 160, 200, 220, 260]

function Explore() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6" data-probe-page="explore">
      <h1 className="text-[28px] font-bold text-[#1a1a2e]">Discover</h1>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 24 }, (_, i) => (
          <a key={i} href="/maker/preset-pack" data-probe-card={i} className="block overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="aspect-[4/3]" style={{ background: `hsl(${HUES[i % HUES.length]} 35% 82%)` }} />
            <p className="p-3 text-[13px] text-[#1a1a2e]">Product {i + 1}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

/* A page of the library: the tab bar is up here, so the swipe has to leave it where it is. */
function Library() {
  return (
    <div className="mx-auto max-w-[640px] px-4 pb-8 pt-6" data-probe-page="library">
      <h1 className="text-[24px] font-bold text-[#1a1a2e]">Library</h1>
      <div className="mt-4 space-y-3">
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="h-12 w-12 rounded-lg" style={{ background: `hsl(${HUES[i % HUES.length]} 35% 82%)` }} />
            <p className="text-[14px] text-[#1a1a2e]">Purchase {i + 1}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Product() {
  const [sheet, setSheet] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [composer, setComposer] = useState(false)
  return (
    <div className="bg-white pb-10" data-probe-page="product">
      {/* A gallery that takes sideways moves itself, from the very edge. */}
      <div data-probe-gallery="" className="aspect-square w-full" style={{ touchAction: "pan-y", background: "linear-gradient(135deg, hsl(200 40% 80%), hsl(260 35% 82%))" }} />
      <div className="sticky top-[calc(65px+env(safe-area-inset-top,0px))] z-10 border-b border-[#eef0f3] bg-white px-4 py-3 text-[14px] font-semibold text-[#1a1a2e]" data-probe-sticky="">
        Preset pack · $19
      </div>
      <div className="space-y-3 px-4 pt-4">
        <div className="flex gap-2">
          <button type="button" data-probe-open="sheet" onClick={() => setSheet(true)} className="h-10 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px]">Sheet</button>
          <button type="button" data-probe-open="lightbox" onClick={() => setLightbox(true)} className="h-10 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px]">Lightbox</button>
          <button type="button" data-probe-open="composer" onClick={() => setComposer((v) => !v)} className="h-10 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px]">Composer</button>
        </div>
        {composer && (
          <div data-composer="open" className="rounded-2xl border border-[#e5e7eb] p-4 text-[14px]">
            <textarea className="h-24 w-full resize-none text-[16px] outline-none" placeholder="Share something..." />
          </div>
        )}
      </div>
      {/* A row that scrolls sideways, starting at the very edge. */}
      <div data-probe-hscroll="" className="mt-4 flex gap-3 overflow-x-auto py-2" style={{ scrollbarWidth: "none" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-[120px] w-[140px] shrink-0 rounded-xl" style={{ background: `hsl(${HUES[i % HUES.length]} 30% 86%)` }} />
        ))}
      </div>
      <div className="space-y-3 px-4 pt-4">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Description</h2>
        {Array.from({ length: 70 }, (_, i) => (
          <p key={i} className="text-[14px] text-[#6b7280]">Line {i + 1} of what is in the pack.</p>
        ))}
      </div>
      <BottomSheet isOpen={sheet} onClose={() => setSheet(false)} title="Share">
        <div className="p-6 text-[14px]" data-probe-sheet="">A sheet</div>
      </BottomSheet>
      {lightbox && (
        <div data-lightbox="" role="dialog" aria-modal="true" className="fixed inset-0 z-[300] bg-[#0b0c0f]/[0.94]" onClick={() => setLightbox(false)} />
      )}
    </div>
  )
}

function Page() {
  const path = usePathname() || "/explore"
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]">
      <ConditionalHeader onPlatformDomain buyerHeaderLight />
      <main className="flex-1" data-probe-path={path}>
        {path.startsWith("/explore") ? <Explore /> : path.startsWith("/account") ? <Library /> : <Product />}
      </main>
      <BuyerTabBar />
      <NativeChrome />
      <AppHistoryTracker />
      <EdgeSwipeBack />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <ExploreMarketplaceProvider exploreMarketplace buyerHeaderLight physicalCommerce={false}>
      <Page />
    </ExploreMarketplaceProvider>
  </LocaleProvider>,
)
