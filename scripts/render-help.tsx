/**
 * The Help Center's real pages, rendered in a browser: the index, a category,
 * two articles (one with tables) and the search page. The page functions are
 * called as they are on the server and what they return is mounted, so the
 * markup measured is the markup that ships. Bundled and driven by
 * scripts/check-help.mjs; the page to draw is the location hash.
 */
import { createRoot } from "react-dom/client"
import type { ReactNode } from "react"

import HelpPage from "@/app/(storelib)/help/page"
import HelpCategoryPage from "@/app/(storelib)/help/[category]/page"
import HelpArticlePage from "@/app/(storelib)/help/[category]/[article]/page"
import HelpSearchPage from "@/app/(storelib)/help/search/page"

async function page(which: string): Promise<ReactNode> {
  const [kind, a, b] = which.split("/")
  if (kind === "category") return HelpCategoryPage({ params: Promise.resolve({ category: a }) })
  if (kind === "article") return HelpArticlePage({ params: Promise.resolve({ category: a, article: b }) })
  if (kind === "search") return HelpSearchPage({ searchParams: Promise.resolve({ q: decodeURIComponent(a ?? "") }) })
  return HelpPage()
}

const which = location.hash.slice(1) || "index"
page(which).then((node) => {
  createRoot(document.getElementById("app")!).render(<main className="flex-1">{node}</main>)
  ;(window as unknown as { __ready: boolean }).__ready = true
})
