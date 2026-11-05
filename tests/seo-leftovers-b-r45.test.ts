/**
 * ===========================================================================
 *  ROUND 45, LEFTOVERS B: AUTHOR PAGES, HELP MARKUP, FILE LIMITS, PROFILES,
 *  AND PICTURES LINKED FROM OTHER SITES
 * ===========================================================================
 * AUTHOR PAGES   /blog/author/<slug>: the profile and its live posts, real
 *                page links, its own canonical, ProfilePage + Person with
 *                sameAs, BreadcrumbList Blog > Authors > name, noindex with
 *                no live post, a 404 for an unknown slug or no table; the
 *                byline and author box link it; the BlogPosting author has
 *                it as url; the sitemap lists only authors with a live post.
 * HELP MARKUP    no FAQPage, no HowTo; TechArticle and BreadcrumbList stay.
 * FILE LIMITS    the help article and the marketing copy say the upload
 *                policy's own per-file limit.
 * PROFILES       one list (STORELIB_SOCIAL) for the footer and the
 *                Organization's sameAs; nothing unconfirmed.
 * COPY IMAGES    the URL and address guard, every private range; the content
 *                checks by declared type and by bytes; the download with
 *                redirects, size and type refusals; a post's addresses
 *                swapped in place; the routes are admin only.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import type { Block } from "@/lib/blog/blocks"
import { BLOG_PAGE_SIZE, blogAuthorPath, blogAuthorSitemapEntries, blogSitemapEntries } from "@/lib/blog/listing"
import { authorSameAs, blogAuthorJsonLd, blogPostingJsonLd } from "@/lib/blog/structured-data"
import { BlogAuthorView, BlogAuthorsIndexView, authorDescription, blogAuthorMetadataFor, blogAuthorsIndexMetadata } from "@/app/(storelib)/(marketing)/blog/_blog-author"
import { ArticleView } from "@/app/(storelib)/(marketing)/blog/_components/article-view"
import { helpArticleJsonLd } from "@/lib/help/structured-data"
import { HELP_CATEGORIES, helpArticle, helpArticlesIn, articleText } from "@/lib/help/articles"
import { MAX_UPLOAD_BYTES, formatLimit } from "@/lib/security/uploads/policy"
import { PRODUCT_FILE_LIMIT } from "@/lib/marketing/facts"
import { STORELIB_SAME_AS, STORELIB_SOCIAL, storelibOrganizationJsonLd } from "@/lib/seo/structured-data"
import { COPY_IMAGE_MAX_BYTES, COPY_IMAGE_MAX_REDIRECTS, COPY_IMAGE_TIMEOUT_MS, addressesProblem, copyImageUrlProblem, declaredType, imageContentProblem } from "@/lib/blog/copy-image-guard"
import { externalImagesOf, hostList, isExternalImage, replaceImageUrls } from "@/lib/blog/external-images"
import { copyExternalImage, copyPostImages, downloadExternalImage, type CopyDeps } from "@/lib/blog/copy-image"

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const PNG = new Uint8Array(readFileSync(join(process.cwd(), "public/placeholder-logo.png")))
const JPG = new Uint8Array(readFileSync(join(process.cwd(), "public/images/brand/storelib-og-v2.jpg")))
const WEBP = new Uint8Array(readFileSync(join(process.cwd(), "public/carriers/sendle.webp")))
const GIF_HEAD = new Uint8Array([...Buffer.from("GIF89a"), 1, 0, 1, 0, 0, 0, 0])
const AVIF_HEAD = new Uint8Array([0, 0, 0, 0x1c, ...Buffer.from("ftypavif"), 0, 0, 0, 0, ...Buffer.from("avifmif1miaf")])
const SVG = new Uint8Array(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))
const HTML = new Uint8Array(Buffer.from("<!doctype html><html><body>hi</body></html>"))

const author = { id: "a1", slug: "anisia", name: "Anisia", role: "Head of Marketing", bio: "Writes about pricing and launches.", avatar_url: "https://storelib.com/media/x/avatar.jpg", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/anisia" }, { label: "Site", url: "http://anisia.example.com" }, { label: "Bad", url: "javascript:alert(1)" }], updated_at: "2026-10-01T10:00:00Z" }
const post = (i: number) => ({ id: `p${i}`, slug: `post-${i}`, title: `Post ${i}`, excerpt: "x", category: "Growth", published_at: new Date(Date.UTC(2026, 8, 30 - i)).toISOString(), read_time: "", cover_image_url: null })

async function main() {
  console.log("\n1. Author pages")
  {
    check("the address: /blog/author/<slug>, page N after it", blogAuthorPath("anisia") === "/blog/author/anisia" && blogAuthorPath("anisia", 1) === "/blog/author/anisia" && blogAuthorPath("anisia", 3) === "/blog/author/anisia/page/3")
    const html = renderToStaticMarkup(createElement(BlogAuthorView, { author, posts: [post(1), post(2)], total: 51, page: 1, pages: 2 }))
    check("shows the name as the heading, the role and the bio", /<h1[^>]*>Anisia<\/h1>/.test(html) && html.includes("Head of Marketing") && html.includes("Writes about pricing and launches."))
    check("the avatar is drawn", /avatar\.jpg/.test(html))
    check("each link is rel=\"me noopener\", javascript: is dropped", (html.match(/rel="me noopener"/g) ?? []).length === 2 && !/javascript:/.test(html))
    check("each live post is a real link", html.includes('href="/blog/post-1"') && html.includes('href="/blog/post-2"'))
    check("older posts are a real <a> with rel next, numbered", /<a[^>]*href="\/blog\/author\/anisia\/page\/2"[^>]*rel="next"|<a[^>]*rel="next"[^>]*href="\/blog\/author\/anisia\/page\/2"/.test(html) && /aria-current="page"[^>]*>1</.test(html))
    check("breadcrumbs: Blog / Authors / Anisia, all real links but the last", /href="\/blog"[^>]*>Blog</.test(html) && /href="\/blog\/author"[^>]*>Authors</.test(html) && /aria-current="page"[^>]*>Anisia</.test(html))
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    const profile = lds.find((l) => l["@type"] === "ProfilePage")
    const crumbs = lds.find((l) => l["@type"] === "BreadcrumbList")
    check("ProfilePage with the Person as its main entity", profile?.mainEntity?.["@type"] === "Person" && profile.mainEntity.name === "Anisia" && profile.mainEntity.jobTitle === "Head of Marketing" && profile.url === "https://storelib.com/blog/author/anisia", profile)
    check("  sameAs is the profile's https links only", JSON.stringify(profile?.mainEntity?.sameAs) === '["https://www.linkedin.com/in/anisia"]', profile?.mainEntity?.sameAs)
    check("  its picture and description", profile?.mainEntity?.image === "https://storelib.com/media/x/avatar.jpg" && profile.mainEntity.description === "Writes about pricing and launches." && profile.dateModified === "2026-10-01T10:00:00Z")
    check("BreadcrumbList: Blog > Authors > Anisia", JSON.stringify(crumbs?.itemListElement.map((i: Any) => [i.name, i.item])) === JSON.stringify([["Blog", "https://storelib.com/blog"], ["Authors", "https://storelib.com/blog/author"], ["Anisia", "https://storelib.com/blog/author/anisia"]]), crumbs)
    check("no rating, no review, no FAQ in the markup", !/AggregateRating|"Review"|FAQPage|HowTo/.test(JSON.stringify(lds)))

    const meta = blogAuthorMetadataFor({ author, posts: [post(1)], total: 1, page: 1, pages: 1 }) as Any
    check("metadata: its own canonical, Open Graph at the same address, indexable", meta.alternates.canonical === "https://storelib.com/blog/author/anisia" && meta.openGraph.url === "https://storelib.com/blog/author/anisia" && meta.robots.index === true && meta.title.absolute === "Anisia | Storelib Blog")
    const page2 = blogAuthorMetadataFor({ author, posts: [post(1)], total: 51, page: 2, pages: 2 }) as Any
    check("  page 2 names itself canonical", page2.alternates.canonical === "https://storelib.com/blog/author/anisia/page/2" && /page 2/.test(page2.title.absolute))
    const empty = blogAuthorMetadataFor({ author, posts: [], total: 0, page: 1, pages: 1 }) as Any
    check("an author with no live post is noindex, follow", empty.robots.index === false && empty.robots.follow === true)
    check("no page (unknown slug, no table) is a noindex Not found", (blogAuthorMetadataFor(null) as Any).robots.index === false)
    check("the description is the bio, or a plain line", authorDescription(author) === author.bio && authorDescription({ name: "Jo", role: "", bio: "" }) === "Articles by Jo on the Storelib Blog.")
    const emptyHtml = renderToStaticMarkup(createElement(BlogAuthorView, { author: { ...author, links: [] }, posts: [], total: 0, page: 1, pages: 1 }))
    check("  and its page says so, with a link to the blog", /No published articles yet/.test(emptyHtml) && !/data-blog-pages/.test(emptyHtml))
    const team = blogAuthorJsonLd({ path: "/blog/author/storelib-team", name: "Storelib Team", organization: true })
    check("a team byline's page is about Storelib the Organization", (team.mainEntity as Any)["@type"] === "Organization" && (team.mainEntity as Any).name === "Storelib")
    check("authorSameAs: https, each once, nothing else", JSON.stringify(authorSameAs([{ url: "https://x.com/a" }, { url: "https://x.com/a" }, { url: "http://y.com" }, { url: "ftp://z.com" }, { url: "https://" }])) === '["https://x.com/a"]')

    const layout = code("app/(storelib)/(marketing)/blog/author/[slug]/layout.tsx")
    check("an unknown slug or a missing table is a 404 before anything streams", /readBlogAuthorBySlug\(/.test(layout) && /notFound\(\)/.test(layout))
    const postTs = code("lib/blog/post.ts")
    const bySlug = postTs.slice(postTs.indexOf("export const readBlogAuthorBySlug"), postTs.indexOf("export const readBlogAuthorPosts"))
    check("  readBlogAuthorBySlug answers null on any error (no table) and checks the slug first", /if \(error \|\| !data\) return null/.test(bySlug) && /catch \{\s*return null/.test(bySlug) && /\^\[a-z0-9\]/.test(bySlug))
    const authorPosts = postTs.slice(postTs.indexOf("export const readBlogAuthorPosts"), postTs.indexOf("export async function readBlogAuthorsWithPosts"))
    check("  the posts are LIVE: published and liveDateFilter", /\.eq\("is_published", true\)/.test(authorPosts) && /\.or\(liveDateFilter\(\)\)/.test(authorPosts) && /\.eq\("author_id", authorId\)/.test(authorPosts))
    const withPosts = postTs.slice(postTs.indexOf("export async function readBlogAuthorsWithPosts"))
    check("  the sitemap's authors read live posts only, and are null with no table", /\.or\(liveDateFilter\(\)\)/.test(withPosts) && /return null/.test(withPosts))
    const older = code("app/(storelib)/(marketing)/blog/author/[slug]/page/[page]/layout.tsx")
    check("page 1 of the older pages is a 308 to the author's address, past the last a 404", /permanentRedirect\(`\/blog\/author\/\$\{slug\}`\)/.test(older) && /notFound\(\)/.test(older))
    const index = code("app/(storelib)/(marketing)/blog/author/page.tsx")
    check("/blog/author is a 404 when there is no table", /if \(!authors\) notFound\(\)/.test(index))
    const indexHtml = renderToStaticMarkup(createElement(BlogAuthorsIndexView, { authors: [{ ...author, count: 3 }] }))
    check("  and lists each author with a real link and a count", indexHtml.includes('href="/blog/author/anisia"') && /3 articles/.test(indexHtml))
    check("  noindex while nobody has a post", (blogAuthorsIndexMetadata([]) as Any).robots.index === false && (blogAuthorsIndexMetadata(null) as Any).robots.index === false)

    const article = renderToStaticMarkup(createElement(ArticleView, { data: { slug: "x", url: "https://storelib.com/blog/x", title: "T", excerpt: "", category: "", published_at: "2026-10-01T00:00:00Z", updated_at: null, cover: null, byline: "Anisia - Head of Marketing", author, authorHref: "/blog/author/anisia", blocks: [{ id: "a", type: "p", html: "Hello" }] as Block[], cta: "digital", related: [], previous: null, next: null } }))
    check("the byline links the author page", /data-blog-byline-author=""/.test(article) && /<a href="\/blog\/author\/anisia" rel="author"[^>]*data-blog-byline-author/.test(article))
    check("the author box links it too, and its links are rel=\"me noopener\"", /All articles by Anisia/.test(article) && (article.match(/rel="me noopener"/g) ?? []).length >= 1)
    const noProfile = renderToStaticMarkup(createElement(ArticleView, { data: { slug: "x", url: "u", title: "T", excerpt: "", category: "", published_at: null, updated_at: null, cover: null, byline: "Storelib Team", blocks: [] as Block[], cta: "digital", related: [], previous: null, next: null } }))
    check("  a post with no profile keeps #author and links no author page", /href="#author"/.test(noProfile) && !/\/blog\/author\//.test(noProfile))
    const slugPage = code("app/(storelib)/(marketing)/blog/[slug]/page.tsx")
    check("the article page hands the author page to the byline and the BlogPosting", /authorUrl: profile\?\.slug \? blogAuthorPath\(profile\.slug\) : null/.test(slugPage) && /authorHref: profile\?\.slug \? blogAuthorPath\(profile\.slug\) : null/.test(slugPage))
    const sd = blogPostingJsonLd({ url: "https://storelib.com/blog/x", title: "T", description: "D", images: [], fallbackImage: "/og.png", published: "2026-01-01", modified: null, byline: null, profile: author, authorUrl: "/blog/author/anisia" }) as Any
    check("  the BlogPosting author Person has the author page as url", sd.author["@type"] === "Person" && sd.author.url === "https://storelib.com/blog/author/anisia")

    const authors = [
      { slug: "anisia", posts: Array.from({ length: BLOG_PAGE_SIZE + 1 }, (_, i) => ({ published_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), updated_at: null })) },
      { slug: "nobody", posts: [] },
    ]
    const rows = blogAuthorSitemapEntries(authors)
    check("sitemap: the authors index and each page of an author with live posts, dated", JSON.stringify(rows.map((r) => r.url)) === JSON.stringify(["https://storelib.com/blog/author", "https://storelib.com/blog/author/anisia", "https://storelib.com/blog/author/anisia/page/2"]) && rows.every((r) => !!r.lastModified), rows)
    check("  an author with no live post is not listed", !rows.some((r) => r.url.includes("nobody")))
    check("  none at all when nobody has a post (before part 345 too)", blogAuthorSitemapEntries([]).length === 0 && blogAuthorSitemapEntries([{ slug: "x", posts: [] }]).length === 0)
    const all = blogSitemapEntries([{ slug: "a", published_at: "2026-01-01", updated_at: null, category: "Growth" }], ["Growth"], () => "growth", [{ slug: "anisia", posts: [{ published_at: "2026-01-01", updated_at: null }] }])
    check("  blogSitemapEntries takes them, after the posts", all.some((r) => r.url === "https://storelib.com/blog/author/anisia") && all.at(-1)?.url === "https://storelib.com/blog/author/anisia")
    check("  and stays as it was without them", JSON.stringify(blogSitemapEntries([{ slug: "a", published_at: "2026-01-01", updated_at: null }], [], () => "")) === JSON.stringify(blogSitemapEntries([{ slug: "a", published_at: "2026-01-01", updated_at: null }], [], () => "", [])))
    const sitemaps = code("lib/seo/sitemaps.ts")
    check("lib/seo/sitemaps.ts passes the authors with live posts, minus noindex posts, and none when the read fails", /readBlogAuthorsWithPosts\(unlisted\)\) \?\? \[\]/.test(sitemaps) && /categorySlugOf\(name, blogCategories\), blogAuthors\), posts, blogCategories\)/.test(sitemaps))
    check("saving a post or an author redraws the author pages", /revalidatePath\("\/blog\/author", "layout"\)/.test(code("lib/blog/admin-http.ts")) && /revalidatePath\("\/blog\/author", "layout"\)/.test(code("lib/blog/went-live.ts")))
  }

  console.log("\n2. Help Center markup")
  {
    const types = new Set<string>()
    for (const cat of HELP_CATEGORIES) for (const a of helpArticlesIn(cat.slug)) for (const g of (helpArticleJsonLd(a, cat) as Any)["@graph"]) types.add(g["@type"])
    check("every help article prints TechArticle and BreadcrumbList, nothing else", [...types].sort().join(",") === "BreadcrumbList,TechArticle", [...types])
    check("lib/help/structured-data.ts builds no FAQPage or HowTo", !/FAQPage|HowTo|helpFaq|helpHowTo/.test(code("lib/help/structured-data.ts")))
    check("the order problems page prints breadcrumbs, not an FAQPage", !/FAQPage/.test(code("app/(storelib)/help/questions/page.tsx")) && /helpBreadcrumbs\(/.test(code("app/(storelib)/help/questions/page.tsx")))
    check("no article still asks for the old markup", !/\bfaq: true|howTo:/.test(code("lib/help/articles.ts") + code("lib/help/physical-articles.ts") + code("lib/help/offer-articles.ts")))
  }

  console.log("\n3. File sizes in help and marketing copy")
  {
    const files = helpArticle("products", "files-and-delivery")!
    const limit = formatLimit(MAX_UPLOAD_BYTES.product_file)
    check("the product file limit is 10 GB in the upload policy", limit === "10 GB")
    check("Files and how buyers receive them says the policy's limit", articleText(files).includes(`Each file can be up to ${limit}.`) && !/5 GB/.test(articleText(files)))
    check("the marketing facts use the same number", PRODUCT_FILE_LIMIT === limit)
    check("  and no copy types its own number for it", !/each file up to 10 GB|each up to 10 GB|can be up to 10 GB/.test(code("lib/marketing/facts.ts") + code("lib/marketing/use-cases.ts")))
    const allHelp = HELP_CATEGORIES.flatMap((c) => helpArticlesIn(c.slug)).map(articleText).join("\n")
    check("no help article says 5 GB", !/\b5 GB\b/.test(allHelp))
  }

  console.log("\n4. Storelib's profiles")
  {
    check("one typed list; nothing is listed until it is confirmed", Array.isArray(STORELIB_SOCIAL) && STORELIB_SOCIAL.length === 0)
    check("Organization sameAs is that list, and absent while it is empty", JSON.stringify(STORELIB_SAME_AS) === JSON.stringify(STORELIB_SOCIAL.map((p) => p.url)) && !("sameAs" in storelibOrganizationJsonLd()))
    const footer = code("components/marketing/footer.tsx")
    check("the footer links no bare network home page", !/href: "https:\/\/(facebook|instagram|x|tiktok|youtube)\.com"/.test(footer))
    check("  its icons come from STORELIB_SOCIAL, rel=\"me noopener\", a new tab, a label", /STORELIB_SOCIAL\.filter/.test(footer) && /rel="me noopener"/.test(footer) && /target="_blank"/.test(footer) && /aria-label=\{label\}/.test(footer))
    check("  and the row is not drawn with none", /\{SOCIAL\.length \? \(/.test(footer))
    check("how to add a profile is written beside the list", /TO ADD A PROFILE/.test(read("lib/seo/storelib-social.ts")))
    const blog = ["app/(storelib)/(marketing)/blog/_components/article-view.tsx", "app/(storelib)/(marketing)/blog/[slug]/page.tsx", "app/(storelib)/(marketing)/blog/_blog-author.tsx"].map(read).join("\n")
    check("the blog names no unverified Storelib profile", !/twitter\.com\/storelib|linkedin\.com\/company\/storelib|x\.com\/storelib/.test(blog))
  }

  console.log("\n5. Copy to Storelib: the address")
  {
    check("https is fine", copyImageUrlProblem("https://stan.store/a.png") === null && copyImageUrlProblem("https://cdn.example.com:443/a.jpg") === null)
    check("http, ftp, data, file and javascript are refused", ["http://stan.store/a.png", "ftp://x.com/a", "data:image/png;base64,AAAA", "file:///etc/passwd", "javascript:alert(1)"].every((u) => copyImageUrlProblem(u) !== null))
    check("a user or password in it is refused", copyImageUrlProblem("https://a:b@stan.store/x.png") !== null)
    check("another port is refused", copyImageUrlProblem("https://stan.store:8443/x.png") !== null)
    check("not a string, empty, too long, or not a URL is refused", [undefined, 1, "", "   ", "nope", `https://a.com/${"x".repeat(2100)}`].every((u) => copyImageUrlProblem(u) !== null))
    const privateLiterals = [
      "https://127.0.0.1/a.png",
      "https://127.1.2.3/a.png",
      "https://10.0.0.1/a.png",
      "https://172.16.0.1/a.png",
      "https://172.31.255.255/a.png",
      "https://192.168.1.1/a.png",
      "https://169.254.169.254/latest/meta-data/",
      "https://0.0.0.0/a.png",
      "https://100.64.0.1/a.png",
      "https://[::1]/a.png",
      "https://[::]/a.png",
      "https://[fc00::1]/a.png",
      "https://[fd12:3456::1]/a.png",
      "https://[fe80::1]/a.png",
      "https://[febf::1]/a.png",
      "https://[::ffff:127.0.0.1]/a.png",
      "https://[::ffff:169.254.169.254]/a.png",
      "https://2130706433/a.png",
      "https://0x7f000001/a.png",
      "https://017700000001/a.png",
      "https://localhost/a.png",
      "https://metadata.google.internal/a.png",
      "https://printer.local/a.png",
      "https://intranet/a.png",
    ]
    const let_through = privateLiterals.filter((u) => copyImageUrlProblem(u) === null)
    check("every private, loopback, link local and metadata address is refused, however it is written", let_through.length === 0, let_through)
    check("public IPs are fine", copyImageUrlProblem("https://93.184.216.34/a.png") === null && copyImageUrlProblem("https://[2606:4700::1111]/a.png") === null && copyImageUrlProblem("https://172.32.0.1/a.png") === null && copyImageUrlProblem("https://11.0.0.1/a.png") === null)
    check("a name resolving to a private address is refused", ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.0.10", "169.254.169.254", "::1", "fc00::5", "fe80::1", "::ffff:10.0.0.1"].every((a) => addressesProblem([a]) !== null))
    check("  one private address among public ones is enough", addressesProblem(["93.184.216.34", "10.0.0.1"]) !== null)
    check("  no address at all is refused", addressesProblem([]) !== null)
    check("  public addresses pass", addressesProblem(["93.184.216.34", "2606:4700::1111"]) === null)
    check("the limits: 10 MB, 10 seconds, three redirects", COPY_IMAGE_MAX_BYTES === 10 * 1024 * 1024 && COPY_IMAGE_TIMEOUT_MS === 10_000 && COPY_IMAGE_MAX_REDIRECTS === 3)
  }

  console.log("\n6. Copy to Storelib: the content")
  {
    const ok = (ct: string, bytes: Uint8Array) => {
      const r = imageContentProblem(ct, bytes)
      return "mime" in r ? r.mime : null
    }
    check("JPEG, PNG, WebP, GIF and AVIF pass when the bytes agree", ok("image/jpeg", JPG) === "image/jpeg" && ok("image/png", PNG) === "image/png" && ok("image/webp", WEBP) === "image/webp" && ok("image/gif", GIF_HEAD) === "image/gif" && ok("image/avif", AVIF_HEAD) === "image/avif")
    check("  with parameters and old spellings", ok("image/jpeg; charset=binary", JPG) === "image/jpeg" && ok("IMAGE/JPG", JPG) === "image/jpeg" && declaredType("image/x-png") === "image/png")
    check("SVG is refused, declared or sniffed", "problem" in imageContentProblem("image/svg+xml", SVG) && "problem" in imageContentProblem("image/png", SVG) && /SVG/.test((imageContentProblem("image/png", SVG) as Any).problem))
    check("a declared type that is not one of the five is refused", ["text/html", "application/octet-stream", "", "image/bmp", "image/tiff", "image/heic"].every((ct) => "problem" in imageContentProblem(ct, PNG)))
    check("bytes that are not the declared picture are refused", "problem" in imageContentProblem("image/png", HTML) && "problem" in imageContentProblem("image/png", JPG) && "problem" in imageContentProblem("image/jpeg", PNG))
  }

  console.log("\n7. Copy to Storelib: the download")
  {
    const calls: Any[] = []
    const answer = (status: number, ct: string, body: Uint8Array) => new Response(Buffer.from(body), { status, headers: { "content-type": ct } })
    const deps = (over: Partial<CopyDeps> & { ip?: string[]; res?: () => Promise<Response> } = {}): CopyDeps => ({
      resolve: async () => over.ip ?? ["93.184.216.34"],
      fetch: (async (url: string, opts: Any) => {
        calls.push({ url, opts })
        return over.res ? over.res() : answer(200, "image/png", PNG)
      }) as Any,
      store: (async (pic: Any) => ({ ok: true, url: `https://storelib.com/media/lead-form-files-v2/blog/1_x.${pic.ext}` })) as Any,
      ...over,
    })
    const r = await copyExternalImage("https://stan.store/a.png", deps())
    check("a public PNG is copied and its Storelib address answered", r.ok && r.url === "https://storelib.com/media/lead-form-files-v2/blog/1_x.png", r)
    check("  fetched https only, 10 MB, 10 s, at most 3 redirects", calls[0]?.opts.httpsOnly === true && calls[0].opts.maxBytes === COPY_IMAGE_MAX_BYTES && calls[0].opts.timeoutMs === 10_000 && calls[0].opts.maxRedirects === 3)
    calls.length = 0
    const priv = await downloadExternalImage("https://evil.example.com/a.png", deps({ ip: ["169.254.169.254"] }))
    check("a name that resolves to the metadata address is refused before any request", !priv.ok && calls.length === 0)
    const priv6 = await downloadExternalImage("https://evil.example.com/a.png", deps({ ip: ["::1"] }))
    check("  and one that resolves to ::1", !priv6.ok && calls.length === 0)
    const unresolved = await downloadExternalImage("https://nowhere.example/a.png", deps({ resolve: async () => Promise.reject(new Error("ENOTFOUND")) }))
    check("a name that does not resolve is refused", !unresolved.ok)
    const svg = await downloadExternalImage("https://stan.store/a.svg", deps({ res: async () => answer(200, "image/svg+xml", SVG) }))
    check("an SVG answer is refused", !svg.ok && /SVG/.test((svg as Any).error))
    const lie = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => answer(200, "image/png", HTML) }))
    check("HTML that says it is a PNG is refused", !lie.ok)
    const big = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => Promise.reject(new Error("larger than allowed")) }))
    check("over 10 MB while streaming is refused, with the limit named", !big.ok && /10 MB/.test((big as Any).error))
    const slow = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => Promise.reject(new Error("timed out")) }))
    check("a site slower than 10 s is refused", !slow.ok && /10 seconds/.test((slow as Any).error))
    const hops = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => Promise.reject(new Error("Too many redirects")) }))
    check("more than three redirects is refused", !hops.ok && /redirects/.test((hops as Any).error))
    const toPrivate = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => Promise.reject(new Error("Refused: a private address")) }))
    check("a redirect to a private address is refused", !toPrivate.ok && /public internet/.test((toPrivate as Any).error))
    const toHttp = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => Promise.reject(new Error("Refused: not https")) }))
    check("a redirect to http is refused", !toHttp.ok && /not https/.test((toHttp as Any).error))
    const status = await downloadExternalImage("https://stan.store/a.png", deps({ res: async () => answer(403, "text/html", HTML) }))
    check("a non-200 answer is refused with its status", !status.ok && /403/.test((status as Any).error))
    const http = await downloadExternalImage("http://stan.store/a.png", deps())
    check("an http address is refused before anything is asked", !http.ok)
    const storeFails = await copyExternalImage("https://stan.store/a.png", deps({ store: (async () => ({ ok: false, error: { message: "bucket" } })) as Any }))
    check("a storage failure says nothing was changed", !storeFails.ok && /Nothing was changed/.test((storeFails as Any).error))

    /* The real fetch honours httpsOnly on every hop. */
    const pf = code("lib/api/public-fetch.ts")
    check("lib/api/public-fetch checks httpsOnly on each address it asks, redirects included", /opts\.httpsOnly && !\/\^https:\/i\.test\(current\) \? "not https"/.test(pf) && /for \(let hop = 0; ; hop\+\+\)/.test(pf) && /lookup: publicLookup/.test(pf))
  }

  console.log("\n8. Copy to Storelib: a post")
  {
    const blocks: Block[] = [
      { id: "i1", type: "img", url: "https://stan.store/a.png" },
      { id: "i2", type: "img", url: "https://storelib.com/media/x.png" },
      { id: "i3", type: "img", url: "/images/blog/a.svg" },
      { id: "p", type: "p", html: "Hi" },
      { id: "i4", type: "img", url: "https://stan.store/a.png" },
    ]
    const meta = { cover_image_url: "https://www.thrivecart.com/c.jpg", og_image_url: "https://abc.supabase.co/storage/v1/object/public/x.png" }
    const found = externalImagesOf(meta, blocks, null)
    check("the pictures on other sites: the cover and the stan.store picture, once, with where they are used", JSON.stringify(found.map((f) => [f.url, f.where])) === JSON.stringify([["https://www.thrivecart.com/c.jpg", ["cover"]], ["https://stan.store/a.png", ["i1", "i4"]]]), found)
    check("Storelib's own hosts and paths are not external", !isExternalImage("https://storelib.com/media/a.png", null) && !isExternalImage("https://andrew.storelib.com/a.png", null) && !isExternalImage("/images/a.png", null) && !isExternalImage("https://x.supabase.co/a.png", null) && !isExternalImage("https://cdn.storelib.app/a.png", "cdn.storelib.app") && isExternalImage("https://notstorelib.com/a.png", null))
    check("the notice names the hosts", hostList(found) === "thrivecart.com and stan.store" && hostList([...found, { url: "u", host: "a.com", where: [] }, { url: "v", host: "b.com", where: [] }]) === "thrivecart.com, stan.store, a.com and 1 more")
    const moved = new Map([["https://stan.store/a.png", "https://storelib.com/media/n.png"]])
    const swapped = replaceImageUrls(meta, blocks, moved)
    check("replacing swaps only the copied addresses, everywhere they are used", swapped.changed && swapped.blocks[0].url === "https://storelib.com/media/n.png" && swapped.blocks[4].url === "https://storelib.com/media/n.png" && swapped.blocks[1] === blocks[1] && swapped.meta.cover_image_url === meta.cover_image_url)

    /* copyPostImages over a database that answers like PostgREST. */
    const row = { id: "11111111-1111-4111-8111-111111111111", title: "Fees", slug: "fees", is_published: true, published_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", draft_saved_at: null, draft_meta: null, draft_content: null, cover_image_url: "https://www.thrivecart.com/c.jpg", og_image_url: null, content: [{ id: "i1", type: "img", url: "https://stan.store/a.png", alt: "x" }, { id: "p", type: "p", html: "Hi" }] }
    const updates: Any[] = []
    const fake = (rowNow: Any, matches = true) => ({
      from: () => {
        const q: Any = { filters: [] as Any[] }
        q.select = () => q
        q.eq = (k: string, v: unknown) => (q.filters.push(["eq", k, v]), q)
        q.is = (k: string, v: unknown) => (q.filters.push(["is", k, v]), q)
        q.update = (u: Any) => ((q.update_ = u), q)
        q.maybeSingle = async () => {
          if (q.update_) {
            updates.push({ update: q.update_, filters: q.filters })
            return { data: matches ? { id: rowNow.id } : null, error: null }
          }
          return { data: rowNow, error: null }
        }
        return q
      },
    })
    const deps: CopyDeps = {
      resolve: async () => ["93.184.216.34"],
      fetch: (async (url: string) => (url.includes("stan.store") ? new Response("no", { status: 403, headers: { "content-type": "text/html" } }) : new Response(Buffer.from(JPG), { status: 200, headers: { "content-type": "image/jpeg" } }))) as Any,
      store: (async () => ({ ok: true, url: "https://storelib.com/media/lead-form-files-v2/blog/9_c.jpg" })) as Any,
    }
    const report = await copyPostImages(fake(row) as Any, row.id, deps)
    check("a post: the cover copied, the refused picture reported with its reason", report.copied === 1 && report.failed.length === 1 && /403/.test(report.failed[0].error) && report.title === "Fees", report)
    const u = updates[0]
    check("  one update with only the cover changed, made from the version read", u && Object.keys(u.update).join(",") === "cover_image_url" && u.update.cover_image_url === "https://storelib.com/media/lead-form-files-v2/blog/9_c.jpg" && u.filters.some((f: Any) => f[1] === "updated_at" && f[2] === row.updated_at) && u.filters.some((f: Any) => f[0] === "is" && f[1] === "draft_saved_at"), u)
    updates.length = 0
    const withDraft = { ...row, cover_image_url: null, draft_saved_at: "2026-03-01T00:00:00Z", draft_meta: { title: "Fees", cover_image_url: "https://www.thrivecart.com/d.jpg" }, draft_content: [{ id: "i9", type: "img", url: "https://www.thrivecart.com/e.jpg" }], content: [] }
    const r2 = await copyPostImages(fake(withDraft) as Any, row.id, deps)
    check("  a draft's pictures are copied too, into the draft columns", r2.copied === 2 && updates[0]?.update.draft_meta?.cover_image_url?.startsWith("https://storelib.com/media/") && updates[0].update.draft_content[0].url.startsWith("https://storelib.com/media/") && updates[0].update.draft_meta.title === "Fees" && !("content" in updates[0].update), updates[0])
    const stale = await copyPostImages(fake(row, false) as Any, row.id, deps)
    check("  saved somewhere else meanwhile: nothing is written over it, and the report says so", stale.copied === 0 && /somewhere else/.test(stale.error ?? ""))
    const none = await copyPostImages(fake({ ...row, cover_image_url: "/images/a.png", content: [] }) as Any, row.id, deps)
    check("  a post with nothing on other sites is left alone", none.none === true && none.copied === 0)
  }

  console.log("\n9. The routes and the editor")
  {
    const route = code("app/api/admin/blog/copy-image/route.ts")
    const upload = code("app/api/admin/blog/upload/route.ts")
    check("the copy route checks the admin first, as the upload route does", /if \(!\(await isAdminAuthenticated\(\)\)\) \{\s*return blogJson\(\{ error: "Unauthorized" \}, 401\)/.test(route) && route.indexOf("isAdminAuthenticated()") < route.indexOf("req.json()") && /isAdminAuthenticated\(\)/.test(upload))
    check("  one picture, or a few posts a request, each in turn", /copyExternalImage\(body\.url\)/.test(route) && /\.slice\(0, 10\)/.test(route) && /for \(const id of ids\)/.test(route) && /await copyPostImages\(supabase, id\)/.test(route))
    check("  both store where the editor's uploads go", /storeBlogPicture\(picture\)/.test(upload) && /store: storeBlogPicture/.test(code("lib/blog/copy-image.ts")) && /preparePublicImage\(bytes, COPY_IMAGE_MAX_BYTES\)/.test(code("lib/blog/copy-image.ts")))
    const editor = code("app/(storelib)/admin/blog/posts/_editor-client.tsx")
    check("the editor shows the notice for the cover, the share image and picture blocks, and copies one at a time", /externalImagesOf\(meta, (calmBlocks|blocks)\)/.test(editor) && /<ExternalImagesNotice/.test(editor) && /for \(const \[i, img\] of list\.entries\(\)\)/.test(editor) && /Copy to Storelib/.test(editor))
    const list = code("app/(storelib)/admin/blog/_list-client.tsx")
    check("the list's bulk action sends one post a request, in turn, and lists what happened to each", /Copy external images/.test(list) && /for \(const \[i, id\] of ids\.entries\(\)\)/.test(list) && /body: JSON\.stringify\(\{ ids: \[id\] \}\)/.test(list) && /data-copy-report/.test(list))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
