import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { WebsitePage } from "./website-page"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Website"),
  }
}

/**
 * /app/website-builder: the live website, the library, and Browse themes
 * with the theme marketplace as a popup over it (?themes=1 opens it). Who
 * may see it, and everything it reads, is ./website-page.tsx.
 */
export default function WebsiteBuilderPage() {
  return WebsitePage({})
}
