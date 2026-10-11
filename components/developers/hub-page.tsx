/**
 * ===========================================================================
 *  ONE PAGE OF THE STORELIB DEVELOPER HUB
 * ===========================================================================
 * The layout docs readers already know from Shopify's, Stripe's and Vercel's:
 * the hub's pages down the left in their categories, the page in the middle
 * at a width a line of prose can be read at, and the page's own headings on
 * the right. Drawn in Storelib's own palette (the #1a1a2e the builder's
 * primary actions use, #e5e7eb hairlines, Inter), under the marketing site's
 * header and footer, so it reads as part of storelib.com.
 *
 * ON A PHONE, AND A TABLET HELD UPRIGHT, the two side columns do not fit,
 * so they become the hub's own bar: stuck under the site header, with the
 * page list on the left and "On this page" on the right, each a <details>
 * that opens a sheet of links under the bar. Without script they still open
 * and close; with it (./hub-menus) a link or a tap outside closes them. From
 * 1024 the page list is back on the left and the bar is gone; the outline
 * comes back on the right at 1280.
 *
 * Everything here renders on the server. The only script is the copy button
 * on a code sample, the mark that follows the heading being read, and the
 * menus' finishing touches.
 */
import Link from "next/link"
import type { Metadata } from "next"
import { ChevronDown } from "lucide-react"

import { DEVELOPER_DOCS } from "@/lib/developers/content.generated"
import { expandAll } from "@/lib/developers/directives"
import { outlineOf, parseMarkdown } from "@/lib/developers/markdown"
import {
  DEV_GROUPS,
  FRAMEWORK_NAME,
  HUB_NAME,
  SITE_ORIGIN,
  devNeighbours,
  devPage,
  devPagesIn,
  devPath,
  type DevPage,
} from "@/lib/developers/pages"

import { DocContent } from "./doc-content"
import { HubMenus } from "./hub-menus"
import { Toc } from "./toc"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { MONO } from "./type"

export function devMetadata(slug: string): Metadata {
  const page = devPage(slug)
  if (!page) return {}
  const path = devPath(slug)
  const title = slug ? `${page.title} | ${HUB_NAME}` : HUB_NAME
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: path },
    openGraph: { title, description: page.description, type: "article", url: path, siteName: "Storelib" },
    twitter: { card: "summary", title, description: page.description },
    keywords: ["Storelib", FRAMEWORK_NAME, "website builder", "sections", ".storelib", "theme development", "theme templates", "AI agents", "llms.txt"],
  }
}

/**
 * Every page, in its category. `touch` is the phone's sheet, where each link
 * is a 40px row a thumb can land on; on a computer the rows are tighter.
 */
function SideNav({ current, touch = false }: { current: string; touch?: boolean }) {
  const row = touch ? "min-h-10 py-2 text-[15px]" : "min-h-8 py-1.5 text-[14px]"
  return (
    <nav aria-label={HUB_NAME} className="space-y-6">
      {DEV_GROUPS.map((group) => (
        <div key={group}>
          <p className="px-2.5 text-[13px] font-semibold text-[#1a1a2e]">{group}</p>
          <ul className="mt-1.5 space-y-px">
            {devPagesIn(group).map((p) => {
              const on = p.slug === current
              return (
                <li key={p.slug}>
                  <Link
                    href={devPath(p.slug)}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center rounded-lg px-2.5 leading-[1.35] transition-colors ${row} ${
                      on ? "bg-[#f1f2f4] font-medium text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f8f9fa] hover:text-[#1a1a2e]"
                    }`}
                  >
                    {p.nav}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div>
        <p className="px-2.5 text-[13px] font-semibold text-[#1a1a2e]">For AI agents</p>
        <ul className="mt-1.5 space-y-px">
          {[
            ["/llms.txt", "llms.txt"],
            ["/llms-full.txt", "llms-full.txt"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className={`flex items-center rounded-lg px-2.5 text-[#4b5563] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e] ${row} ${MONO} ${touch ? "text-[14px]" : "text-[13px]"}`}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

/** "On this page", as the phone's sheet draws it: every heading a 40px row. */
function OutlineList({ items }: { items: { id: string; text: string; level: 2 | 3 }[] }) {
  return (
    <nav aria-label="On this page">
      <ul className="space-y-px">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={`flex min-h-10 items-center rounded-lg py-2 pr-2.5 leading-[1.35] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e] ${
                i.level === 3 ? "pl-6 text-[14px] text-[#4b5563]" : "pl-2.5 text-[15px] font-medium text-[#1a1a2e]"
              }`}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

const summaryClass =
  "flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 text-[14px] text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa] group-open:bg-[#f1f2f4] [&::-webkit-details-marker]:hidden"
const panelClass =
  "absolute inset-x-0 top-full max-h-[calc(100svh-var(--hub-top,65px)-3.5rem)] overflow-y-auto overscroll-contain border-b border-[#e5e7eb] bg-white px-3 pb-6 pt-3 shadow-[0_16px_32px_-16px_rgba(26,26,46,0.22)] sm:px-5"

/**
 * THE BAR UNDER THE SITE HEADER, below 1024px. Sticky by the header's own
 * measured height (`--hub-top`, set by ./hub-menus), with 65px as the
 * phone's header until that has run.
 */
function PhoneBar({ page, outline }: { page: DevPage; outline: { id: string; text: string; level: 2 | 3 }[] }) {
  const current = page.slug
  return (
    <div data-hub-bar className="sticky top-[var(--hub-top,65px)] z-30 border-b border-[#e5e7eb] bg-white lg:hidden">
      <div className="relative mx-auto flex h-12 max-w-[1320px] items-center justify-between gap-2 px-2 sm:px-4">
        <details name="hub-menu" data-hub-menu="pages" className="group min-w-0">
          <summary className={summaryClass} aria-label={`${HUB_NAME} pages. This page: ${page.nav}`}>
            {/* The category too where there is room for it; on a phone the page's own name comes first. */}
            <span className="hidden shrink-0 text-[#6b7280] sm:inline">{current ? page.group : "Developer Hub"}</span>
            <span aria-hidden className="hidden shrink-0 text-[#d1d5db] sm:inline">/</span>
            <span className="min-w-0 truncate font-medium">{current ? page.nav : "Developer Hub"}</span>
            <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-200 group-open:rotate-180" strokeWidth={1.75} />
          </summary>
          <div data-hub-panel className={panelClass}>
            <Link href={devPath("")} className="mb-4 flex min-h-10 flex-col justify-center rounded-lg px-2.5">
              <span className="text-[15px] font-semibold text-[#1a1a2e]">{HUB_NAME}</span>
              <span className="text-[13px] text-[#6b7280]">{FRAMEWORK_NAME}</span>
            </Link>
            <SideNav current={current} touch />
          </div>
        </details>
        {outline.length > 0 && (
          <details name="hub-menu" data-hub-menu="outline" className="group shrink-0">
            <summary className={summaryClass}>
              <span className="font-medium">On this page</span>
              <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-200 group-open:rotate-180" strokeWidth={1.75} />
            </summary>
            <div data-hub-panel className={panelClass}>
              <OutlineList items={outline} />
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

/** Structured data: what this page is, and where it sits in the hub. */
function JsonLd({ slug }: { slug: string }) {
  const page = devPage(slug)
  if (!page) return null
  const url = `${SITE_ORIGIN}${devPath(slug)}`
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.title,
      description: page.description,
      url,
      inLanguage: "en",
      about: FRAMEWORK_NAME,
      isPartOf: { "@type": "WebSite", name: HUB_NAME, url: `${SITE_ORIGIN}${devPath("")}` },
      publisher: { "@type": "Organization", name: "Storelib", url: SITE_ORIGIN },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Storelib", item: SITE_ORIGIN },
        { "@type": "ListItem", position: 2, name: HUB_NAME, item: `${SITE_ORIGIN}${devPath("")}` },
        ...(slug ? [{ "@type": "ListItem", position: 3, name: page.title, item: url }] : []),
      ],
    },
  ]
  /* `<` escaped so no string in the data can close the script element. */
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
}

/*
  THE SITE HEADER IS STICKY, about 71px on a desktop and 65 on a phone. The
  two side columns stick 92px down so they sit under it rather than behind
  it; below 1024px the hub's own bar sticks at the header's measured height,
  and every heading is offset by both, so following a link to one does not
  land it under either.
*/
export function HubPage({ slug }: { slug: string }) {
  const page = devPage(slug)
  const src = DEVELOPER_DOCS[slug]
  if (!page || src === undefined) return null

  const nodes = expandAll(parseMarkdown(src))
  const outline = outlineOf(nodes)
  const { prev, next } = devNeighbours(slug)

  return (
    <div data-hub-root className="w-full bg-white text-[#1a1a2e]">
      <JsonLd slug={slug} />
      <HubMenus />
      <PhoneBar page={page} outline={outline} />

      <div className="mx-auto flex max-w-[1320px] gap-10 px-4 pb-24 pt-7 sm:px-6 lg:gap-12 lg:px-8 lg:pt-10">
        <aside data-hub-side className="hidden w-[232px] shrink-0 lg:block">
          <div className="sticky top-[92px] -ml-2.5 max-h-[calc(100svh-116px)] overflow-y-auto pb-8 pr-2 [scrollbar-width:thin]">
            <Link href={devPath("")} className="mb-6 block rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[#f8f9fa]">
              <span className="block text-[15px] font-semibold text-[#1a1a2e]">{HUB_NAME}</span>
              <span className="mt-0.5 block text-[13px] text-[#6b7280]">{FRAMEWORK_NAME}</span>
            </Link>
            <SideNav current={slug} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[760px]">
            {/* Where you are. On a phone the bar above already says so, and on the front page the title does. */}
            {slug && (
              <nav aria-label="Breadcrumb" className="mb-3 hidden flex-wrap items-center gap-x-2 text-[13px] text-[#6b7280] lg:flex">
                <Link href={devPath("")} className="transition-colors hover:text-[#1a1a2e]">{HUB_NAME}</Link>
                <span aria-hidden className="text-[#d1d5db]">/</span>
                <span>{page.group}</span>
                <span aria-hidden className="text-[#d1d5db]">/</span>
                <span className="text-[#1a1a2e]">{page.nav}</span>
              </nav>
            )}

            <article>
              <DocContent nodes={nodes} />
            </article>

            {(prev || next) && (
              <nav aria-label="Previous and next" className="mt-16 grid gap-3 border-t border-[#e5e7eb] pt-8 sm:grid-cols-2">
                {prev ? (
                  <Link href={devPath(prev.slug)} className="flex min-h-[68px] flex-col justify-center rounded-xl border border-[#e5e7eb] px-4 py-3 transition-colors hover:border-[#d1d5db] hover:bg-[#f8f9fa]">
                    <span className="text-[13px] text-[#6b7280]">Previous</span>
                    <span className="mt-0.5 text-[15px] font-medium text-[#1a1a2e]">{prev.nav}</span>
                  </Link>
                ) : <span className="hidden sm:block" />}
                {next && (
                  <Link href={devPath(next.slug)} className="flex min-h-[68px] flex-col justify-center rounded-xl border border-[#e5e7eb] px-4 py-3 transition-colors hover:border-[#d1d5db] hover:bg-[#f8f9fa] sm:items-end sm:text-right">
                    <span className="text-[13px] text-[#6b7280]">Next{next.group !== page.group ? `, in ${next.group}` : ""}</span>
                    <span className="mt-0.5 text-[15px] font-medium text-[#1a1a2e]">{next.nav}</span>
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>

        <aside data-hub-toc className="hidden w-[208px] shrink-0 xl:block">
          <div className="sticky top-[92px] max-h-[calc(100svh-116px)] overflow-y-auto pb-8 [scrollbar-width:thin]">
            <Toc items={outline} />
          </div>
        </aside>
      </div>
    </div>
  )
}
