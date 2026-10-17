import type { Metadata } from "next"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { getServerTt } from "@/lib/i18n/server"
import { AppHelpFrame } from "@/components/help/app-help-frame"
import { AppHelpSearch } from "@/components/help/app-help-views"
import { APP_HELP_BASE } from "@/lib/help/paths"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Search") }
}

/** The Help Center's results as a page inside the dashboard (Enter in the field with nothing highlighted). */
export default async function AppHelpSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").slice(0, 200)
  const [{ tt }, physical] = await Promise.all([getServerTt(), isPhysicalCommerceEnabled()])
  return (
    <AppHelpFrame back={{ fallback: APP_HELP_BASE, label: tt("Back") }} title={<h1 className="truncate text-[20px] font-bold leading-7 text-[#1a1a2e] sm:text-[22px]">{tt("Search")}</h1>} subtitle={tt("Help")}>
      <AppHelpSearch q={q} physical={physical} />
    </AppHelpFrame>
  )
}
