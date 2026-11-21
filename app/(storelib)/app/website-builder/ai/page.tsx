import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { WebsitePage } from "../website-page"

/**
 * /app/website-builder/ai: the Website page with Create a website at the top
 * (Start with AI in both modes, and Start from blank), as that page had it.
 *
 * Reached by its address only. Nothing in the app links here, it is in no
 * menu, search or sitemap, and it asks not to be indexed. It is the same
 * page behind the same check as /app/website-builder (../website-page.tsx):
 * a signed out visitor or a team member without Website gets what they get
 * there.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Website"),
    robots: { index: false, follow: false },
  }
}

export default function WebsiteBuilderAiPage() {
  return WebsitePage({ create: true })
}
