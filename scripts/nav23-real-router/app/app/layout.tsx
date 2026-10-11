import type React from "react"
import { AppSidebar } from "@/components/app/sidebar"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { serverDelay } from "../../fix/delay"
export const dynamic = "force-dynamic"
/* The real /app shell (app/app/layout.tsx) without its reads: the same wrapper, rail, main, scroller and sheet slot. */
export default async function AppLayout({ children, sheet }: { children: React.ReactNode; sheet: React.ReactNode }) {
  await serverDelay("shell", 150)
  return (
    <AppLayoutWrapper>
      <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
        <AppSidebar creatorSlug="sam" username="sam" storePublished avatarUrl={undefined} displayName="Sam Carter" stripeConnected stripeStatus="complete" onePagePublished setupProgress={{ completed: 3, total: 7 }} businesses={[]} communitiesEnabled={false} />
        <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content">
          <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
            {children}
          </div>
        </main>
        {sheet}
      </div>
    </AppLayoutWrapper>
  )
}
