import Link from "next/link"
import { blogPagePath, type BlogPost } from "@/lib/blog/listing"
import { safeImageUrl } from "@/lib/blog/article"
import { PostCard, PostCover, categoryTint, shortDate } from "./_components/post-card"

export type { BlogPost }

/**
 * THE BLOG'S LISTS: the index (/blog, /blog/page/N) and a category
 * (/blog/category/<slug>, /page/N). The newest post drawn large on the
 * index's first page, then the rest three to a row, each a real <a href>.
 * Pages are real links too, numbered, with rel prev and next: no infinite
 * scroll, so a crawler that runs no script reaches every post.
 *
 * Round 47: the title, its line and the category pills are not drawn here
 * any more. They are in ./layout.tsx (./_components/blog-nav.tsx), shared by
 * every one of these pages, so moving between categories keeps them in
 * place and only this list changes. A post with no cover is never an empty
 * box: the large one is drawn as a panel of type on its category's tint,
 * a card as a typographic cover (./_components/post-card PostCover).
 */
export default function BlogListing({
  posts,
  activeCategory,
  pagination,
  pagePath = blogPagePath,
  featured = false,
}: {
  posts: BlogPost[]
  activeCategory: string | null
  /** This list's page and how many there are (lib/blog/listing blogPage). */
  pagination?: { page: number; pages: number }
  /** The address of page N of this list. */
  pagePath?: (page: number) => string
  /** Draw the first post large (the index's first page). */
  featured?: boolean
}) {
  const [lead, ...rest] = featured ? posts : [null, ...posts]
  const leadCover = lead ? safeImageUrl(lead.cover_image_url) : null
  return (
    /* A page link scrolls this into view: clear of the site header and the stuck pill row above it. */
    <div className="scroll-mt-[calc(var(--blog-top,65px)+52px)] bg-white">
      <div className="home-wrap pb-24 pt-8 sm:pb-32 sm:pt-12">
        {posts.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[18px] font-medium text-[#1a1a2e]">No articles in {activeCategory ?? "the blog"} yet.</p>
            <p className="mt-2 text-[16px] text-[#6b7280]">
              <Link href="/blog" className="underline underline-offset-[3px]">
                Read the latest articles
              </Link>
            </p>
          </div>
        ) : null}

        {lead && leadCover ? (
          <article className="group relative grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-[clamp(48px,5vw,96px)]" data-blog-featured="">
            <PostCover post={lead} priority ratio="aspect-[16/10]" sizes="(min-width: 1024px) 56vw, 100vw" />
            <LeadText post={lead} />
          </article>
        ) : lead ? (
          /* No cover: no picture at all, the post set in type on its category's tint. */
          <article className={`group relative rounded-[clamp(20px,2.4vw,32px)] px-6 py-9 sm:px-12 sm:py-16 ${categoryTint(lead.category).bg}`} data-blog-featured="" data-blog-featured-text="">
            <LeadText post={lead} large />
          </article>
        ) : null}

        {rest.length > 0 ? (
          <section aria-labelledby="blog-list-title" className={lead ? "mt-16 border-t border-[#ececf0] pt-12 sm:mt-24 sm:pt-16" : ""}>
            <h2 id="blog-list-title" className={lead ? "text-[clamp(26px,2.5vw,36px)] font-medium leading-[1.15] tracking-[-0.035em] text-[#1a1a2e]" : "sr-only"}>
              {activeCategory ? `Articles in ${activeCategory}` : lead ? "More articles" : "Articles"}
            </h2>
            <div className={`grid gap-x-[clamp(20px,2.2vw,40px)] gap-y-14 sm:grid-cols-2 min-[1024px]:grid-cols-3 min-[1600px]:grid-cols-4 ${lead ? "mt-8 sm:mt-10" : ""}`}>
              {/* With no large post above, the first card is the first screen's picture: loaded first, the rest lazily. */}
              {rest.map((post, i) => (post ? <PostCard key={post.id} post={post} headingLevel="h3" priority={!lead && i === 0} /> : null))}
            </div>
          </section>
        ) : null}

        {/*
          OLDER AND NEWER POSTS AS REAL LINKS. Without them the index
          stopped at its newest fifty, and a crawler that runs no script
          never saw a link to the rest.
        */}
        {pagination && pagination.pages > 1 ? (
          <nav aria-label="Blog pages" className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-[#ececf0] pt-6 text-[15px] font-medium" data-blog-pages="">
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
                    className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 tabular-nums text-[#6b7280] hover:text-[#1a1a2e] aria-[current=page]:bg-[#1a1a2e] aria-[current=page]:text-white rounded-full"
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

function LeadText({ post, large = false }: { post: BlogPost; large?: boolean }) {
  return (
    <div className={large ? "max-w-[820px]" : ""}>
      <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-[#6b7280]">
        {post.category ? <span className={`font-medium ${large ? categoryTint(post.category).ink : "text-[#6d28d9]"}`}>{post.category}</span> : null}
        {post.category && post.published_at ? <span aria-hidden className="text-[#c4c7cd]">·</span> : null}
        {post.published_at ? <time dateTime={post.published_at}>{shortDate(post.published_at)}</time> : null}
      </p>
      <h2 className={`mt-3 text-balance font-medium tracking-[-0.04em] text-[#1a1a2e] ${large ? "text-[32px] leading-[1.06] sm:text-[clamp(40px,4.2vw,64px)]" : "text-[30px] leading-[1.08] sm:text-[clamp(34px,3.4vw,52px)]"}`}>
        <Link href={`/blog/${post.slug}`} className="decoration-[#1a1a2e]/30 decoration-1 underline-offset-[5px] after:absolute after:inset-0 after:rounded-2xl group-hover:underline">
          {post.title}
        </Link>
      </h2>
      {post.excerpt ? <p className={`mt-5 line-clamp-4 text-[17px] leading-[1.6] text-[#55535c] sm:text-[18px] ${large ? "max-w-[64ch]" : ""}`}>{post.excerpt}</p> : null}
      <p aria-hidden className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white transition-colors group-hover:bg-[#2e2e3f]">
        Read article <span className="transition-transform duration-300 group-hover:translate-x-[3px]">&rarr;</span>
      </p>
    </div>
  )
}
