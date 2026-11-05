import { blogRssXml } from "@/lib/blog/listing"
import { readBlogPosts } from "@/lib/blog/read"

/*
  storelib.com/blog/rss.xml: the blog as RSS 2.0, the newest posts first
  (lib/blog/listing blogRssXml). Every blog page names it with
  <link rel="alternate" type="application/rss+xml">. Rebuilt at most once a
  minute, like the pages; next.config's /blog/:path* rule gives the CDN the
  same minute.
*/
export const revalidate = 60

export async function GET() {
  return new Response(blogRssXml(await readBlogPosts()), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  })
}
