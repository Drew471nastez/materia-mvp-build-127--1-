/**
 * ===========================================================================
 *  ONE BLOG ARTICLE, LAID OUT FOR READING
 * ===========================================================================
 * A server component; the browser runs only the small parts: the contents
 * spy, the progress line, Copy link, the YouTube player, the sign up form.
 *
 * Round 47, the owner: "the article page feels shrunk", the side columns
 * tiny, the byline squeezed into a column on the right, the cover wider than
 * the text and lined up with nothing. Rebuilt on one grid:
 *
 *   ONE COLUMN FOR READING, 720px. The header (breadcrumb, category, title,
 *   dek, the byline as one row), the cover and the body share its edges.
 *   Body 18px (17px on a phone) at 1.7, near black links, underlined.
 *
 *   1200px AND UP, a rail on its left: "On this page", kept in view with the
 *   heading being read marked, and under it one small card for what Storelib
 *   sells. There is no right rail any more (the newsletter box is gone).
 *
 *   Round 49, the owner: "too narrow, the right side looks empty". The empty
 *   column as wide as the rail is gone. From 1200px the rail (260px) and a
 *   760px reading column sit side by side, 56px apart, and the PAIR is what
 *   is centred, so the article starts close to its rail instead of the page
 *   being centred around nothing. The body steps up to 19px there, so the
 *   wider column keeps about 80 characters to a line (measured, never past
 *   85). The card under the contents is a light, short one line card
 *   (about 110px), so the contents list gets the rail's height.
 *
 *   NARROWER, one column: "On this page" folds into a <details> above the
 *   body, and the card is not drawn (the box inside the article remains).
 *
 * After the article: share, the author, related articles (same category
 * first), the older and newer post. Every one of them a real <a href>.
 */
import Link from "next/link"
import type { Block } from "@/lib/blog/blocks"
import type { BlogPost } from "@/lib/blog/listing"
import {
  articleOutline,
  articleWordCount,
  authorOf,
  blogCategoryPath,
  blogRailCta,
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
  /** The author's page (/blog/author/<slug>) when the post has a blog_authors row; the byline and the author box link to it. */
  authorHref?: string | null
  /** The category's address (its slug from blog_categories). */
  categoryHref?: string
  coverAlt?: string | null
  blocks: Block[]
  snippets?: Record<string, Block[]>
  cta: CtaVariant
  related: BlogPost[]
  previous: BlogPost | null
  next: BlogPost | null
  /** Physical commerce switched on (lib/platform/physical-commerce). Round 49: the rail's card no longer lists kinds of product, so it reads the same either way. */
  physical?: boolean
}

/** Anisia's picture: the byline the editor gives a post by default. */
const ANISIA_AVATAR = "https://storelib.com/media/onepage-assets/ee48b026-347c-4372-8589-eea3863b443c/avatars/avatar-1770910695542.jpg"

export interface Who {
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

export function Avatar({ who, size }: { who: Who; size: number }) {
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

/**
 * WHO WROTE IT AND WHEN, AS ONE ROW UNDER THE DEK (round 47: it was a
 * squeezed column in the right rail). The picture, "By <name>, <role>" on
 * the first line, the date, read time and "Updated" on the second, both at
 * a size a reader can read; share on the same row, on the right, where there
 * is room for it.
 */
function Byline({ data, minutes }: { data: ArticleViewData; minutes: number }) {
  const who = whoWrote(data)
  const updated = isMeaningfullyUpdated(data.published_at, data.updated_at) ? data.updated_at : null
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-[#eceef1] py-4 sm:mt-10" data-blog-byline="">
      <div className="flex min-w-0 items-center gap-3.5">
        <Avatar who={who} size={44} />
        <div className="min-w-0 leading-[1.45]">
          <p className="text-[15px] text-[#1a1a2e]">
            By{" "}
            <a href={data.authorHref || "#author"} rel={data.authorHref ? "author" : undefined} className="font-semibold hover:underline hover:underline-offset-[3px]" data-blog-byline-author="">
              {who.name}
            </a>
            {who.role ? <span className="text-[#6b7280]">, {who.role}</span> : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[14px] text-[#6b7280]" data-blog-byline-dates="">
            {data.published_at ? <time dateTime={data.published_at}>{formatBlogDate(data.published_at)}</time> : null}
            {data.published_at ? <span aria-hidden className="text-[#c4c7cd]">·</span> : null}
            <span>{minutes} min read</span>
            {updated ? (
              <>
                <span aria-hidden className="text-[#c4c7cd]">·</span>
                <span>
                  Updated <time dateTime={updated}>{formatBlogDate(updated)}</time>
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="-mr-2 max-sm:hidden">
        <ShareButtons url={data.url} title={data.title} label="" />
      </div>
    </div>
  )
}

/**
 * THE CARD UNDER "ON THIS PAGE" (round 47, the owner: "Storelib is about
 * many things"). Round 49, the owner: "too big, too dark and too wordy, it
 * squeezes On this page". Now one line, a short subline and one button on a
 * light surface, about 110px tall, never taller than 120px; its button
 * still goes to /signup tagged src and ref like the box in the article
 * (blogSignupHref).
 */
function RailCta({ variant }: { variant: ArticleViewData["cta"] }) {
  const copy = blogRailCta()
  return (
    <div className="rounded-xl border border-[#eceef1] bg-[#f8f9fa] px-4 py-3" data-blog-cta-card={variant}>
      <p className="text-[15px] font-semibold leading-[1.35] text-[#1a1a2e]">{copy.title}</p>
      <p className="mt-0.5 text-[14px] leading-[1.45] text-[#6b7280]">{copy.body}</p>
      <a
        href={blogSignupHref(variant)}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2b2b42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]"
      >
        Start free
        <span aria-hidden>&rarr;</span>
      </a>
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

/** One grid for the whole article: from 1200px the 260px rail and the 760px column, the pair centred (round 49: no empty column on the right). */
const GRID = "min-[1200px]:grid min-[1200px]:grid-cols-[260px_minmax(0,760px)] min-[1200px]:justify-center min-[1200px]:gap-x-14"
/** The reading column: 720px and centred on its own below 1200px, the grid's second column above. */
const COLUMN = "mx-auto w-full max-w-[720px] min-[1200px]:col-start-2 min-[1200px]:max-w-none"

export function ArticleView({ data }: { data: ArticleViewData }) {
  const { toc } = articleOutline(data.blocks)
  const minutes = readMinutes(articleWordCount(data.blocks))
  const cover = safeImageUrl(data.cover)
  const who = whoWrote(data)
  const categoryHref = data.categoryHref ?? (data.category ? blogCategoryPath(data.category) : "/blog")
  const side = sideItems(toc)

  return (
    <div className="bg-white">
      <ReadingProgress />
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <div className={GRID}>
          {/* ── Header, over the reading column ─────────────────────── */}
          <header className={`${COLUMN} min-[1200px]:row-start-1`}>
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
                <li aria-current="page" className="min-w-0 max-w-[40ch] truncate text-[#1a1a2e] max-sm:hidden">
                  {data.title}
                </li>
              </ol>
            </nav>
            {data.category ? (
              <p className="mt-8 text-[15px] font-medium text-[#6d28d9] sm:mt-10">
                <Link href={categoryHref} className="hover:underline hover:underline-offset-[3px]">
                  {data.category}
                </Link>
              </p>
            ) : null}
            <h1 className={`${data.category ? "mt-3" : "mt-8 sm:mt-10"} text-balance text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#1a1a2e] sm:text-[44px] lg:text-[48px]`}>{data.title}</h1>
            {data.excerpt ? <p className="mt-5 text-pretty text-[19px] leading-[1.6] text-[#4b5563] sm:text-[20px]">{data.excerpt}</p> : null}
            <Byline data={data} minutes={minutes} />
          </header>

          {/* ── The cover, the reading column's width ───────────────── */}
          {cover ? (
            <div className={`${COLUMN} relative mt-8 aspect-[40/21] overflow-hidden rounded-2xl bg-[#eef0f3] sm:mt-10 min-[1200px]:row-start-2`} data-blog-cover="">
              <BlogImage src={cover} alt={data.coverAlt || data.title} fill priority sizes="(min-width: 1200px) 760px, (min-width: 768px) 720px, calc(100vw - 32px)" className="object-cover" />
            </div>
          ) : null}

          {/* ── The rail: contents and the card ─────────────────────── */}
          <aside className="hidden min-[1200px]:col-start-1 min-[1200px]:row-span-3 min-[1200px]:row-start-1 min-[1200px]:block" aria-label="Contents and sign up">
            {/* Round 49: from the top of the page, level with the category line, so the left is not empty beside the title. The contents take the rail's height and scroll inside it when long; the card stays in view under them. */}
            <div className="sticky top-[96px] mt-[68px] flex max-h-[calc(100vh-120px)] flex-col gap-6">
              {side.length >= 2 ? (
                <div className="min-h-0 shrink overflow-y-auto overscroll-contain pr-2 [scrollbar-width:thin]" data-blog-toc-scroll="">
                  <OnThisPage items={side} variant="side" />
                </div>
              ) : null}
              <div className="shrink-0">
                <RailCta variant={data.cta} />
              </div>
            </div>
          </aside>

          {/* ── The article ─────────────────────────────────────────── */}
          <div className={`${COLUMN} min-w-0 min-[1200px]:row-start-3`}>
            <div className="mt-8 min-[1200px]:hidden">
              <OnThisPage items={toc} variant="inline" />
            </div>
            <article data-blog-article="" className="mt-10 min-w-0 sm:mt-12">
              <ArticleBlocks blocks={data.blocks} postTitle={data.title} snippets={data.snippets} insertAfter={{ index: ctaSlot(data.blocks), node: <CtaBanner variant={data.cta} /> }} />
            </article>

            <div className="mt-14 flex flex-wrap items-center gap-4 border-t border-[#eceef1] pt-5">
              <ShareButtons url={data.url} title={data.title} label="Share this article" />
            </div>

            <section id="author" aria-labelledby="author-name" className="mt-8 flex scroll-mt-28 gap-4 rounded-2xl border border-[#eceef1] bg-[#fafafb] p-5 sm:gap-5 sm:p-7" data-blog-author="">
              <Avatar who={who} size={56} />
              <div className="min-w-0">
                <p className="text-[14px] text-[#6b7280]">Written by</p>
                <h2 id="author-name" className="mt-0.5 text-[18px] font-semibold text-[#1a1a2e]">
                  {data.authorHref ? (
                    <Link href={data.authorHref} rel="author" className="hover:underline hover:decoration-[#1a1a2e]/30 hover:underline-offset-[3px]">
                      {who.name}
                    </Link>
                  ) : (
                    who.name
                  )}
                  {who.role ? <span className="font-normal text-[#6b7280]">, {who.role}</span> : null}
                </h2>
                <p className="mt-2 text-[16px] leading-[1.6] text-[#4b5563]">
                  {who.bio ||
                    (who.organization
                      ? "The people who build Storelib, writing about selling online, running a store and growing an audience."
                      : `${who.name} writes practical guides for creators at Storelib.`)}
                </p>
                {who.links.length || data.authorHref ? (
                  <ul className="mt-2 flex flex-wrap gap-x-5 text-[15px]">
                    {data.authorHref ? (
                      <li>
                        <Link href={data.authorHref} className="flex min-h-[44px] items-center font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-[3px] hover:decoration-[#1a1a2e]" data-blog-author-page="">
                          All articles by {who.name}
                        </Link>
                      </li>
                    ) : null}
                    {who.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} rel="me noopener" className="flex min-h-[44px] items-center font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-[3px] hover:decoration-[#1a1a2e]">
                          {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>

            {data.previous || data.next ? (
              <nav aria-label="Older and newer articles" className="mt-8 grid gap-3 sm:grid-cols-2" data-blog-prevnext="">
                {data.previous ? <StepLink post={data.previous} dir="previous" /> : <span className="hidden sm:block" />}
                {data.next ? <StepLink post={data.next} dir="next" /> : null}
              </nav>
            ) : null}
          </div>
        </div>

        {/* ── After the article ──────────────────────────────────── */}
        {data.related.length > 0 ? (
          <section aria-labelledby="related-title" className="mx-auto mt-20 max-w-[1200px] border-t border-[#eceef1] pt-12 sm:mt-24" data-blog-related="">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="related-title" className="text-[24px] font-semibold tracking-[-0.02em] text-[#1a1a2e] sm:text-[28px]">
                Related articles
              </h2>
              <Link href="/blog" className="flex min-h-[44px] shrink-0 items-center text-[15px] font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-[3px] hover:decoration-[#1a1a2e]">
                All articles
              </Link>
            </div>
            <div className="mt-6 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {data.related.map((p) => (
                <PostCard key={p.slug} post={p} headingLevel="h3" sizes="(min-width: 1024px) 376px, (min-width: 640px) 50vw, 100vw" />
              ))}
            </div>
          </section>
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
      className={`group flex min-h-[92px] flex-col justify-center rounded-2xl border border-[#e5e7eb] px-5 py-4 transition-colors hover:border-[#c9ccd2] ${dir === "next" ? "sm:items-end sm:text-right" : ""}`}
    >
      <span className="text-[14px] text-[#6b7280]">{dir === "next" ? "Newer article" : "Older article"}</span>
      <span className="mt-1 text-[16px] font-medium leading-snug text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/30 group-hover:underline-offset-[3px]">
        {dir === "previous" ? <span aria-hidden>&larr; </span> : null}
        {post.title}
        {dir === "next" ? <span aria-hidden> &rarr;</span> : null}
      </span>
    </Link>
  )
}
