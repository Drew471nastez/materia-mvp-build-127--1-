import Link from "next/link"
import type { BlogPost } from "@/lib/blog/listing"
import { safeImageUrl } from "@/lib/blog/article"
import { BlogImage } from "./blog-image"

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : ""
}

/** A post's picture in a box of a fixed shape, or its category set in type when it has none. */
export function PostCover({ post, sizes, priority = false, ratio = "aspect-[16/10]" }: { post: BlogPost; sizes: string; priority?: boolean; ratio?: string }) {
  const src = safeImageUrl(post.cover_image_url)
  return (
    <div className={`relative ${ratio} overflow-hidden rounded-xl bg-[#eef0f3]`}>
      {src ? (
        <BlogImage src={src} alt="" fill sizes={sizes} priority={priority} className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.015]" />
      ) : (
        <div aria-hidden className="absolute inset-0 flex items-end p-5">
          <span className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a2e]/80">{post.category || "Storelib"}</span>
        </div>
      )}
    </div>
  )
}

/**
 * One post in a list: its picture, category and date, title and excerpt.
 * The whole card is one real <a href>, so a crawler and a keyboard both
 * reach the post from it.
 */
export function PostCard({
  post,
  headingLevel = "h2",
  sizes = "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw",
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
    <article className="group relative">
      <PostCover post={post} sizes={sizes} priority={priority} />
      <p className="mt-4 text-[13px] text-[#6b7280]">
        {post.category ? <span className="font-medium text-[#1a1a2e]">{post.category}</span> : null}
        {post.category && post.published_at ? <span aria-hidden className="mx-1.5 text-[#c4c7cd]">/</span> : null}
        {post.published_at ? <time dateTime={post.published_at}>{shortDate(post.published_at)}</time> : null}
      </p>
      <H className="mt-2 text-[19px] font-semibold leading-[1.3] tracking-[-0.015em] text-[#1a1a2e] sm:text-[20px]">
        <Link href={`/blog/${post.slug}`} className="decoration-[#1a1a2e]/30 decoration-1 underline-offset-[3px] after:absolute after:inset-0 group-hover:underline">
          {post.title}
        </Link>
      </H>
      {post.excerpt ? <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-[#6b7280]">{post.excerpt}</p> : null}
    </article>
  )
}
