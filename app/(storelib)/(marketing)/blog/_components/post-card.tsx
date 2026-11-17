import Link from "next/link"
import type { BlogPost } from "@/lib/blog/listing"
import { safeImageUrl } from "@/lib/blog/article"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { BlogImage } from "./blog-image"

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : ""
}

/**
 * A SOFT SURFACE PER CATEGORY for a post with no cover (round 47: the index
 * drew an empty grey box with the category in it). Flat tints, no gradient,
 * the text always Storelib's ink; an unknown category gets the neutral one.
 */
const TINTS: Record<string, { bg: string; ink: string }> = {
  "Getting Started": { bg: "bg-[#f3f0ff]", ink: "text-[#6d28d9]" },
  "Creator Tips": { bg: "bg-[#edf6f0]", ink: "text-[#2f6b4f]" },
  Growth: { bg: "bg-[#fcf3e6]", ink: "text-[#8a5212]" },
  Strategy: { bg: "bg-[#edf1fa]", ink: "text-[#36539c]" },
  "Case Studies": { bg: "bg-[#fbeff3]", ink: "text-[#9b2f55]" },
  Tutorials: { bg: "bg-[#ebf5f7]", ink: "text-[#25616d]" },
}
const NEUTRAL = { bg: "bg-[#f3f3f6]", ink: "text-[#4b5563]" }
export function categoryTint(category: string | null | undefined): { bg: string; ink: string } {
  return (category && TINTS[category]) || NEUTRAL
}

/**
 * A post's picture in a box of a fixed shape. With no picture, a typographic
 * card in its place: the category and the title set in type on the
 * category's tint, sized to the box (container units), hidden from screen
 * readers because the card's own title says it.
 */
export function PostCover({ post, sizes, priority = false, ratio = "aspect-[16/10]", rounded = "rounded-[20px]" }: { post: BlogPost; sizes: string; priority?: boolean; ratio?: string; /** Its corners; "" inside a card that clips its own. */ rounded?: string }) {
  const src = safeImageUrl(post.cover_image_url)
  const tint = categoryTint(post.category)
  return (
    <div className={`relative ${ratio} overflow-hidden ${rounded} ${src ? "bg-[#eef0f3]" : tint.bg} @container`}>
      {src ? (
        <BlogImage src={src} alt="" fill sizes={sizes} priority={priority} className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.025] motion-reduce:transition-none" />
      ) : (
        <div aria-hidden className="absolute inset-0 flex flex-col justify-between p-[7cqw]" data-blog-cover-fallback="">
          <span className="flex items-center gap-2">
            <StorelibLogo size={22} alt="" />
            <span className={`text-[14px] font-medium ${tint.ink}`}>{post.category || "Storelib"}</span>
          </span>
          <span className="line-clamp-3 text-[clamp(18px,6.4cqw,34px)] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e]">{post.title}</span>
        </div>
      )}
    </div>
  )
}

/**
 * One post in a list: its picture, category and date, title and excerpt.
 * The whole card is one real <a href>, so a crawler and a keyboard both
 * reach the post from it. Cards in a row are the same height: the title
 * holds up to three lines and the excerpt two.
 *
 * Blog round 15, the owner: cards in Storelib's own card, as /app draws
 * one (white, rounded-2xl, a hairline and a soft drop), the picture across
 * its top. Hovered, the card lifts 2px and its drop deepens; pressed, it
 * settles back. Transform and shadow only, off with reduced motion.
 */
export function PostCard({
  post,
  headingLevel = "h2",
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  priority = false,
}: {
  post: BlogPost
  headingLevel?: "h2" | "h3"
  sizes?: string
  /**
   * The first card of a list with no large post above it (a category, an
   * author, /blog/page/N): on a phone its picture is the largest thing on
   * the first screen, so it is the page's LCP. Lazy, the browser only asked
   * for it after layout; measured live on /blog/category/creator-tips
   * (round 46) the LCP was this lazily loaded picture.
   */
  priority?: boolean
}) {
  const H = headingLevel
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#e5e7eb] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(26,26,46,0.22)] active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,0,0,0.05)] has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-[#1a1a2e]/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-blog-card=""
    >
      <PostCover post={post} sizes={sizes} priority={priority} rounded="" />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-[#6b7280]">
          {post.category ? <span className={`font-medium ${categoryTint(post.category).ink}`}>{post.category}</span> : null}
          {post.category && post.published_at ? <span aria-hidden className="text-[#c4c7cd]">·</span> : null}
          {post.published_at ? <time dateTime={post.published_at}>{shortDate(post.published_at)}</time> : null}
        </p>
        <H className="mt-2 line-clamp-3 text-balance text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-[#1a1a2e] sm:text-[19px]">
          <Link href={`/blog/${post.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl">
            {post.title}
          </Link>
        </H>
        {post.excerpt ? <p className="mt-2 line-clamp-2 text-[14px] leading-[1.55] text-[#6b7280]">{post.excerpt}</p> : null}
      </div>
    </article>
  )
}
