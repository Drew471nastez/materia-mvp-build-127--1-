/**
 * ===========================================================================
 *  ONE PAGE OF THE STORELIB DEVELOPER HUB
 * ===========================================================================
 * The layout docs readers already know from Shopify's, Stripe's and Vercel's:
 * the hub's pages down the left, the page in the middle at a width a line of
 * prose can be read at, and the page's own headings on the right. Drawn in
 * the marketing site's own palette, under its own header and footer, so it
 * reads as part of storelib.com rather than as a separate product.
 *
 * Everything here renders on the server. The only script is the copy button
 * on a code sample and the mark that follows the heading being read.
 */
import Link from "next/link"
import type { Metadata } from "next"

import { DEVELOPER_DOCS } from "@/lib/developers/content.generated"
import { expandAll } from "@/lib/developers/directives"
import { outlineOf, parseMarkdown } from "@/lib/developers/markdown"
import {
  DEV_GROUPS,
  DEV_PAGES,
  FRAMEWORK_NAME,
  HUB_NAME,
  SITE_ORIGIN,
  devNeighbours,
  devPage,
  devPath,
} from "@/lib/developers/pages"

import { DocContent } from "./doc-content"
import { Toc } from "./toc"
import { jsonLdScript } from "@/lib/seo/json-ld"

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
    keywords: ["Storelib", FRAMEWORK_NAME, "website builder", "sections", ".storelib", "theme development", "Liquid", "AI agents", "llms.txt"],
  }
}

function SideNav({ current }: { current: string }) {
  return (
    <nav aria-label={HUB_NAME} className="space-y-7">
      {DEV_GROUPS.map((group) => (
        <div key={group}>
          <p className="text-[12px] font-semibold text-neutral-900">{group}</p>
          <ul className="mt-2.5 space-y-0.5 border-l border-neutral-200">
            {DEV_PAGES.filter((p) => p.group === group).map((p) => {
              const on = p.slug === current
              return (
                <li key={p.slug}>
                  <Link
                    href={devPath(p.slug)}
                    aria-current={on ? "page" : undefined}
                    className={`-ml-px block border-l py-1.5 pl-3 text-[14px] leading-[1.4] transition-colors ${
                      on ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900"
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
        <p className="text-[12px] font-semibold text-neutral-900">For AI agents</p>
        <ul className="mt-2.5 space-y-0.5 border-l border-neutral-200">
          {[
            ["/llms.txt", "llms.txt"],
            ["/llms-full.txt", "llms-full.txt"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="-ml-px block border-l border-transparent py-1.5 pl-3 font-mono text-[13px] text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
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
  it, and every heading is offset the same way so following a link to one
  does not land it under the header.
*/
export function HubPage({ slug }: { slug: string }) {
  const page = devPage(slug)
  const src = DEVELOPER_DOCS[slug]
  if (!page || src === undefined) return null

  const nodes = expandAll(parseMarkdown(src))
  const outline = outlineOf(nodes)
  const { prev, next } = devNeighbours(slug)

  return (
    <div className="w-full bg-white">
      <JsonLd slug={slug} />
      <div className="mx-auto flex max-w-[1320px] gap-10 px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <aside className="hidden w-[232px] shrink-0 lg:block">
          <div className="sticky top-[92px] max-h-[calc(100svh-116px)] overflow-y-auto pb-6 pr-2 [scrollbar-width:thin]">
            <Link href={devPath("")} className="mb-7 block">
              <span className="block text-[15px] font-semibold text-neutral-900">{HUB_NAME}</span>
              <span className="mt-0.5 block text-[13px] text-neutral-500">{FRAMEWORK_NAME}</span>
            </Link>
            <SideNav current={slug} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[760px]">
            {/* On a phone the hub's pages fold into one control above the page. */}
            <details className="group mb-8 rounded-xl border border-neutral-200 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-[12px] text-neutral-500">{HUB_NAME}</span>
                  <span className="block truncate text-[15px] font-medium text-neutral-900">{page.nav}</span>
                </span>
                <span aria-hidden className="text-neutral-400 transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <div className="border-t border-neutral-200 px-4 py-5">
                <SideNav current={slug} />
              </div>
            </details>

            {/* Desktop only: on a phone the menu above already says where you are. */}
            <nav aria-label="Breadcrumb" className="mb-4 hidden flex-wrap items-center gap-x-2 text-[13px] text-neutral-500 lg:flex">
              <Link href={devPath("")} className="transition-colors hover:text-neutral-900">{HUB_NAME}</Link>
              {slug && (
                <>
                  <span aria-hidden>/</span>
                  <span className="text-neutral-900">{page.nav}</span>
                </>
              )}
            </nav>

            <article>
              <DocContent nodes={nodes} />
            </article>

            {(prev || next) && (
              <nav aria-label="Previous and next" className="mt-16 grid gap-4 border-t border-neutral-200 pt-8 sm:grid-cols-2">
                {prev ? (
                  <Link href={devPath(prev.slug)} className="group rounded-xl px-1 py-2">
                    <span className="block text-[13px] text-neutral-500">Previous</span>
                    <span className="mt-1 block text-[16px] font-medium text-neutral-900 group-hover:underline group-hover:underline-offset-4">{prev.nav}</span>
                  </Link>
                ) : <span />}
                {next && (
                  <Link href={devPath(next.slug)} className="group rounded-xl px-1 py-2 sm:text-right">
                    <span className="block text-[13px] text-neutral-500">Next</span>
                    <span className="mt-1 block text-[16px] font-medium text-neutral-900 group-hover:underline group-hover:underline-offset-4">{next.nav}</span>
                  </Link>
                )}
              </nav>
            )}
          </div>
        </main>

        <aside className="hidden w-[208px] shrink-0 xl:block">
          <div className="sticky top-[92px] max-h-[calc(100svh-116px)] overflow-y-auto pb-6 [scrollbar-width:thin]">
            <Toc items={outline} />
          </div>
        </aside>
      </div>
    </div>
  )
}
