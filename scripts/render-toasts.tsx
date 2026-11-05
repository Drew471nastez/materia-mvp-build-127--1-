/**
 * The real Toaster (components/ui/toaster.tsx) and the real nav pill
 * (components/app/sidebar-mobile-nav.tsx) in a shell with the same boxes as
 * app/(storelib)/app/layout.tsx: the phone header (68px under the status bar), the
 * desktop header (58px), the rail from md, and a page of cards. Toasts are
 * raised through the real `toast()` (hooks/use-toast.ts), the way every page
 * raises them. Bundled by scripts/check-toasts.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner"
import { Toaster } from "@/components/ui/toaster"
import { EditorToaster } from "@/components/ui/editor-toaster"
import { toast } from "@/hooks/use-toast"
import { MobileNavPill } from "@/components/app/sidebar-mobile-nav"
import { NAV_ICONS, NAV_ICONS_EXTRA } from "@/components/app/sidebar-desktop-nav"

;(window as unknown as Record<string, unknown>).__toast = toast

function Shell() {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
      <header data-probe-header="" className="fixed left-0 right-0 top-0 z-50 hidden pt-[env(safe-area-inset-top,_0px)] md:block">
        <div className="h-[58px] bg-[#131316]" />
      </header>
      <header data-probe-header="" className="fixed left-0 right-0 top-0 z-50 bg-[#111111] md:hidden" style={{ height: "calc(68px + env(safe-area-inset-top, 0px))" }} />
      <aside className="fixed left-0 top-[58px] z-40 hidden h-[calc(100svh-58px)] w-[240px] bg-white md:block" />
      <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
        <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
          <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
            <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Payouts</h1>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
            ))}
          </div>
        </div>
      </main>
      <MobileNavPill
        menuOpen={false}
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        onNavigate={() => {}}
        icons={{
          home: NAV_ICONS.dashboard,
          orders: NAV_ICONS.orders,
          products: NAV_ICONS.products,
          analytics: NAV_ICONS.analytics,
          settings: NAV_ICONS_EXTRA.settings,
        }}
      />
      <Toaster />
    </div>
  )
}

/**
 * ?editor=1: the website builder's editor instead, full screen with no pill,
 * and its sonner toasts through the real EditorToaster. ?plain=1 as well: the
 * bare `<Toaster position="bottom-right" />` it had before, for the numbers.
 */
function Editor() {
  const plain = new URLSearchParams(location.search).has("plain")
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <div className="h-12 bg-[#171717]" />
      <div className="p-4 font-mono text-[13px] text-[#6b7280]">{"{% schema %}"}</div>
      {plain ? <SonnerToaster position="bottom-right" /> : <EditorToaster />}
    </div>
  )
}
;(window as unknown as Record<string, unknown>).__sonner = sonnerToast

createRoot(document.getElementById("app")!).render(new URLSearchParams(location.search).has("editor") ? <Editor /> : <Shell />)
