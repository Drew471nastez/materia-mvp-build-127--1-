/**
 * Three example posts the builder's canvases draw while a blog has nothing
 * published, so the Blog and Post templates can be designed before the
 * first post exists. The canvas payload marks them `sample: true`; they are
 * never read by a live page (lib/site-blog/public-read.ts has no path to
 * them).
 */
import type { SiteBlock } from "./blocks"
import { renderBlocksHtml, summaryHtml } from "./render-html"
import type { PublicPost } from "./types"
import { categoryPath, postPath } from "./urls"
import { readMinutes, wordCount } from "@/lib/blog/editor-tools"

const DAY = 24 * 60 * 60 * 1000

interface Seed {
  slug: string
  title: string
  excerpt: string
  category: { slug: string; name: string }
  tags: string[]
  featured: boolean
  blocks: SiteBlock[]
}

const SEEDS: Seed[] = [
  {
    slug: "welcome-to-the-blog",
    title: "Welcome to the blog",
    excerpt: "What this space is for, and what you can expect to read here.",
    category: { slug: "news", name: "News" },
    tags: ["news"],
    featured: true,
    blocks: [
      { id: "s1a", type: "p", html: "This is an example post. Your own posts appear here as soon as you publish one from <b>Website Settings → Blog</b>." },
      { id: "s1b", type: "h2", html: "Write in blocks" },
      { id: "s1c", type: "p", html: "Headings, pictures, galleries, videos, quotes, lists, tables and buttons all take the look of your theme." },
      { id: "s1d", type: "quote", html: "Every post you publish is styled by this one template." },
    ],
  },
  {
    slug: "behind-the-scenes",
    title: "Behind the scenes",
    excerpt: "A look at how things are made, from the first idea to the finished piece.",
    category: { slug: "stories", name: "Stories" },
    tags: ["process", "stories"],
    featured: false,
    blocks: [
      { id: "s2a", type: "p", html: "An example post showing how a longer story reads on your site." },
      { id: "s2b", type: "ul", items: ["Start with an idea", "Shape it into something real", "Share it with the people who care"] },
      { id: "s2c", type: "p", html: "Example text: replace it by publishing your own posts." },
    ],
  },
  {
    slug: "three-tips-to-get-started",
    title: "Three tips to get started",
    excerpt: "Short, practical advice for anyone just beginning.",
    category: { slug: "guides", name: "Guides" },
    tags: ["guides", "tips"],
    featured: false,
    blocks: [
      { id: "s3a", type: "p", html: "An example post with a numbered list." },
      { id: "s3b", type: "ol", items: ["Keep it simple", "Be consistent", "Ask for feedback"] },
      { id: "s3c", type: "callout", tone: "tip", html: "Example text: your own posts replace these." },
    ],
  },
]

export function samplePosts(handle: string, now: number = Date.now()): PublicPost[] {
  return SEEDS.map((s, i) => {
    const at = new Date(now - (i * 3 + 1) * DAY).toISOString()
    const words = wordCount(s.blocks)
    return {
      id: `sample-${i + 1}`,
      slug: s.slug,
      path: postPath(handle, s.slug),
      title: s.title,
      excerpt: s.excerpt,
      summaryHtml: summaryHtml(s.blocks, 30),
      coverImageUrl: "",
      coverAlt: "",
      category: { ...s.category, path: categoryPath(handle, s.category.slug) },
      tags: s.tags,
      author: null,
      publishedAt: at,
      updatedAt: at,
      readingMinutes: readMinutes(words),
      featured: s.featured,
      blocks: s.blocks,
      html: renderBlocksHtml(s.blocks),
      wordCount: words,
      seo: { title: "", description: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: true },
    }
  })
}
