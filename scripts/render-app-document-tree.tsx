/**
 * AN /app PAGE AS A DOCUMENT: the tree the server renders to HTML and the
 * browser hydrates, for scripts/check-website-arrival.mjs.
 *
 * The /app layout's client wrapper (components/app/app-layout-wrapper.tsx,
 * with LanguageProvider and its fallback) around a shell shaped like
 * app/(storelib)/app/layout.tsx and the real Website page. `before` is the wrapper as
 * it was: LanguageProvider with nothing to show until its effect has run.
 */
import React from "react"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { LanguageProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"

const T = "2026-09-25T12:00:00.000Z"
const INSTALLS: WebsiteSummary[] = [
  {
    id: "live-1",
    name: "Northwind",
    status: "published",
    theme_id: "storelib-default",
    created_at: T,
    updated_at: T,
    published_at: T,
    snapshot_url: "/covers/live-1-v1.webp",
    snapshot_mobile_url: null,
    snapshot_updated_at: "2026-09-25T12:05:00.000Z",
    saved_at: T,
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  },
]

function Shell() {
  return (
    <TooltipProvider>
      <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
        <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
        <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
            <div data-page="website" className="h-full">
              <WebsiteBuilderClient installs={INSTALLS} username="northwind" />
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

export function DocumentTree({ before }: { before: boolean }) {
  if (before) return <LanguageProvider><Shell /></LanguageProvider>
  return (
    <AppLayoutWrapper>
      <Shell />
    </AppLayoutWrapper>
  )
}
