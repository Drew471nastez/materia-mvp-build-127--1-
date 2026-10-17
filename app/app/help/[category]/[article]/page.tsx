import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { HELP_MOVED, helpArticle, helpCategory, helpVisible } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { getServerTt } from "@/lib/i18n/server"
import { AppHelpFrame } from "@/components/help/app-help-frame"
import { AppHelpArticle, appTopicPath } from "@/components/help/app-help-views"
import { APP_HELP_BASE } from "@/lib/help/paths"

interface PageProps {
  params: Promise<{ category: string; article: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, article } = await params
  const { tt } = await getServerTt()
  return { title: helpArticle(category, article)?.title ?? tt("Help") }
}

/**
 * One article inside the dashboard: the same as /help/<topic>/<article>, in
 * the app's frame. The bar names the topic (the article's own title is the
 * page's heading) and its back returns to the list or the search it was
 * opened from, or goes up to the topic with nothing behind it.
 */
export default async function AppHelpArticlePage({ params }: PageProps) {
  const { category: categorySlug, article: slug } = await params
  const moved = HELP_MOVED[`${categorySlug}/${slug}`]
  if (moved) permanentRedirect(`${APP_HELP_BASE}/${moved}`)
  const [{ tt }, physical] = await Promise.all([getServerTt(), isPhysicalCommerceEnabled()])
  const article = helpArticle(categorySlug, slug)
  const category = helpCategory(categorySlug)
  if (!article || !category || !helpVisible(category, physical)) notFound()
  return (
    <AppHelpFrame
      back={{ fallback: appTopicPath(category.slug), label: tt("Back") }}
      title={<p className="truncate text-[16px] font-semibold leading-6 text-[#1a1a2e]">{category.title}</p>}
      subtitle={tt("Help")}
    >
      <AppHelpArticle article={article} category={category} />
    </AppHelpFrame>
  )
}
