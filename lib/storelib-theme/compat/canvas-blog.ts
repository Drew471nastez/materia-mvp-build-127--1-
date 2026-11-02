/**
 * THE WEBSITE'S BLOG IN THE BUILDER'S CANVAS, for an imported theme: what
 * GET /api/website-builder/themes/<id>/blog/canvas answered (its live and
 * scheduled posts, or Storelib's sample posts while it has none), made into
 * what the canvas draws a page with. The Blog page shows the blog, the Post
 * page the post asked for (else the newest), and a featured blog section on
 * any page the posts, as the website draws them (./site.ts).
 *
 * Pure: components/website-builder/compat/use-canvas-blog.ts reads the
 * answer, the canvas (compat-canvas.tsx) draws with this.
 */
import type { BlogListing, PublicPost, PublicPostCard, SiteBlogSettings } from "@/lib/site-blog/types"
import { blogPath } from "@/lib/site-blog/urls"
import { articleObject, blogObject } from "./objects"
import type { CompatPage } from "./theme"
import type { CompatBlogSource } from "./site"

/** The canvas route's answer (lib/site-blog, blueprint §C `blog/canvas`). */
export interface CanvasBlog {
  settings: SiteBlogSettings
  listing: Pick<BlogListing, "posts"> & Partial<BlogListing>
  post: PublicPost | null
  /** Storelib's sample posts, shown while the blog has none of its own. */
  sample: boolean
}

/** Whether a page wants the blog: its Blog or Post template, or a section with a blog or article setting. */
export function wantsCanvasBlog(template: string, settingTypes: readonly string[]): boolean {
  return template === "blog" || template === "article" || settingTypes.some((t) => t === "blog" || t === "article")
}

const cardsOf = (data: CanvasBlog): PublicPostCard[] => (Array.isArray(data.listing?.posts) ? data.listing.posts : [])

/** What a page of the canvas is drawn with: its address, the whole blog, and on the Blog and Post templates the page's own blog and post. */
export function canvasBlogPage(data: CanvasBlog | null | undefined, template: string): Pick<CompatPage, "siteBlog" | "blogData"> & { path?: string } {
  if (!data?.settings) return {}
  const cards = cardsOf(data)
  if (!cards.length && !data.post) return {}
  const handle = data.settings.handle
  const all = cards.map((c) => articleObject(c, handle))
  const siteBlog = blogObject(data.settings, cards, { all })
  if (template === "blog") return { siteBlog, path: blogPath(handle), blogData: { blog: siteBlog, settings: data.settings, cards } }
  if (template === "article") {
    const post = data.post ?? cards[0]
    const article = articleObject(post, handle)
    return { siteBlog, path: post.path, blogData: { blog: siteBlog, article, settings: data.settings, ...(data.post ? { post: data.post } : {}) } }
  }
  return { siteBlog }
}

/** The blog as the canvas's own requests read it (a section drawn again, a page of posts): its posts, and the one post it holds. */
export function canvasBlogSource(data: CanvasBlog | null | undefined): CompatBlogSource | undefined {
  if (!data?.settings) return undefined
  const cards = cardsOf(data)
  return {
    settings: data.settings,
    cards,
    post: async (slug) => (data.post && data.post.slug === slug ? data.post : null),
    preview: async () => null,
    redirect: async () => null,
  }
}
