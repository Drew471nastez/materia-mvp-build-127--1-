import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { BLOG_AUTHOR_BASE, BLOG_FEED_ALTERNATE, blogAuthorPath, blogPage, type BlogPost } from "@/lib/blog/listing"
import { readBlogAuthorBySlug, readBlogAuthorPosts, readBlogAuthorsWithPosts, type BlogAuthorProfile } from "@/lib/blog/post"
import { blogAuthorJsonLd, breadcrumbListJsonLd } from "@/lib/blog/structured-data"
import { Avatar, whoWrote } from "./_components/article-view"
import { PostCard } from "./_components/post-card"

/*
  ONE AUTHOR OF THE BLOG: /blog/author/<slug>, and their older posts at
  /blog/author/<slug>/page/<n>, BLOG_PAGE_SIZE to a page like the index.
  The author is a blog_authors row (SQL part 345): its name, role, bio,
  picture and links, and under them every LIVE post that names it
  (published, its date reached: lib/blog/schedule liveDateFilter). Each
  page names itself canonical. An author with no live post yet is a page
  with nothing on it, so it is noindex and out of the sitemap; an unknown
  slug, or no blog_authors table at all, is a 404 (./author/[slug]/layout).
  The article's byline and its author box link here, and its BlogPosting's
  author Person carries this page as its url.

  /blog/author lists the authors who have a live post, so the breadcrumb's
  "Authors" is a real page.
*/

export interface BlogAuthorPageData {
  author: BlogAuthorProfile
  posts: BlogPost[]
  total: number
  page: number
  pages: number
}

/** The author and page N of their live posts, or null when either does not exist. */
export async function blogAuthorPage(slug: string, page: number): Promise<BlogAuthorPageData | null> {
  const author = await readBlogAuthorBySlug(slug)
  if (!author) return null
  const posts = await readBlogAuthorPosts(author.id)
  /* An author with no live post still has their first page (noindex); there is no page 2 of nothing. */
  if (!posts.length) return page === 1 ? { author, posts, total: 0, page: 1, pages: 1 } : null
  const cut = blogPage(posts, page)
  return cut ? { author, total: posts.length, ...cut } : null
}

export function authorDescription(author: Pick<BlogAuthorProfile, "name" | "role" | "bio">): string {
  const bio = author.bio?.trim()
  if (bio) return bio.length > 160 ? `${bio.slice(0, 157).replace(/\s+\S*$/, "")}...` : bio
  return author.role?.trim() ? `Articles by ${author.name}, ${author.role.trim()}, on the Storelib Blog.` : `Articles by ${author.name} on the Storelib Blog.`
}

/** The page's metadata: its own canonical, Open Graph, and noindex while the author has no live post. */
export function blogAuthorMetadataFor(found: BlogAuthorPageData | null): Metadata {
  if (!found) return { title: "Not found", robots: { index: false, follow: true } }
  const { author, page, total } = found
  return pageMetadata({
    path: blogAuthorPath(author.slug, page),
    title: page > 1 ? `${author.name}, page ${page} | Storelib Blog` : `${author.name} | Storelib Blog`,
    absolute: true,
    description: authorDescription(author),
    robots: total > 0 ? { index: true, follow: true, googleBot: { index: true, follow: true } } : { index: false, follow: true },
    types: BLOG_FEED_ALTERNATE,
  })
}

export async function blogAuthorMetadata(slug: string, page: number): Promise<Metadata> {
  return blogAuthorMetadataFor(await blogAuthorPage(slug, page))
}

const LINK = "flex min-h-[44px] items-center font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-[3px] hover:decoration-[#1a1a2e]"

function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 text-[14px] text-[#6b7280]">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-2">
            {i > 0 ? (
              <span aria-hidden className="text-[#c4c7cd]">
                /
              </span>
            ) : null}
            {it.href ? (
              <Link href={it.href} className="hover:text-[#1a1a2e]">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-[#1a1a2e]">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Older and newer posts as real links, numbered, with rel prev and next (the blog's listing does the same). */
function Pages({ page, pages, path }: { page: number; pages: number; path: (n: number) => string }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Author pages" className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-[#e5e7eb] pt-6 text-[15px] font-medium" data-blog-pages="">
      {page > 1 ? (
        <Link href={path(page - 1)} rel="prev" className="flex min-h-[44px] items-center text-[#1a1a2e] hover:underline hover:underline-offset-[3px]">
          &larr; Newer posts
        </Link>
      ) : (
        <span />
      )}
      <ol className="flex items-center gap-1">
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <Link
              href={path(n)}
              aria-current={n === page ? "page" : undefined}
              className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 tabular-nums text-[#6b7280] hover:text-[#1a1a2e] aria-[current=page]:bg-[#f1f2f4] aria-[current=page]:text-[#1a1a2e]"
            >
              {n}
            </Link>
          </li>
        ))}
      </ol>
      {page < pages ? (
        <Link href={path(page + 1)} rel="next" className="flex min-h-[44px] items-center text-[#1a1a2e] hover:underline hover:underline-offset-[3px]">
          Older posts &rarr;
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14 lg:px-8">{children}</div>
    </div>
  )
}

export function BlogAuthorView({ author, posts, total, page, pages }: BlogAuthorPageData) {
  const who = whoWrote({ author, byline: null })
  const path = (n: number) => blogAuthorPath(author.slug, n)
  const crumbs = [{ name: "Blog", path: "/blog" }, { name: "Authors", path: BLOG_AUTHOR_BASE }, { name: author.name, path: path(1) }, ...(page > 1 ? [{ name: `Page ${page}`, path: path(page) }] : [])]
  const profileLd = blogAuthorJsonLd({ path: path(page), name: who.name, role: who.role, bio: who.bio, avatarUrl: who.avatar, links: who.links, modified: author.updated_at, organization: who.organization })
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(profileLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbListJsonLd(crumbs)) }} />
      <Frame>
        <Crumbs items={[{ label: "Blog", href: "/blog" }, { label: "Authors", href: BLOG_AUTHOR_BASE }, { label: who.name }]} />
        <header className="flex max-w-[880px] flex-col gap-6 sm:flex-row sm:items-start sm:gap-8" data-blog-author-page="">
          <span className="shrink-0 sm:mt-2">
            <Avatar who={who} size={88} />
          </span>
          <div className="min-w-0">
            <h1 className="text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] text-[#1a1a2e] sm:text-[56px]">{who.name}</h1>
            {who.role ? <p className="mt-3 text-[17px] text-[#6b7280] sm:text-[18px]">{who.role}</p> : null}
            {who.bio ? <p className="mt-5 max-w-[60ch] text-pretty text-[17px] leading-relaxed text-[#4b5563] sm:text-[19px]">{who.bio}</p> : null}
            {who.links.length ? (
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-0 text-[15px]" data-blog-author-links="">
                {who.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} rel="me noopener" className={LINK}>
                      {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>

        <section aria-labelledby="author-posts-title" className="mt-14 border-t border-[#e5e7eb] pt-10 sm:mt-16">
          <h2 id="author-posts-title" className="flex items-baseline gap-3 text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a2e]">
            Articles by {who.name}
            {total > 0 ? <span className="text-[15px] font-normal tabular-nums text-[#6b7280]">{total}</span> : null}
          </h2>
          {posts.length ? (
            <div className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, i) => (
                <PostCard key={post.id} post={post} headingLevel="h3" priority={i === 0} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[15px] text-[#6b7280]">
              No published articles yet.{" "}
              <Link href="/blog" className="text-[#1a1a2e] underline underline-offset-[3px]">
                Read the latest articles
              </Link>
            </p>
          )}
        </section>
        <Pages page={page} pages={pages} path={path} />
      </Frame>
    </>
  )
}

/* ── /blog/author: the authors with a live post ────────────────────────── */

export type BlogAuthorsIndexData = Array<BlogAuthorProfile & { count: number }>

/** The authors with at least one live post, most posts first; null when there is no blog_authors table (a 404). */
export async function blogAuthorsIndex(): Promise<BlogAuthorsIndexData | null> {
  const all = await readBlogAuthorsWithPosts()
  if (!all) return null
  return all
    .filter((a) => a.posts.length > 0)
    .map((a) => ({ ...a, count: a.posts.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function blogAuthorsIndexMetadata(authors: BlogAuthorsIndexData | null): Metadata {
  if (!authors) return { title: "Not found", robots: { index: false, follow: true } }
  return pageMetadata({
    path: BLOG_AUTHOR_BASE,
    title: "Authors | Storelib Blog",
    absolute: true,
    description: "The people who write the Storelib Blog, and their articles.",
    robots: authors.length ? { index: true, follow: true, googleBot: { index: true, follow: true } } : { index: false, follow: true },
    types: BLOG_FEED_ALTERNATE,
  })
}

export function BlogAuthorsIndexView({ authors }: { authors: BlogAuthorsIndexData }) {
  const crumbs = breadcrumbListJsonLd([
    { name: "Blog", path: "/blog" },
    { name: "Authors", path: BLOG_AUTHOR_BASE },
  ])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />
      <Frame>
        <Crumbs items={[{ label: "Blog", href: "/blog" }, { label: "Authors" }]} />
        <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#1a1a2e] sm:text-[64px]">Authors</h1>
        <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-[#4b5563] sm:text-[19px]">The people who write the Storelib Blog.</p>
        {authors.length ? (
          <ul className="mt-12 divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]" data-blog-authors="">
            {authors.map((a) => {
              const who = whoWrote({ author: a, byline: null })
              return (
                <li key={a.id} className="group relative flex items-center gap-4 py-5 sm:gap-5">
                  <Avatar who={who} size={56} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[18px] font-semibold text-[#1a1a2e]">
                      <Link href={blogAuthorPath(a.slug)} className="decoration-[#1a1a2e]/30 underline-offset-[3px] after:absolute after:inset-0 group-hover:underline">
                        {who.name}
                      </Link>
                    </h2>
                    {who.role ? <p className="mt-0.5 truncate text-[14px] text-[#6b7280]">{who.role}</p> : null}
                  </div>
                  <p className="shrink-0 text-[14px] tabular-nums text-[#6b7280]">{a.count === 1 ? "1 article" : `${a.count} articles`}</p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-12 text-[15px] text-[#6b7280]">
            No authors with published articles yet.{" "}
            <Link href="/blog" className="text-[#1a1a2e] underline underline-offset-[3px]">
              Read the latest articles
            </Link>
          </p>
        )}
      </Frame>
    </>
  )
}
