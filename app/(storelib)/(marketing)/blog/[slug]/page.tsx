import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { expandSnippets, fetchPost, readBlogAuthor, readBlogSnippets } from "@/lib/blog/post"
import { liveDateFilter } from "@/lib/blog/schedule"
import { readBlogCategories } from "@/lib/blog/categories"
import { createAdminClient } from "@/lib/supabase/admin"
import BlogPostTracker from "./_tracker"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { BLOG_FEED_ALTERNATE, STATIC_BLOG_POSTS, absoluteBlogImage, blogAuthorPath } from "@/lib/blog/listing"
import { readBlogPosts } from "@/lib/blog/read"
import { articleWordCount, blogCategoryPath, ctaVariant, legacyBlocks, normalizeBlocks, postNeighbours, relatedPosts } from "@/lib/blog/article"
import { blogPostingJsonLd, breadcrumbListJsonLd, videoObjectsJsonLd } from "@/lib/blog/structured-data"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { ArticleView } from "../_components/article-view"
import { STATIC_POST_BODIES } from "../_components/static-posts"

/*
  HELD AT THE EDGE FOR A MINUTE, NOT RENDERED FOR EVERY READER (the owner:
  marketing pages served from the CDN). Nothing here depends on who is
  reading: the posts come from the admin client, which reads no cookie. It
  was force-dynamic, so every visit ran a function and the same database
  reads for the same page. Rebuilt in the background at most once a minute,
  the same minute next.config's `/blog/:path*` rule already gives the CDN.
*/
/* An hour (round 54, Vercel cost): saving, publishing and a post going live clear these at once (lib/blog/admin-http.ts, went-live.ts; the platform switch clears /help). */
export const revalidate = 3600

/** The byline the editor gives a post by default, and the four code-written posts'. */
const DEFAULT_BYLINE = "Anisia - Head of Marketing"

/** A post's cover as a full address, or Storelib's share card when it has none or it is an svg. */
function postImage(cover: string | null | undefined): string {
  const url = absoluteBlogImage(cover)
  return url && !/\.svg(?:[?#]|$)/i.test(url) ? url : storelibAssetUrl(STORELIB_OG_IMAGE)
}

const keywordList = (raw: string | null | undefined, tags?: unknown) => [
  ...new Set([
    ...(raw ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    ...(Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : []),
  ]),
]

/** The post's own canonical when the editor set one (an absolute https address), else its address here. */
function canonicalOf(slug: string, raw: unknown): string {
  return typeof raw === "string" && /^https:\/\/[^\s]+$/i.test(raw.trim()) ? raw.trim() : `https://storelib.com/blog/${slug}`
}

// ─── Metadata ─────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const dbPost = await fetchPost(slug)
  const staticPost = STATIC_POST_BODIES[slug]
  const source = dbPost || staticPost
  if (!source) return { title: "Post not found", robots: { index: false, follow: true } }

  const title = (dbPost?.seo_title || staticPost?.seo_title || source.title)?.replace(/ \| Storelib(?: Blog)?$/i, "") || source.title
  const description = dbPost?.seo_description || staticPost?.seo_description || source.excerpt || ""
  const keywords = keywordList(dbPost?.seo_keywords || staticPost?.seo_keywords, dbPost?.tags)
  /* The share picture the editor chose, else the cover; Storelib's card when neither is a usable picture (an svg is no share card). */
  const cover = postImage(dbPost?.og_image_url || dbPost?.cover_image_url)
  const modified = dbPost?.updated_at || source.published_at || undefined
  const profile = await readBlogAuthor(dbPost?.author_id)
  const author = (profile?.name || dbPost?.author_name || dbPost?.author || DEFAULT_BYLINE) as string
  const canonical = canonicalOf(slug, dbPost?.canonical_url)
  const noindex = dbPost?.noindex === true

  return {
    title,
    description,
    keywords: keywords.length ? keywords : undefined,
    openGraph: {
      title,
      description,
      url: `https://storelib.com/blog/${slug}`,
      type: "article",
      siteName: "Storelib",
      publishedTime: source.published_at || undefined,
      modifiedTime: modified,
      authors: [author],
      section: source.category || undefined,
      tags: keywords.length ? keywords : undefined,
      images: [{ url: cover, width: 1200, height: 630, alt: (dbPost?.cover_alt as string | undefined) || source.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [cover] },
    /* Its own address, or the canonical_url the editor set (round 45, SQL part 345). */
    alternates: { canonical, types: BLOG_FEED_ALTERNATE },
    /* noindex set in the editor: kept out of search, links still followed (and out of the sitemap, lib/blog/read blogSlugsNotInSitemap). */
    robots: noindex ? { index: false, follow: true, googleBot: { index: false, follow: true } } : { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export async function generateStaticParams() {
  const slugs = new Set(Object.keys(STATIC_POST_BODIES))
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from("blog_posts").select("slug").eq("is_published", true).or(liveDateFilter())
    ;(data || []).forEach((p: { slug: string }) => slugs.add(p.slug))
  } catch {}
  return [...slugs].map((slug) => ({ slug }))
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const dbPost = await fetchPost(slug)
  const staticData = STATIC_POST_BODIES[slug]
  if (!dbPost && !staticData) notFound()
  const listed = STATIC_BLOG_POSTS.find((p) => p.slug === slug)

  const url = `https://storelib.com/blog/${slug}`
  const post = {
    id: dbPost?.id as string | undefined,
    title: (dbPost?.title || staticData?.title) as string,
    excerpt: (dbPost?.excerpt || staticData?.excerpt || "") as string,
    category: (dbPost?.category || staticData?.category || "") as string,
    published_at: (dbPost?.published_at || staticData?.published_at || null) as string | null,
    /* The row's last save; the publish date when it has none. */
    updated_at: (dbPost?.updated_at || dbPost?.published_at || staticData?.published_at || null) as string | null,
    cover_image_url: (dbPost ? dbPost.cover_image_url : listed?.cover_image_url) as string | null | undefined,
    byline: (dbPost?.author_name || dbPost?.author || DEFAULT_BYLINE) as string,
    keywords: keywordList((dbPost?.seo_keywords || staticData?.seo_keywords || "") as string, dbPost?.tags),
    cover_alt: (dbPost?.cover_alt || null) as string | null,
    description: (dbPost?.seo_description || staticData?.seo_description || dbPost?.excerpt || staticData?.excerpt || "") as string,
  }
  /* A row's blocks (older rows' lists and pictures inside paragraphs lifted out), or the code-written post's lines as blocks. */
  const rowBlocks = dbPost ? normalizeBlocks(dbPost.content) : legacyBlocks(staticData?.content ?? [])
  /* Reusable blocks (blog_snippets) put in place on the server, so the page, its contents list and its read time all see them. */
  const blocks = dbPost ? normalizeBlocks(expandSnippets(rowBlocks, await readBlogSnippets(rowBlocks))) : rowBlocks

  const [posts, physical, profile, categories] = await Promise.all([readBlogPosts(), isPhysicalCommerceEnabled().catch(() => false), readBlogAuthor(dbPost?.author_id), readBlogCategories()])
  const { previous, next } = postNeighbours(posts, slug)

  const jsonLd = blogPostingJsonLd({
    url,
    title: post.title,
    description: post.description,
    images: [absoluteBlogImage(post.cover_image_url)],
    fallbackImage: STORELIB_OG_IMAGE,
    published: post.published_at,
    modified: post.updated_at,
    byline: post.byline,
    profile,
    authorUrl: profile?.slug ? blogAuthorPath(profile.slug) : null,
    category: post.category,
    wordCount: articleWordCount(blocks),
    keywords: post.keywords,
  })
  const breadcrumbLd = breadcrumbListJsonLd([
    { name: "Blog", path: "/blog" },
    ...(post.category ? [{ name: post.category, path: blogCategoryPath(post.category, 1, categories) }] : []),
    { name: post.title, path: `/blog/${slug}` },
  ])
  const videos = videoObjectsJsonLd(blocks, { title: post.title, description: post.description, url })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />
      {videos.map((v, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(v) }} />
      ))}
      {post.id && <BlogPostTracker postId={post.id} />}
      <ArticleView
        data={{
          slug,
          url,
          title: post.title,
          excerpt: post.excerpt,
          category: post.category,
          published_at: post.published_at,
          updated_at: post.updated_at,
          cover: post.cover_image_url ?? null,
          byline: post.byline,
          author: profile,
          authorHref: profile?.slug ? blogAuthorPath(profile.slug) : null,
          categoryHref: post.category ? blogCategoryPath(post.category, 1, categories) : "/blog",
          coverAlt: post.cover_alt,
          blocks,
          cta: ctaVariant({ title: post.title, slug, keywords: post.keywords.join(","), category: post.category }, physical),
          related: relatedPosts(posts, { slug, category: post.category }, 3),
          previous,
          next,
          physical,
        }}
      />
    </>
  )
}
