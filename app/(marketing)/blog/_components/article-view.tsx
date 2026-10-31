/**
 * ===========================================================================
 *  ONE BLOG ARTICLE, LAID OUT FOR READING
 * ===========================================================================
 * A server component; the browser runs only the small parts: the contents
 * spy, the progress line, Copy link, the YouTube player, the email boxes.
 *
 * WIDE (1024px and up), three columns under the header and the cover:
 *   left    "On this page", kept in view, the heading being read marked by a
 *           thin rule; under it the sign up card.
 *   middle  the article, about 70 characters to a line.
 *   right   who wrote it and when, share, and the newsletter.
 * NARROW, one column: the byline under the title, the contents folded into
 * a <details> under the cover, then the article and everything after it.
 *
 * After the article: share, the author, related articles (same category
 * first), the older and newer post. Every one of them a real <a href>.
 */
import Link from "next/link"
import type { Block } from "@/lib/blog/blocks"
import type { BlogPost } from "@/lib/blog/listing"
import {
  BLOG_CTA,
  articleOutline,
  articleWordCount,
  authorOf,
  blogCategoryPath,
  blogSignupHref,
  formatBlogDate,
  isMeaningfullyUpdated,
  readMinutes,
  safeImageUrl,
  type CtaVariant,
  type TocItem,
} from "@/lib/blog/article"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { ArticleBlocks } from "./article-blocks"
import { BlogImage } from "./blog-image"
import { NewsletterCard } from "./newsletter-card"
import { OnThisPage } from "./toc"
import { TocSpy } from "./toc-spy"
import { PostCard } from "./post-card"
import ReadingProgress from "../[slug]/_reading-progress"
import ShareButtons from "../[slug]/_share-buttons"
import CtaBanner from "../[slug]/_cta-banner"

export interface ArticleViewData {
  slug: string
  url: string
  title: string
  excerpt: string
  category: string
  published_at: string | null
  updated_at: string | null
  cover: string | null
  byline: string | null
  /** The post's blog_authors row (lib/blog/post readBlogAuthor); the byline text when it has none. */
  author?: { name: string; role?: string | null; bio?: string | null; avatar_url?: string | null; links?: { label: string; url: string }[] } | null
  /** The category's address (its slug from blog_categories). */
  categoryHref?: string
  coverAlt?: string | null
  blocks: Block[]
  snippets?: Record<string, Block[]>
  cta: CtaVariant
  related: BlogPost[]
  previous: BlogPost | null
  next: BlogPost | null
}

/** Anisia's picture: the byline the editor gives a post by default. */
const ANISIA_AVATAR = "https://storelib.com/media/onepage-assets/ee48b026-347c-4372-8589-eea3863b443c/avatars/avatar-1770910695542.jpg"

interface Who {
  name: string
  role: string | null
  bio: string | null
  avatar: string | null
  links: { label: string; url: string }[]
  organization: boolean
}

/** Who wrote it: the blog_authors row when there is one, the byline text otherwise. */
export function whoWrote(data: Pick<ArticleViewData, "author" | "byline">): Who {
  const p = data.author
  if (p?.name) {
    const base = authorOf(p.name)
    const avatar = safeImageUrl(p.avatar_url)
    return { name: base.name, role: p.role?.trim() || base.role, bio: p.bio?.trim() || null, avatar, links: (p.links ?? []).filter((l) => /^https?:\/\//i.test(l.url)), organization: base.organization && !avatar }
  }
  const a = authorOf(data.byline)
  return { ...a, bio: null, avatar: /^anisia$/i.test(a.name) ? ANISIA_AVATAR : null, links: [] }
}

function Avatar({ who, size }: { who: Who; size: number }) {
  if (who.organization) return <StorelibLogo size={size} alt="" />
  if (who.avatar) {
    return (
      <span className="relative block shrink-0 overflow-hidden rounded-full bg-[#eef0f3]" style={{ width: size, height: size }}>
        <BlogImage src={who.avatar} alt="" fill sizes={`${size}px`} className="object-cover" />
      </span>
    )
  }
  const initials = who.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-[#eef0f3] text-[13px] font-semibold text-[#1a1a2e]" style={{ width: size, height: size }}>
      {initials}
    </span>
  )
}

function Byline({ data, minutes }: { data: ArticleViewData; minutes: number }) {
  const who = whoWrote(data)
  const updated = isMeaningfullyUpdated(data.published_at, data.updated_at) ? data.updated_at : null
  return (
    <div className="flex items-start gap-3" data-blog-byline="">
      <Avatar who={who} size={40} />
      <div className="min-w-0 text-[14px] leading-snug">
        <p className="text-[#1a1a2e]">
          By{" "}
          <a href="#author" className="font-medium hover:underline hover:underline-offset-[3px]">
            {who.name}
          </a>
          {who.role ? <span className="text-[#6b7280]">, {who.role}</span> : null}
        </p>
        <p className="mt-1 text-[#6b7280]">
          {data.published_at ? <time dateTime={data.published_at}>{formatBlogDate(data.published_at)}</time> : null}
          <span aria-hidden className="mx-1.5">·</span>
          {minutes} min read
        </p>
        {updated ? (
          <p className="mt-1 text-[#6b7280]">
            Updated <time dateTime={updated}>{formatBlogDate(updated)}</time>
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Where the inline sign up box goes: before the heading nearest the middle, never in the first few blocks. */
export function ctaSlot(blocks: Block[]): number {
  if (blocks.length < 6) return blocks.length - 1
  const middle = blocks.length * 0.45
  let best = -1
  blocks.forEach((b, i) => {
    if (b.type === "h2" && i >= 4 && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i
  })
  return best > 0 ? best - 1 : Math.min(blocks.length - 1, 4)
}

/** The side list: h2 and h3 when it fits beside the article, the h2 alone when it would not. */
function sideItems(toc: TocItem[]): TocItem[] {
  return toc.length <= 12 ? toc : toc.filter((t) => t.level === 2)
}

export function ArticleView({ data }: { data: ArticleViewData }) {
  const { toc } = articleOutline(data.blocks)
  const minutes = readMinutes(articleWordCount(data.blocks))
  const cover = safeImageUrl(data.cover)
  const who = whoWrote(data)
  const categoryHref = data.categoryHref ?? (data.category ? blogCategoryPath(data.category) : "/blog")
  const cta = BLOG_CTA[data.cta]

  return (
    <div className="bg-white">
      <ReadingProgress />
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-x-14">
          <header className="lg:col-start-2 lg:max-w-[880px]">
            <nav aria-label="Breadcrumb" className="text-[14px] text-[#6b7280]">
              <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <Link href="/blog" className="hover:text-[#1a1a2e]">
                    Blog
                  </Link>
                </li>
                {data.category ? (
                  <>
                    <li aria-hidden className="text-[#c4c7cd]">
                      /
                    </li>
                    <li>
                      <Link href={categoryHref} className="hover:text-[#1a1a2e]">
                        {data.category}
                      </Link>
                    </li>
                  </>
                ) : null}
                <li aria-hidden className="text-[#c4c7cd] max-sm:hidden">
                  /
                </li>
                <li aria-current="page" className="min-w-0 max-w-[36ch] truncate text-[#1a1a2e] max-sm:hidden">
                  {data.title}
                </li>
              </ol>
            </nav>
            {data.category ? (
              <p className="mt-8 text-[14px] font-medium text-[#6d28d9]">
                <Link href={categoryHref} className="hover:underline hover:underline-offset-[3px]">
                  {data.category}
                </Link>
              </p>
            ) : null}
            <h1 className={`${data.category ? "mt-3" : "mt-8"} text-balance text-[36px] font-semibold leading-[1.08] tracking-[-0.032em] text-[#1a1a2e] sm:text-[48px] lg:text-[56px]`}>{data.title}</h1>
            {data.excerpt ? <p className="mt-5 max-w-[62ch] text-pretty text-[18px] leading-[1.6] text-[#4b5563] sm:text-[20px]">{data.excerpt}</p> : null}
            <div className="mt-7 xl:hidden">
              <Byline data={data} minutes={minutes} />
            </div>
          </header>
        </div>

        {cover ? (
          <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl bg-[#eef0f3] sm:mt-10 lg:aspect-[21/9]">
            <BlogImage src={cover} alt={data.coverAlt || data.title} fill priority sizes="(min-width: 1240px) 1176px, (min-width: 1024px) calc(100vw - 64px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)" className="object-cover" />
          </div>
        ) : null}

        {/* ── Three columns ──────────────────────────────────────── */}
        <div className="mt-8 sm:mt-12 lg:grid lg:grid-cols-[200px_minmax(0,680px)] lg:gap-x-12 xl:grid-cols-[220px_minmax(0,640px)_200px] xl:gap-x-14">
          <aside className="hidden lg:block" aria-label="Contents and sign up">
            <div className="sticky top-24 space-y-10">
              <OnThisPage items={sideItems(toc)} variant="side" />
              <div className="rounded-2xl bg-[#16161a] p-5 text-white" data-blog-cta-card={data.cta}>
                <StorelibLogo size={28} alt="" />
                <p className="mt-4 text-[20px] font-semibold leading-[1.2] tracking-[-0.015em]">{cta.card}</p>
                <p className="mt-1 text-[20px] font-semibold leading-[1.2] tracking-[-0.015em] text-[#c4b5fd]">Free to start.</p>
                <a href={blogSignupHref(data.cta)} className="mt-5 flex min-h-[44px] items-center justify-between border-b border-white/30 pb-1 text-[15px] font-medium transition-colors hover:border-white">
                  Start free
                  <span aria-hidden>&rarr;</span>
                </a>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-8 lg:hidden">
              <OnThisPage items={toc} variant="inline" />
            </div>
            <article data-blog-article="" className="min-w-0">
              <ArticleBlocks blocks={data.blocks} postTitle={data.title} snippets={data.snippets} insertAfter={{ index: ctaSlot(data.blocks), node: <CtaBanner variant={data.cta} /> }} />
            </article>

            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#e5e7eb] pt-6">
              <ShareButtons url={data.url} title={data.title} />
            </div>

            <section id="author" aria-labelledby="author-name" className="mt-10 flex scroll-mt-28 gap-4 rounded-2xl bg-[#f6f7f9] p-5 sm:p-6" data-blog-author="">
              <Avatar who={who} size={56} />
              <div className="min-w-0">
                <p className="text-[13px] text-[#6b7280]">Written by</p>
                <h2 id="author-name" className="mt-0.5 text-[17px] font-semibold text-[#1a1a2e]">
                  {who.name}
                  {who.role ? <span className="font-normal text-[#6b7280]">, {who.role}</span> : null}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4b5563]">
                  {who.bio ||
                    (who.organization
                      ? "The people who build Storelib, writing about selling digital products, running a store and growing an audience."
                      : `${who.name} writes practical guides for creators at Storelib.`)}
                </p>
                {who.links.length ? (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                    {who.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} rel="noopener me" className="flex min-h-[44px] items-center font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-[3px] hover:decoration-[#1a1a2e]">
                          {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>

            <div className="mt-10 xl:hidden">
              <NewsletterCard id="blog-newsletter-end" />
            </div>
          </div>

          <aside className="hidden xl:block" aria-label="About this article">
            <Byline data={data} minutes={minutes} />
            <div className="mt-6 -ml-3">
              <ShareButtons url={data.url} title={data.title} />
            </div>
            <div className="sticky top-24 mt-10">
              <NewsletterCard />
            </div>
          </aside>
        </div>

        {/* ── After the article ──────────────────────────────────── */}
        {data.related.length > 0 ? (
          <section aria-labelledby="related-title" className="mt-20 border-t border-[#e5e7eb] pt-12" data-blog-related="">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="related-title" className="text-[26px] font-semibold tracking-[-0.022em] text-[#1a1a2e] sm:text-[30px]">
                Related articles
              </h2>
              <Link href="/blog" className="shrink-0 text-[14px] font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-[3px] hover:decoration-[#1a1a2e]">
                All articles
              </Link>
            </div>
            <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {data.related.map((p) => (
                <PostCard key={p.slug} post={p} headingLevel="h3" sizes="(min-width: 1024px) 376px, (min-width: 640px) 50vw, 100vw" />
              ))}
            </div>
          </section>
        ) : null}

        {data.previous || data.next ? (
          <nav aria-label="Older and newer articles" className="mt-16 grid gap-3 sm:grid-cols-2" data-blog-prevnext="">
            {data.previous ? <StepLink post={data.previous} dir="previous" /> : <span className="hidden sm:block" />}
            {data.next ? <StepLink post={data.next} dir="next" /> : null}
          </nav>
        ) : null}
      </div>
      <TocSpy />
    </div>
  )
}

function StepLink({ post, dir }: { post: BlogPost; dir: "previous" | "next" }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      rel={dir === "next" ? "next" : "prev"}
      className={`group flex min-h-[88px] flex-col justify-center rounded-2xl border border-[#e5e7eb] px-5 py-4 transition-colors hover:border-[#c9ccd2] ${dir === "next" ? "sm:items-end sm:text-right" : ""}`}
    >
      <span className="text-[13px] text-[#6b7280]">{dir === "next" ? "Newer article" : "Older article"}</span>
      <span className="mt-1 text-[16px] font-medium leading-snug text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/30 group-hover:underline-offset-[3px]">
        {dir === "previous" ? <span aria-hidden>&larr; </span> : null}
        {post.title}
        {dir === "next" ? <span aria-hidden> &rarr;</span> : null}
      </span>
    </Link>
  )
}
