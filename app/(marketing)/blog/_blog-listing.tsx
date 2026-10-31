import Link from "next/link"
import type { ReactNode } from "react"
import { STORELIB_CATEGORIES } from "@/lib/blog-categories"
import { blogPagePath, type BlogPost } from "@/lib/blog/listing"
import { blogCategoryPath } from "@/lib/blog/article"
import { PostCard, PostCover, shortDate } from "./_components/post-card"

export type { BlogPost }

/**
 * THE BLOG'S LISTS: the index (/blog, /blog/page/N) and a category
 * (/blog/category/<slug>, /page/N). A title and its line, the categories as
 * a row of plain links (the current one underlined), the newest post drawn
 * large on the index's first page, then the rest three to a row, each a real
 * <a href>. Pages are real links too, numbered, with rel prev and next: no
 * infinite scroll, so a crawler that runs no script reaches every post.
 */
export default function BlogListing({
  posts,
  activeCategory,
  title,
  subtitle,
  pagination,
  pagePath = blogPagePath,
  featured = false,
}: {
  posts: BlogPost[]
  activeCategory: string | null
  title: string
  subtitle: string
  /** This list's page and how many there are (lib/blog/listing blogPage). */
  pagination?: { page: number; pages: number }
  /** The address of page N of this list. */
  pagePath?: (page: number) => string
  /** Draw the first post large (the index's first page). */
  featured?: boolean
}) {
  const [lead, ...rest] = featured ? posts : [null, ...posts]
  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <header className="max-w-[760px]">
          {activeCategory ? (
            <nav aria-label="Breadcrumb" className="mb-6 text-[14px] text-[#6b7280]">
              <ol className="flex items-center gap-2">
                <li>
                  <Link href="/blog" className="hover:text-[#1a1a2e]">
                    Blog
                  </Link>
                </li>
                <li aria-hidden className="text-[#c4c7cd]">
                  /
                </li>
                <li aria-current="page" className="text-[#1a1a2e]">
                  {activeCategory}
                </li>
              </ol>
            </nav>
          ) : null}
          <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#1a1a2e] sm:text-[64px]">{title}</h1>
          <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-[#4b5563] sm:text-[19px]">{subtitle}</p>
        </header>

        <nav aria-label="Blog categories" className="-mx-4 mt-10 overflow-x-auto border-b border-[#e5e7eb] px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" data-blog-categories="">
          <ul className="flex min-w-max gap-6 sm:gap-7">
            <li>
              <CategoryLink href="/blog" active={!activeCategory}>
                All
              </CategoryLink>
            </li>
            {STORELIB_CATEGORIES.map((cat) => (
              <li key={cat}>
                <CategoryLink href={blogCategoryPath(cat)} active={activeCategory === cat}>
                  {cat}
                </CategoryLink>
              </li>
            ))}
          </ul>
        </nav>

        {posts.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[18px] font-medium text-[#1a1a2e]">No articles in {activeCategory ?? "the blog"} yet.</p>
            <p className="mt-2 text-[15px] text-[#6b7280]">
              <Link href="/blog" className="underline underline-offset-[3px]">
                Read the latest articles
              </Link>
            </p>
          </div>
        ) : null}

        {lead ? (
          <article className="group relative mt-10 grid gap-6 sm:mt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-12" data-blog-featured="">
            <PostCover post={lead} priority ratio="aspect-[16/10]" sizes="(min-width: 1240px) 680px, (min-width: 1024px) 56vw, 100vw" />
            <div>
              <p className="text-[13px] text-[#6b7280]">
                {lead.category ? <span className="font-medium text-[#6d28d9]">{lead.category}</span> : null}
                {lead.category && lead.published_at ? <span aria-hidden className="mx-1.5 text-[#c4c7cd]">/</span> : null}
                {lead.published_at ? <time dateTime={lead.published_at}>{shortDate(lead.published_at)}</time> : null}
              </p>
              <h2 className="mt-3 text-balance text-[28px] font-semibold leading-[1.12] tracking-[-0.028em] text-[#1a1a2e] sm:text-[38px]">
                <Link href={`/blog/${lead.slug}`} className="decoration-[#1a1a2e]/30 decoration-1 underline-offset-[5px] after:absolute after:inset-0 group-hover:underline">
                  {lead.title}
                </Link>
              </h2>
              {lead.excerpt ? <p className="mt-4 text-[17px] leading-relaxed text-[#4b5563]">{lead.excerpt}</p> : null}
              <p aria-hidden className="mt-6 text-[15px] font-medium text-[#1a1a2e]">
                Read article <span>&rarr;</span>
              </p>
            </div>
          </article>
        ) : null}

        {rest.length > 0 ? (
          <section aria-labelledby="blog-list-title" className={lead ? "mt-16 border-t border-[#e5e7eb] pt-12 sm:mt-20" : "mt-10 sm:mt-12"}>
            <h2 id="blog-list-title" className={lead ? "text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a2e]" : "sr-only"}>
              {activeCategory ? `Articles in ${activeCategory}` : lead ? "More articles" : "Articles"}
            </h2>
            <div className={`grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 ${lead ? "mt-8" : ""}`}>
              {rest.map((post) => (post ? <PostCard key={post.id} post={post} headingLevel="h3" /> : null))}
            </div>
          </section>
        ) : null}

        {/*
          OLDER AND NEWER POSTS AS REAL LINKS. Without them the index
          stopped at its newest fifty, and a crawler that runs no script
          never saw a link to the rest.
        */}
        {pagination && pagination.pages > 1 ? (
          <nav aria-label="Blog pages" className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-[#e5e7eb] pt-6 text-[15px] font-medium" data-blog-pages="">
            {pagination.page > 1 ? (
              <Link href={pagePath(pagination.page - 1)} rel="prev" className="flex min-h-[44px] items-center text-[#1a1a2e] hover:underline hover:underline-offset-[3px]">
                &larr; Newer posts
              </Link>
            ) : (
              <span />
            )}
            <ol className="flex items-center gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                  <Link
                    href={pagePath(n)}
                    aria-current={n === pagination.page ? "page" : undefined}
                    className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 tabular-nums text-[#6b7280] hover:text-[#1a1a2e] aria-[current=page]:bg-[#f1f2f4] aria-[current=page]:text-[#1a1a2e]"
                  >
                    {n}
                  </Link>
                </li>
              ))}
            </ol>
            {pagination.page < pagination.pages ? (
              <Link href={pagePath(pagination.page + 1)} rel="next" className="flex min-h-[44px] items-center text-[#1a1a2e] hover:underline hover:underline-offset-[3px]">
                Older posts &rarr;
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </div>
  )
}

function CategoryLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px flex min-h-[48px] items-center whitespace-nowrap border-b-2 text-[15px] transition-colors ${active ? "border-[#1a1a2e] font-medium text-[#1a1a2e]" : "border-transparent text-[#6b7280] hover:text-[#1a1a2e]"}`}
    >
      {children}
    </Link>
  )
}
