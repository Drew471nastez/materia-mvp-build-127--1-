import type { Metadata } from "next"
import { BlogIndex, blogIndexMetadata, blogIndexPage } from "./_blog-index"

/*
  HELD AT THE EDGE FOR A MINUTE, NOT RENDERED FOR EVERY READER (the owner:
  marketing pages served from the CDN). Nothing here depends on who is
  reading: the posts come from the admin client, which reads no cookie. It
  was force-dynamic, so every visit ran a function and the same database
  reads for the same page. Rebuilt in the background at most once a minute,
  the same minute next.config's `/blog/:path*` rule already gives the CDN.
*/
export const revalidate = 60

/* Its own title (no em dash, no "| Storelib" twice), canonical, card and the feed's <link rel="alternate">. */
export const metadata: Metadata = blogIndexMetadata(1)

/* Page 1 of the index; the rest are /blog/page/<n> (./page/[page]/page.tsx), linked from the foot of this one. */
export default async function BlogPage() {
  const first = (await blogIndexPage(1)) ?? { posts: [], page: 1, pages: 1 }
  return <BlogIndex posts={first.posts} page={1} pages={first.pages} />
}
