import { slugify } from "@/lib/blog/editor-model"

export const DEFAULT_BLOG_HANDLE = "news"
/** Words a post's address can't be: the blog's own sub-addresses use them. */
export const RESERVED_POST_SLUGS: readonly string[] = ["tagged", "category", "page", "feed", "rss", "atom", "~preview"]

const POST_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HANDLE = /^[a-z0-9][a-z0-9-]{0,62}$/

export function postSlugFrom(text: string): string {
  return slugify(text).slice(0, 120).replace(/-+$/g, "")
}

export function isPostSlug(s: string): boolean {
  return typeof s === "string" && s.length > 0 && s.length <= 120 && POST_SLUG.test(s) && !RESERVED_POST_SLUGS.includes(s)
}

export function isBlogHandle(s: string): boolean {
  return typeof s === "string" && HANDLE.test(s) && !s.endsWith("-")
}

/** base, or base-2, base-3 … whichever is not taken. An empty or reserved base becomes "post". */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = isPostSlug(base) ? base : postSlugFrom(base) && isPostSlug(postSlugFrom(base)) ? postSlugFrom(base) : "post"
  if (!taken.has(root)) return root
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`
    const next = `${root.slice(0, 120 - suffix.length).replace(/-+$/g, "")}${suffix}`
    if (!taken.has(next)) return next
  }
  return `${root.slice(0, 100)}-${Date.now().toString(36)}`
}
