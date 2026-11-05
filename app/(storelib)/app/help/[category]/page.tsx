import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { helpCategory, helpVisible } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { getServerTt } from "@/lib/i18n/server"
import { AppHelpFrame } from "@/components/help/app-help-frame"
import { AppHelpTopic } from "@/components/help/app-help-views"
import { APP_HELP_BASE } from "@/lib/help/paths"

interface PageProps {
  params: Promise<{ category: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params
  const { tt } = await getServerTt()
  return { title: helpCategory(category)?.title ?? tt("Help") }
}

/** A topic of the Help Center inside the dashboard: the same as /help/<topic>, in the app's frame. */
export default async function AppHelpTopicPage({ params }: PageProps) {
  const { category: slug } = await params
  const [{ tt }, physical] = await Promise.all([getServerTt(), isPhysicalCommerceEnabled()])
  const category = helpCategory(slug)
  if (!category || !helpVisible(category, physical)) notFound()
  return (
    <AppHelpFrame
      back={{ fallback: APP_HELP_BASE, label: tt("Back") }}
      title={<h1 className="truncate text-[20px] font-bold leading-7 text-[#1a1a2e] sm:text-[22px]">{category.title}</h1>}
      subtitle={tt("Help")}
    >
      <AppHelpTopic category={category} physical={physical} />
    </AppHelpFrame>
  )
}
