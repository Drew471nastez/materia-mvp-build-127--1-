import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { fetchPost } from "@/lib/blog/post"
import { createAdminClient } from "@/lib/supabase/admin"
import BlogPostTracker from "./_tracker"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { BLOG_FEED_ALTERNATE, STATIC_BLOG_POSTS, absoluteBlogImage } from "@/lib/blog/listing"
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
export const revalidate = 60

/** The byline the editor gives a post by default, and the four code-written posts'. */
const DEFAULT_BYLINE = "Anisia - Head of Marketing"

/** A post's cover as a full address, or Storelib's share card when it has none or it is an svg. */
function postImage(cover: string | null | undefined): string {
  const url = absoluteBlogImage(cover)
  return url && !/\.svg(?:[?#]|$)/i.test(url) ? url : storelibAssetUrl(STORELIB_OG_IMAGE)
}

const keywordList = (raw: string | null | undefined) =>
  (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)

// ─── Metadata ─────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const dbPost = await fetchPost(slug)
  const staticPost = STATIC_POST_BODIES[slug]
  const source = dbPost || staticPost
  if (!source) return { title: "Post not found", robots: { index: false, follow: true } }

  const title = (dbPost?.seo_title || staticPost?.seo_title || source.title)?.replace(/ \| Storelib(?: Blog)?$/i, "") || source.title
  const description = dbPost?.seo_description || staticPost?.seo_description || source.excerpt || ""
  const keywords = keywordList(dbPost?.seo_keywords || staticPost?.seo_keywords)
  /* A post's picture as a full address; Storelib's card when it has none (an svg is no share card). */
  const cover = postImage(dbPost?.cover_image_url)
  const modified = dbPost?.updated_at || source.published_at || undefined
  const author = (dbPost?.author_name || dbPost?.author || DEFAULT_BYLINE) as string

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
      images: [{ url: cover, width: 1200, height: 630, alt: source.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [cover] },
    /* The posts table has no canonical override column, so a post is canonical at its own address. */
    alternates: { canonical: `https://storelib.com/blog/${slug}`, types: BLOG_FEED_ALTERNATE },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export async function generateStaticParams() {
  const slugs = new Set(Object.keys(STATIC_POST_BODIES))
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from("blog_posts").select("slug").eq("is_published", true)
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
    keywords: (dbPost?.seo_keywords || staticData?.seo_keywords || "") as string,
    description: (dbPost?.seo_description || staticData?.seo_description || dbPost?.excerpt || staticData?.excerpt || "") as string,
  }
  /* A row's blocks (older rows' lists and pictures inside paragraphs lifted out), or the code-written post's lines as blocks. */
  const blocks = dbPost ? normalizeBlocks(dbPost.content) : legacyBlocks(staticData?.content ?? [])

  const [posts, physical] = await Promise.all([readBlogPosts(), isPhysicalCommerceEnabled().catch(() => false)])
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
    category: post.category,
    wordCount: articleWordCount(blocks),
    keywords: keywordList(post.keywords),
  })
  const breadcrumbLd = breadcrumbListJsonLd([
    { name: "Blog", path: "/blog" },
    ...(post.category ? [{ name: post.category, path: blogCategoryPath(post.category) }] : []),
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
          blocks,
          cta: ctaVariant({ title: post.title, slug, keywords: post.keywords, category: post.category }, physical),
          related: relatedPosts(posts, { slug, category: post.category }, 3),
          previous,
          next,
        }}
      />
    </>
  )
}
