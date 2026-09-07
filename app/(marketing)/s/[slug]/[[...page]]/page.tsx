/**
 * A published Storelib Site.
 *
 * Reached three ways, all of which land here:
 *   /s/{slug}                     — the canonical path
 *   {slug}.storelib.site/...      — rewritten by proxy.ts
 *   a connected custom domain     — resolved by the existing domain logic
 *
 * STATIC-FIRST, and that is the difference between this route and
 * `/w/{username}`. The storefront renders per viewer — it has an Edit button,
 * owner menus and a follow state — so it is `force-dynamic` and deliberately
 * uncacheable. A published Site is the same bytes for everybody: it can be
 * prerendered and served from the edge, which is what makes hosting other
 * people's websites affordable.
 *
 * `dynamicParams` is what keeps that true without prerendering every site in
 * the world at build time: the busiest few hundred are built ahead, the rest
 * are rendered on first request and cached from then on.
 *
 * NO EDITOR CODE REACHES THIS FILE. The brief calls that out and it is real:
 * the editor is a large client bundle and `SectionRenderer` is not. Importing
 * one editor component here would ship it to every visitor of every site.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageSections } from "@/components/website-builder/sections/PageSections"
import { SiteBranding } from "@/components/sites/site-branding"
import { getPublishedSitePage, getPublishedSiteSlugs } from "@/lib/sites/queries"
import { siteLimits } from "@/lib/sites/plan"
import { creatorSitePlan } from "@/lib/sites/plan-server"

export const revalidate = 300
export const dynamicParams = true

interface RouteProps {
  params: Promise<{ slug: string; page?: string[] }>
}

export async function generateStaticParams() {
  const slugs = await getPublishedSiteSlugs()
  // Homepages only. A deep page is rendered on first request and cached — it
  // is not worth a build slot until somebody asks for it.
  return slugs.map((slug) => ({ slug, page: [] }))
}

/**
 * One page's key from the catch-all.
 *
 * `[[...page]]` gives `undefined` for the homepage and `["about"]` for a page.
 * Anything deeper — `/s/x/a/b` — is not a page: pages are one segment, because
 * `page_key` is one column and there is no hierarchy behind it. Treating a
 * two-segment path as `a` would serve the wrong page under a URL that will end
 * up shared and indexed.
 */
function pageKeyFrom(segments?: string[]): { key?: string; tooDeep: boolean } {
  if (!segments || segments.length === 0) return { tooDeep: false }
  if (segments.length > 1) return { tooDeep: true }
  return { key: decodeURIComponent(segments[0]).toLowerCase(), tooDeep: false }
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug, page } = await params
  const { key, tooDeep } = pageKeyFrom(page)
  if (tooDeep) return { title: "Not found" }

  const data = await getPublishedSitePage(slug, key)
  if (!data) return { title: "Not found" }

  const { site, page: current } = data
  // Page SEO wins over site SEO wins over the page's own title. A creator who
  // fills in one field should not have to fill in all of them.
  const title = current.seo.title || site.settings.seo?.title || `${current.title} — ${site.name}`
  const description = current.seo.description || site.settings.seo?.description
  const image = current.seo.socialImageUrl || site.settings.seo?.socialImageUrl

  return {
    title,
    description,
    // A page marked noindex must not be advertised anywhere else either.
    robots: current.seo.noindex ? { index: false, follow: false } : undefined,
    icons: site.settings.faviconUrl ? { icon: site.settings.faviconUrl } : undefined,
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined,
      type: "website",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function SitePage({ params }: RouteProps) {
  const { slug, page } = await params
  const { key, tooDeep } = pageKeyFrom(page)
  if (tooDeep) notFound()

  const data = await getPublishedSitePage(slug, key)
  if (!data) notFound()

  const { site, theme, page: current } = data

  /**
   * BRANDING IS A PLAN DECISION, NOT A SETTING.
   *
   * `settings.hideBranding` is creator-writable, so honouring it alone would
   * make a paid feature a checkbox. The plan is read here, on the server,
   * where the creator cannot reach it.
   */
  const plan = await creatorSitePlan(site.creatorId)
  const showBranding = !(siteLimits(plan).removeBranding && site.settings.hideBranding)

  return (
    <div
      lang={site.settings.language || undefined}
      style={{
        backgroundColor: String(theme.background_color ?? "#ffffff"),
        fontFamily: String(theme.font_body ?? "Inter"),
        color: String(theme.text_color ?? "#0f172a"),
      }}
    >
      {theme.announcement_bar_enabled && theme.announcement_bar_text ? (
        <div
          className="w-full py-2 text-center text-sm font-medium"
          style={{
            background: String(theme.announcement_bar_bg ?? "#6366f1"),
            color: String(theme.announcement_bar_color ?? "#ffffff"),
          }}
        >
          {String(theme.announcement_bar_text)}
        </div>
      ) : null}

      <PageSections
        sections={current.sections}
        theme={theme}
        emptyTitle="This page is being set up"
        emptyDetail="Check back soon."
      />

      {showBranding && <SiteBranding textColor={String(theme.text_secondary_color ?? "")} />}
    </div>
  )
}
