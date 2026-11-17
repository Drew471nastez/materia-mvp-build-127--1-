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
 * box: a card draws a typographic cover (./_components/post-card PostCover).
 *
 * Blog round 15, the owner: the large post always has a picture, and its
 * panel is never a tint. It is the newest post on the page that has a
 * cover; only when none has one is it the newest post, with the same drawn
 * cover the cards use. Either way it is one white Storelib card, picture
 * beside the text, and the cards under it are three to a row at most.
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
  /* The newest post with a cover leads; the newest of all when none has one. Each post still drawn once, on this page. */
  const lead = featured && posts.length > 0 ? (posts.find((p) => safeImageUrl(p.cover_image_url)) ?? posts[0]) : null
  const rest = lead ? posts.filter((p) => p !== lead) : posts
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

        {lead ? (
          <article
            className="group relative grid overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#e5e7eb] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_16px_36px_-18px_rgba(26,26,46,0.24)] has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-[#1a1a2e]/20 motion-reduce:transition-none lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center"
            data-blog-featured=""
          >
            <PostCover post={lead} priority ratio="aspect-[16/10]" rounded="" sizes="(min-width: 1024px) 56vw, 100vw" />
            <div className="p-6 sm:p-8 lg:px-[clamp(32px,3.5vw,56px)] lg:py-10">
              <LeadText post={lead} />
            </div>
          </article>
        ) : null}

        {rest.length > 0 ? (
          <section aria-labelledby="blog-list-title" className={lead ? "mt-14 sm:mt-20" : ""}>
            <h2 id="blog-list-title" className={lead ? "text-[clamp(26px,2.5vw,36px)] font-medium leading-[1.15] tracking-[-0.035em] text-[#1a1a2e]" : "sr-only"}>
              {activeCategory ? `Articles in ${activeCategory}` : lead ? "More articles" : "Articles"}
            </h2>
            <div className={`grid grid-cols-1 gap-5 min-[640px]:grid-cols-2 min-[640px]:gap-6 min-[1024px]:grid-cols-3 min-[1024px]:gap-8 ${lead ? "mt-6 sm:mt-8" : ""}`}>
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

function LeadText({ post }: { post: BlogPost }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-[#6b7280]">
        {post.category ? <span className={`font-medium ${categoryTint(post.category).ink}`}>{post.category}</span> : null}
        {post.category && post.published_at ? <span aria-hidden className="text-[#c4c7cd]">·</span> : null}
        {post.published_at ? <time dateTime={post.published_at}>{shortDate(post.published_at)}</time> : null}
      </p>
      <h2 className="mt-3 text-balance text-[26px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#1a1a2e] sm:text-[clamp(30px,2.8vw,42px)]">
        <Link href={`/blog/${post.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl">
          {post.title}
        </Link>
      </h2>
      {post.excerpt ? <p className="mt-4 line-clamp-3 text-[15px] leading-[1.6] text-[#6b7280] sm:text-[16px]">{post.excerpt}</p> : null}
      <p aria-hidden className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-[#1a1a2e] px-5 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(26,26,46,0.18),0_4px_12px_-4px_rgba(26,26,46,0.4)] transition-colors duration-200 group-hover:bg-[#2e2e3f]">
        Read article <span className="transition-transform duration-300 group-hover:translate-x-[3px] motion-reduce:transition-none">&rarr;</span>
      </p>
    </div>
  )
}
