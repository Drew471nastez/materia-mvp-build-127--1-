/**
 * ===========================================================================
 *  ROUND 46: CORE WEB VITALS OF THE SEO ROUND'S PAGES, MEASURED LIVE
 * ===========================================================================
 * scripts/check-live-vitals.mjs measured production (390x844 @3x, CPU 4x,
 * Fast 4G, median of three; and 1440 unthrottled). The blog, /sell,
 * /features and /alternatives were already good on LCP and CLS; what this
 * suite pins is what the measurement found wrong, and what was right and
 * must stay right:
 *
 *   1. A list with no large post above it (a category, an author, /blog/page/N)
 *      had its first card's picture as the phone's LCP, loaded lazily: the
 *      browser only asked for it after layout. The first card is now eager
 *      with fetchpriority high, and only the first.
 *   2. The large post on /blog and an article's cover keep priority and
 *      their sizes; cards keep theirs.
 *   3. Both YouTube facades draw a thumbnail and no player: no iframe and no
 *      YouTube script before a press, the thumbnail lazy.
 *   4. The phone's header search strip is drawn only once the header has been
 *      measured. At headerH 0 it was drawn at the top and moved 63px down a
 *      frame later: 0.010 CLS on /sell/digital-products.
 *   5. No preconnect to a host nothing loads from (cdn.sanity.io was one on
 *      every marketing page).
 *   6. The measuring script keeps the throttling and the thresholds it was
 *      measured with, so a later run compares like with like.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import type { BlogPost } from "@/lib/blog/listing"
import BlogListing from "@/app/(storelib)/(marketing)/blog/_blog-listing"
import { PostCard } from "@/app/(storelib)/(marketing)/blog/_components/post-card"
import { YouTubeFacade } from "@/app/(storelib)/(marketing)/blog/_components/youtube-facade"
import { VideoPlayer } from "@/components/marketing/video-player"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))

const post = (i: number, cover: string | null): BlogPost => ({
  id: `p${i}`,
  slug: `post-${i}`,
  title: `Post ${i}`,
  excerpt: "x",
  category: "Growth",
  published_at: "2026-09-01T00:00:00Z",
  read_time: "3 min read",
  cover_image_url: cover,
})
/* One hot-linked cover (a plain <img>) and one Storelib file (next/image), so both paths are held. */
const HOTLINK = "https://example.com/cover.jpg"
const OWN = "https://storelib.com/media/blog/cover.webp"
const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? []
const eager = (tag: string | undefined) => !!tag && /fetchPriority="high"|fetchpriority="high"/i.test(tag) && !/loading="lazy"/.test(tag)
const lazy = (tag: string | undefined) => !!tag && /loading="lazy"/.test(tag) && !/fetchPriority="high"/i.test(tag)

function main() {
  console.log("\n1. The first card of a list with no large post is the LCP picture")
  {
    /*
      Drawn with hot-linked covers: those are BlogImage's plain <img>, whose
      loading and fetchpriority are its own. next/image is a stub under this
      runner (scripts/push-test-loader.mjs drops `priority`), so the Storelib
      file path is held by reading that BlogImage hands priority on.
    */
    const html = renderToStaticMarkup(createElement(BlogListing, { posts: [post(1, HOTLINK), post(2, HOTLINK), post(3, HOTLINK), post(4, HOTLINK)], activeCategory: "Growth" }))
    const tags = imgs(html)
    check("a category's first card is eager with fetchpriority high", tags.length === 4 && eager(tags[0]), tags[0])
    check("  and every other card stays lazy", tags.slice(1).every(lazy), tags.slice(1))
    const image = code("app/(storelib)/(marketing)/blog/_components/blog-image.tsx")
    check("  a Storelib file gets the same priority through next/image", (image.match(/<Image [^>]*priority=\{priority\}/g) ?? []).length === 2)
    check("  and the card hands it to its cover", /<PostCover post=\{post\} sizes=\{sizes\} priority=\{priority\} \/>/.test(code("app/(storelib)/(marketing)/blog/_components/post-card.tsx")))
    const author = code("app/(storelib)/(marketing)/blog/_blog-author.tsx")
    check("an author's first card has priority, only the first", /posts\.map\(\(post, i\) => \(\s*<PostCard key=\{post\.id\} post=\{post\} headingLevel="h3" priority=\{i === 0\} \/>/.test(author))
    const card = renderToStaticMarkup(createElement(PostCard, { post: post(9, HOTLINK) }))
    check("a card on its own is lazy (priority is opt in)", imgs(card).length === 1 && lazy(imgs(card)[0]))
  }

  console.log("\n2. The index's large post, the article cover and the cards keep priority and sizes")
  {
    const html = renderToStaticMarkup(createElement(BlogListing, { posts: [post(1, HOTLINK), post(2, HOTLINK), post(3, HOTLINK)], activeCategory: null, featured: true }))
    const tags = imgs(html)
    check("the large post's picture is the one with priority; the cards under it stay lazy", tags.length === 3 && eager(tags[0]) && tags.slice(1).every(lazy), tags)
    const own = renderToStaticMarkup(createElement(BlogListing, { posts: [post(1, OWN), post(2, OWN)], activeCategory: null, featured: true }))
    check("  with its sizes, phone first at the full column", /sizes="\(min-width: 1240px\) 680px, \(min-width: 1024px\) 56vw, 100vw"/.test(imgs(own)[0] ?? ""), imgs(own))
    check("  the cards below it carry the three column sizes", /sizes="\(min-width: 1024px\) 380px, \(min-width: 640px\) 50vw, 100vw"/.test(imgs(own)[1] ?? ""))
    const view = code("app/(storelib)/(marketing)/blog/_components/article-view.tsx")
    /* Changed on purpose (round 47): the cover is the reading column's width (720px), in the 1200x630 shape share cards are made in, so a cover with words on it is not cropped. */
    /* Changed on purpose (round 49): the reading column is 760px from 1200px, so the cover asks for 760px there. */
    check("an article's cover has priority and its sizes", /<BlogImage src=\{cover\} alt=\{[^}]+\} fill priority sizes="\(min-width: 1200px\) 760px, \(min-width: 768px\) 720px, calc\(100vw - 32px\)"/.test(view))
    check("  in a box of a fixed shape, so it shifts nothing", /relative mt-8 aspect-\[40\/21\] overflow-hidden/.test(view))
    check("a hot-linked picture with priority is eager and fetchpriority high; without, lazy", /loading=\{priority \? "eager" : "lazy"\}/.test(code("app/(storelib)/(marketing)/blog/_components/blog-image.tsx")) && /priority \? \{ fetchPriority: "high" as const \}/.test(code("app/(storelib)/(marketing)/blog/_components/blog-image.tsx")))
  }

  console.log("\n3. No YouTube player, frame or script before a press")
  {
    const facade = renderToStaticMarkup(createElement(YouTubeFacade, { videoId: "dQw4w9WgXcQ", title: "A video", chapters: [{ seconds: 30, stamp: "0:30", label: "Part" }], chapterHrefs: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"] }))
    check("the blog facade draws no iframe and no script", !/<iframe|<script/i.test(facade), facade.slice(0, 300))
    check("  its thumbnail is lazy, from i.ytimg.com, with a width and height", imgs(facade).length === 1 && lazy(imgs(facade)[0]) && /i\.ytimg\.com/.test(imgs(facade)[0] ?? "") && /width="480"/.test(imgs(facade)[0] ?? "") && /height="360"/.test(imgs(facade)[0] ?? ""))
    check("  in a 16:9 box", /aspect-video/.test(facade))
    check("  and nothing from youtube.com but links", !/(src|href)="https:\/\/www\.youtube(-nocookie)?\.com\/(embed|iframe_api|s\/)/.test(facade))
    const player = renderToStaticMarkup(createElement(VideoPlayer, { id: "dQw4w9WgXcQ", title: "A video", chapters: [] }))
    check("the marketing video player draws no iframe and no script", !/<iframe|<script/i.test(player))
    check("  its thumbnail is lazy too", imgs(player).length === 1 && lazy(imgs(player)[0]))
    const both = code("app/(storelib)/(marketing)/blog/_components/youtube-facade.tsx") + code("components/marketing/video-player.tsx")
    check("neither loads the IFrame API script", !/iframe_api|youtube\.com\/s\/player|createElement\(["']script/.test(both))
  }

  console.log("\n4. The header's phone search strip waits for the header's height")
  {
    const header = code("components/platform/platform-header-client.tsx")
    check("the strip renders only once headerH is measured", /\{headerH > 0 && searchInHeader && !tabsHere/.test(header))
    check("  and its top is that height", /data-header-search-strip=""[\s\S]{0,200}style=\{\{ top: headerH \}\}/.test(header))
    check("  headerH still starts at 0 and is measured in an effect", /const \[headerH, setHeaderH\] = useState\(0\)/.test(header))
  }

  console.log("\n5. No preconnect to a host nothing loads from")
  {
    const layout = code("app/(storelib)/(marketing)/layout.tsx")
    check("the marketing layout opens no connection to cdn.sanity.io", !/cdn\.sanity\.io/.test(layout))
    const hosts = [...layout.matchAll(/rel="preconnect" href="([^"]+)"/g)].map((m) => m[1])
    check("  and any preconnect it has is to a host the code names elsewhere", hosts.every((h) => read("next.config.mjs").includes(new URL(h).hostname) || read("app/(storelib)/layout.tsx").includes(new URL(h).hostname)), hosts)
  }

  console.log("\n6. The measuring script")
  {
    const s = code("scripts/check-live-vitals.mjs")
    check("CPU 4x through CDP", /Emulation\.setCPUThrottlingRate", \{ rate: 4 \}/.test(s))
    check("Fast 4G: 9 Mbps down, 1.5 up, 60 ms", /latency: 60, downloadThroughput: \(9 \* 1024 \* 1024\) \/ 8, uploadThroughput: \(1\.5 \* 1024 \* 1024\) \/ 8/.test(s))
    check("390x844 at 3x, and a 1440 desktop pass", /width: 390, height: 844 \}, deviceScaleFactor: 3/.test(s) && /width: 1440/.test(s))
    check("TBT counts long tasks after FCP, the part over 50 ms", /filter\(\(t\) => t\.start >= fcp\)\.reduce\(\(s, t\) => s \+ Math\.max\(0, t\.duration - 50\), 0\)/.test(s))
    check("good is LCP 2.5 s, CLS 0.1, TBT 200 ms", /GOOD = \{ lcp: 2500, cls: 0\.1, tbt: 200 \}/.test(s))
    check("the median of three cold loads by default", /RUNS \?\? 3/.test(s) && /browser\.newContext/.test(s))
    check("every page the round measured is in the default list", ["/pricing", "/features", "/sell/digital-products", "/alternatives/gumroad", "/blog/category/", "andrewrullz.storelib.com", "help.storelib.com"].every((p) => s.includes(p)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
