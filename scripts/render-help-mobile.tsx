/**
 * The Help Center on a phone and the account menu that opens it, for
 * scripts/check-help-mobile.mjs.
 *
 *   /shell       the real /app shell (scripts/render-business-switch-tree
 *                OldTree: the real AppSidebar, its desktop account dropdown
 *                and its phone account sheet)
 *   /help#<page> a Help Center page as app/help/layout.tsx draws it: the real
 *                Storelib header (ConditionalHeader) over the page, the page
 *                function called as the server calls it and what it returns
 *                mounted. <page> is index, category/<slug>,
 *                article/<category>/<slug>, search/<words> or questions.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import type { ReactNode } from "react"
import { OldTree } from "./render-business-switch-tree"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { LocaleProvider } from "@/components/locale-provider"
import { SWRProvider } from "@/lib/swr-config"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import HelpPage from "@/app/help/page"
import HelpCategoryPage from "@/app/help/[category]/page"
import HelpArticlePage from "@/app/help/[category]/[article]/page"
import HelpSearchPage from "@/app/help/search/page"
import HelpQuestionsPage from "@/app/help/questions/page"

async function page(which: string): Promise<ReactNode> {
  const [kind, a, b] = which.split("/")
  if (kind === "category") return HelpCategoryPage({ params: Promise.resolve({ category: a }) })
  if (kind === "article") return HelpArticlePage({ params: Promise.resolve({ category: a, article: b }) })
  if (kind === "search") return HelpSearchPage({ searchParams: Promise.resolve({ q: decodeURIComponent(a ?? "") }) })
  if (kind === "questions") return HelpQuestionsPage()
  return HelpPage()
}

const root = createRoot(document.getElementById("app")!)
const w = window as unknown as { __ready: boolean }

if (location.pathname === "/shell") {
  root.render(<OldTree />)
  w.__ready = true
} else {
  page(location.hash.slice(1) || "index").then((node) => {
    root.render(
      <SWRProvider>
        <LocaleProvider>
          <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight physicalCommerce>
            {/* app/help/layout.tsx, with the light bar */}
            <div className="flex min-h-svh flex-col overflow-x-clip">
              <ConditionalHeader buyerHeaderLight />
              <main className="flex-1">{node}</main>
            </div>
          </PlatformSettingsProvider>
        </LocaleProvider>
      </SWRProvider>,
    )
    w.__ready = true
  })
}
